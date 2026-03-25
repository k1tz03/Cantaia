import { NextRequest, NextResponse } from "next/server";
import { buildPVGeneratePrompt, MODEL_FOR_TASK, classifyAIError } from "@cantaia/core/ai";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackApiUsage } from "@cantaia/core/tracking";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
import { checkUsageLimit } from "@cantaia/config/plan-features";

const USE_MOCK_PV = process.env.USE_MOCK_PV === "true";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const usageCheck = await checkUsageLimit(admin, userProfile.organization_id, orgData?.subscription_plan || "trial");
    if (!usageCheck.allowed) {
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

    if (!transcript) {
      // Fetch meeting + project from DB (with org check)
      const { data: meeting } = await admin
        .from("meetings")
        .select("*, projects!inner(name, code, address, city, organization_id)")
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

      if (!meeting.transcription_raw) {
        return NextResponse.json(
          { error: "No transcription available for this meeting" },
          { status: 400 }
        );
      }

      transcript = meeting.transcription_raw;
      const project = meeting.projects as any;
      project_name = project?.name || "Projet";
      project_code = project?.code || "";
      meeting_number = meeting.meeting_number || 0;
      meeting_date =
        meeting.meeting_date ||
        new Date().toLocaleDateString("fr-CH");
      location = meeting.location || project?.address || "";
      participants = JSON.stringify(meeting.participants || []);
    }

    if (process.env.NODE_ENV === "development") console.log(
      `[GeneratePV] Generating PV for meeting ${meeting_id}`,
      `transcript: ${transcript.length} chars`
    );

    if (USE_MOCK_PV || !process.env.ANTHROPIC_API_KEY) {
      if (process.env.NODE_ENV === "development") console.log("[GeneratePV] Using mock PV generation");
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

    // Real Claude PV generation
    const prompt = buildPVGeneratePrompt({
      project_name: project_name || "Projet",
      project_code: project_code || "",
      meeting_number: meeting_number || 0,
      meeting_date: meeting_date || "",
      location: location || "",
      participants: participants || "",
      transcription: transcript,
      language,
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
      const err = classifyAIError(aiError);
      return NextResponse.json({ error: err.message }, { status: err.status });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
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
      return NextResponse.json(
        { error: "Failed to parse PV content", raw: textBlock.text },
        { status: 502 }
      );
    }

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
