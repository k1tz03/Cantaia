import { NextRequest, NextResponse } from "next/server";
import { buildPVGeneratePrompt, MODEL_FOR_TASK, classifyAIError } from "@cantaia/core/ai";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackApiUsage } from "@cantaia/core/tracking";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
import { checkUsageLimit } from "@cantaia/config/plan-features";
import { insufficientCreditsResponse } from "@/lib/credits";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  assignPersistentNumbers,
  buildCarryOverSection,
  buildPVPromptSupplement,
  loadPreviousOpenPoints,
  loadPVTemplate,
  prependCarryOverSection,
  type PVCarriedPoint,
} from "@/app/api/pv/_shared/pv-circulation";

const USE_MOCK_PV = process.env.USE_MOCK_PV === "true";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Throttle expensive PV generations per user (credits are the primary gate,
    // this stops burst abuse before the model call).
    const rl = await rateLimit(`ai:user:${user.id}`, { limit: 20, windowSec: 3600 });
    if (!rl.allowed) {
      return rateLimitResponse(rl);
    }

    const { data: body, error: parseError } = await parseBody(request);
    if (parseError || !body) {
      return NextResponse.json(
        { error: parseError || "Invalid request" },
        { status: 400 }
      );
    }

    const validationError = validateRequired(body, ["meeting_id"]);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const admin = createAdminClient();
    const { meeting_id } = body;

    // Get user's organization
    const { data: userProfile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "User organization not found" }, { status: 403 });
    }

    // Check AI usage limit
    const { data: orgData } = await admin
      .from("organizations")
      .select("subscription_plan")
      .eq("id", userProfile.organization_id)
      .single();

    const usageCheck = await checkUsageLimit(admin, userProfile.organization_id, orgData?.subscription_plan || "trial", "pv_generate");
    if (!usageCheck.allowed) {
      if (usageCheck.insufficient_credits) {
        return insufficientCreditsResponse(usageCheck.required_credits ?? 1, usageCheck.remaining_credits ?? 0);
      }
      return NextResponse.json(
        { error: "usage_limit_reached", current: usageCheck.current, limit: usageCheck.limit, required_plan: usageCheck.requiredPlan },
        { status: 429 }
      );
    }

    // If transcript is passed directly, use it. Otherwise fetch from DB.
    let transcript = body.transcript;
    let project_name = body.project_name;
    let project_code = body.project_code;
    let meeting_number = body.meeting_number;
    let meeting_date = body.meeting_date;
    let location = body.location;
    let participants = body.participants;
    const language = body.language || "fr";
    /** Project the meeting belongs to — needed for the n-1 carry-over lookup. */
    let meetingProjectId: string | null = body.project_id ?? null;

    // Remembered so a failed generation can restore it instead of leaving the
    // meeting stuck in "generating_pv" forever.
    let previousStatus: string | null = null;

    /** Restore the meeting's pre-generation status after a failure. */
    const restoreStatus = async () => {
      if (!previousStatus) return;
      const { error: restoreErr } = await admin
        .from("meetings")
        .update({ status: previousStatus } as any)
        .eq("id", meeting_id);
      if (restoreErr) {
        console.error("[GeneratePV] Failed to restore meeting status:", restoreErr);
      }
    };

    // Always fetch the meeting + project and verify org ownership BEFORE any
    // write — the org-check must be UNCONDITIONAL. Skipping it when `transcript`
    // is supplied in the body would let a caller overwrite pv_content on any
    // meeting id (IDOR): the DB update below is keyed solely on meeting_id.
    const { data: meeting } = await admin
      .from("meetings")
      .select("*, projects!inner(id, name, code, address, city, organization_id)")
      .eq("id", meeting_id)
      .maybeSingle();

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    // Verify meeting belongs to user's organization
    const meetingOrg = (meeting.projects as any)?.organization_id;
    if (meetingOrg !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    previousStatus = (meeting as any).status ?? null;
    const project = meeting.projects as any;
    meetingProjectId = meetingProjectId ?? (meeting as any).project_id ?? project?.id ?? null;

    // Prefer the caller-supplied transcript (fresh, un-persisted audio), else the
    // stored transcription. The meeting has already been org-verified above.
    if (!transcript) {
      if (!meeting.transcription_raw) {
        return NextResponse.json(
          { error: "No transcription available for this meeting" },
          { status: 400 }
        );
      }
      transcript = meeting.transcription_raw;
    }

    // Header metadata: caller overrides win, otherwise derive from the meeting.
    project_name = project_name || project?.name || "Projet";
    project_code = project_code || project?.code || "";
    meeting_number = meeting_number ?? meeting.meeting_number ?? 0;
    meeting_date = meeting_date || meeting.meeting_date || new Date().toLocaleDateString("fr-CH");
    location = location || meeting.location || project?.address || "";
    participants = participants || JSON.stringify(meeting.participants || []);

    if (process.env.NODE_ENV === "development") console.log(
      `[GeneratePV] Generating PV for meeting ${meeting_id}`,
      `transcript: ${transcript.length} chars`
    );

    // Mock PV is DEV-ONLY: in production a missing key must surface as an
    // error rather than persist a fictional PV over a real meeting.
    const useMockPv =
      process.env.NODE_ENV === "development" &&
      (USE_MOCK_PV || !process.env.ANTHROPIC_API_KEY);

    if (!useMockPv && !process.env.ANTHROPIC_API_KEY) {
      await restoreStatus();
      return NextResponse.json(
        { error: "Génération indisponible : la clé ANTHROPIC_API_KEY n'est pas configurée." },
        { status: 503 }
      );
    }

    if (useMockPv) {
      console.warn("[GeneratePV] DEV ONLY — using mock PV generation");
      const mockPV = {
        header: {
          project_name: project_name || "Projet Test",
          project_code: project_code || "TEST-001",
          meeting_number: meeting_number || 1,
          date: meeting_date || new Date().toLocaleDateString("fr-CH"),
          location: location || "Bureau",
          next_meeting_date: null,
          participants: [],
          absent: [],
          distribution: ["Tous les participants"],
        },
        sections: [
          {
            number: "1",
            title: "Tour de table / remarques générales",
            content:
              "Le responsable ouvre la séance et fait un tour de table. Aucune remarque particulière.",
            decisions: ["PV précédent approuvé."],
            actions: [],
          },
          {
            number: "2",
            title: "Avancement des travaux",
            content:
              "Discussion sur l'avancement général des travaux.",
            decisions: [],
            actions: [
              {
                description: "Mettre à jour le planning",
                responsible_name: "Direction des travaux",
                responsible_company: "",
                deadline: null,
                priority: "normal",
              },
            ],
          },
        ],
        next_steps: ["Suivi des actions ouvertes"],
        summary_fr:
          "Séance de suivi. Avancement conforme au planning. Actions de suivi attribuées.",
      };

      // Save mock PV to DB
      await admin
        .from("meetings")
        .update({ pv_content: mockPV as any, status: "review" } as any)
        .eq("id", meeting_id);

      return NextResponse.json({
        success: true,
        meeting_id,
        pv_content: mockPV,
      });
    }

    // ---- Org outline + points carried over from the previous séance --------
    // Both are appended to the shared prompt rather than merged into
    // `buildPVGeneratePrompt`, so @cantaia/core/ai/prompts.ts stays untouched.
    const { sections: templateSections, isCustom: hasCustomTemplate } = await loadPVTemplate(
      admin,
      userProfile.organization_id
    );

    let carriedPoints: PVCarriedPoint[] = [];
    let previousMeetingNumber: number | null = null;
    if (meetingProjectId) {
      const carried = await loadPreviousOpenPoints(admin, meetingProjectId, meeting_id);
      carriedPoints = carried.points;
      previousMeetingNumber = carried.previousMeetingNumber;
    }

    // Real Claude PV generation
    const prompt =
      buildPVGeneratePrompt({
        project_name: project_name || "Projet",
        project_code: project_code || "",
        meeting_number: meeting_number || 0,
        meeting_date: meeting_date || "",
        location: location || "",
        participants: participants || "",
        transcription: transcript,
        language,
      }) +
      buildPVPromptSupplement({
        // Only impose an outline the org actually chose — Cantaia's default is
        // already baked into the base prompt.
        template: hasCustomTemplate ? templateSections : null,
        carriedPoints,
        previousMeetingNumber,
      });

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90_000 });

    let response;
    try {
      response = await client.messages.create({
        model: MODEL_FOR_TASK.pv_generation,
        max_tokens: 8000,
        messages: [{ role: "user", content: [{ type: "text", text: prompt, cache_control: { type: "ephemeral" } }] }],
      });
    } catch (aiError: any) {
      console.error("[GeneratePV] AI error:", aiError?.message);
      await restoreStatus();
      const err = classifyAIError(aiError);
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      await restoreStatus();
      return NextResponse.json(
        { error: "No text response from Claude" },
        { status: 502 }
      );
    }

    // Parse JSON from response
    let pvContent;
    try {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in response");
      pvContent = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("[GeneratePV] Failed to parse PV JSON:", parseErr);
      await restoreStatus();
      return NextResponse.json(
        { error: "Failed to parse PV content", raw: textBlock.text },
        { status: 502 }
      );
    }

    // ---- Carry-over + persistent numbering ---------------------------------
    // Claude is told not to reproduce the inherited points, so the section is
    // added here rather than trusted to the model. `prependCarryOverSection`
    // is a no-op when the PV already carries one (regeneration).
    pvContent = prependCarryOverSection(
      pvContent,
      buildCarryOverSection(carriedPoints, meeting_number || 0)
    );

    // Numbers become {meeting_number}.{index} and are STORED: a point discussed
    // as "4.3" in the room must still be "4.3" after a section above it is
    // deleted, and must match the reference used in the next PV.
    pvContent.sections = assignPersistentNumbers(pvContent.sections, meeting_number || 0);

    // Save PV to DB
    await admin
      .from("meetings")
      .update({ pv_content: pvContent as any, status: "review" } as any)
      .eq("id", meeting_id);

    // Track API usage (fire-and-forget)
    trackApiUsage({
      supabase: admin,
      userId: user.id,
      organizationId: userProfile.organization_id,
      actionType: "pv_generate",
      apiProvider: "anthropic",
      model: MODEL_FOR_TASK.pv_generation,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      metadata: { meeting_id },
    }).catch(() => {});

    if (process.env.NODE_ENV === "development") console.log("[GeneratePV] Usage:", {
      action: "pv_generate",
      model: MODEL_FOR_TASK.pv_generation,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    if (process.env.NODE_ENV === "development") console.log(
      `[GeneratePV] Success: ${pvContent.sections?.length || 0} sections`
    );

    return NextResponse.json({
      success: true,
      meeting_id,
      pv_content: pvContent,
    });
  } catch (error) {
    console.error("[GeneratePV] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
