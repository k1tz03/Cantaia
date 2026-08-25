import { NextRequest, NextResponse } from "next/server";
import { requirePortalSession } from "@/lib/portal/session";

/** Bound free text typed on a shared PIN device: megabytes of text must never
 *  reach the table, the app view or the régie PDF. */
function asText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { valid, admin } = await requirePortalSession(projectId);
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // `*` on purpose: an explicit list including the migration-093 columns
    // would 400 the whole query on a database where 093 is not applied yet.
    // The PNG data URLs are dropped below — a date list does not need them.
    const { data: reports } = await (admin as any)
      .from("site_reports")
      .select("*")
      .eq("project_id", projectId)
      .order("report_date", { ascending: false })
      .limit(14);

    const light = (reports || []).map(
      ({ signature_data, conductor_signature_data, ...rest }: any) => ({
        ...rest,
        has_signature: Boolean(signature_data),
        has_conductor_signature: Boolean(conductor_signature_data),
      }),
    );

    return NextResponse.json({ reports: light });
  } catch (error) {
    console.error("[Portal Reports] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { valid, admin, userName } = await requirePortalSession(projectId);
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const reportDate = body.report_date || new Date().toISOString().split("T")[0];
    const authorName = (userName || asText(body.submitted_by_name, 120) || "").slice(0, 120);

    // Check if report already exists for this date + user
    const { data: existing } = await (admin as any)
      .from("site_reports")
      .select("id")
      .eq("project_id", projectId)
      .eq("report_date", reportDate)
      .eq("submitted_by_name", authorName)
      .single();

    if (existing) {
      return NextResponse.json({ error: "Report already exists for this date", report_id: existing.id }, { status: 409 });
    }

    const { data: report, error } = await (admin as any)
      .from("site_reports")
      .insert({
        project_id: projectId,
        report_date: reportDate,
        submitted_by_name: authorName,
        status: "draft",
        remarks: asText(body.remarks, 5000),
        weather: asText(body.weather, 200),
      })
      .select()
      .single();

    if (error) {
      console.error("[Portal Reports] POST error:", error);
      return NextResponse.json({ error: "Failed to create report" }, { status: 500 });
    }

    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    console.error("[Portal Reports] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
