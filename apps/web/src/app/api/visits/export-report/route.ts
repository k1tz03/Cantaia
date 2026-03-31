import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
import { generateVisitePdf, type VisiteData } from "@/lib/pdf/VisiteDocument";

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();

    // Get user's org for access control
    const { data: userRow } = await supabaseAdmin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!userRow?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { data: body, error: parseError } = await parseBody(request);
    if (parseError || !body) {
      return NextResponse.json(
        { error: parseError || "Invalid request" },
        { status: 400 }
      );
    }

    const validationError = validateRequired(body, ["visit_id"]);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const { visit_id } = body;

    // Load visit — scoped to user's organization
    const { data: visit, error: visitErr } = await supabaseAdmin
      .from("client_visits")
      .select("*")
      .eq("id", visit_id)
      .eq("organization_id", userRow.organization_id)
      .maybeSingle();

    if (visitErr || !visit) {
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }

    const typedVisit = visit as any;

    // Load organization name
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name")
      .eq("id", userRow.organization_id)
      .maybeSingle();
    const orgName = (org as any)?.name || "Cantaia";

    // Fetch photos
    let photos: VisiteData["photos"] = [];
    try {
      const { data: photoRows } = await (supabaseAdmin as any)
        .from("visit_photos")
        .select("photo_type, caption, location_description, ai_transcription")
        .eq("visit_id", visit_id)
        .eq("organization_id", userRow.organization_id)
        .order("sort_order", { ascending: true });
      if (photoRows) photos = photoRows;
    } catch {
      // visit_photos table may not exist yet
    }

    // Build VisiteData
    const data: VisiteData = {
      client_name: typedVisit.client_name ?? "",
      client_company: typedVisit.client_company,
      client_phone: typedVisit.client_phone,
      client_email: typedVisit.client_email,
      client_address: typedVisit.client_address,
      client_postal_code: typedVisit.client_postal_code,
      client_city: typedVisit.client_city,
      visit_date: typedVisit.visit_date,
      duration_minutes: typedVisit.duration_minutes,
      report: typedVisit.report ?? {},
      photos,
      orgName,
    };

    const buffer = await generateVisitePdf(data);

    // Upload to Supabase Storage as .pdf
    const clientSlug = (typedVisit.client_name ?? "client")
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 30);
    const dateStr = new Date(typedVisit.visit_date).toISOString().split("T")[0];
    const storagePath = `reports/${typedVisit.organization_id}/${visit_id}/rapport-visite-${clientSlug}-${dateStr}.pdf`;

    await supabaseAdmin.storage.from("audio").upload(storagePath, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

    // Update visit with report URL
    await supabaseAdmin
      .from("client_visits")
      .update({ report_pdf_url: storagePath })
      .eq("id", visit_id);

    const fileName = `Rapport-Visite-${clientSlug}-${dateStr}.pdf`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: unknown) {
    console.error("[VisitExport] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
