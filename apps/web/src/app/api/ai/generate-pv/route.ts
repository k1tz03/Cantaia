import { NextRequest, NextResponse } from "next/server";
import { buildPVGeneratePrompt } from "@cantaia/core/ai";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

const USE_MOCK_PV = process.env.USE_MOCK_PV === "true";

export async function POST(request: NextRequest) {
  try {
    const { data: body, error: parseError } = await parseBody(request);
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
    }

    const validationError = validateRequired(body, ["meeting_id", "transcript"]);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const {
      meeting_id,
      project_name,
      project_code,
      meeting_number,
      meeting_date,
      location,
      participants,
      transcript,
      language = "fr",
    } = body;

    console.log(
      `[GeneratePV] Generating PV for meeting ${meeting_id}`,
      `transcript: ${transcript.length} chars`
    );

    if (USE_MOCK_PV || !process.env.ANTHROPIC_API_KEY) {
      console.log("[GeneratePV] Using mock PV generation");
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
            content: "Le responsable ouvre la séance et fait un tour de table. Aucune remarque particulière.",
            decisions: ["PV précédent approuvé."],
            actions: [],
          },
          {
            number: "2",
            title: "Avancement des travaux",
            content: "Discussion sur l'avancement général des travaux.",
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
        summary_fr: "Séance de suivi. Avancement conforme au planning. Actions de suivi attribuées.",
      };

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
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });

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

    // Log API usage (full tracking with Supabase will be added when auth context is available)
    console.log("[GeneratePV] Usage:", {
      action: "pv_generate",
      model: "claude-sonnet-4-5-20250929",
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    console.log(`[GeneratePV] Success: ${pvContent.sections?.length || 0} sections`);

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
