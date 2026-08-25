import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { COUNTED_REPORT_STATUSES, normalizeSupplierName } from "@cantaia/core/financials";
import { signPhotoPaths, displayPhotoUrl } from "@/lib/portal/photos";

/**
 * GET /api/site-reports/delivery-notes
 * Delivery notes for the back-office.
 *
 * Suppliers used to be free text only: "Sablière SA", "Sabliere sa" and
 * "SABLIÈRE  SA" were three different suppliers in the summary, and none of
 * them could be joined to the `suppliers` directory. Notes are now resolved
 * against `site_report_entries.supplier_id` (migration 093) when present, and
 * grouped by the normalised name otherwise.
 *
 * Filters: `supplier_id` (exact, preferred) or `supplier` (legacy free text).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("organization_id").eq("id", user.id).single();
    if (!profile?.organization_id) return NextResponse.json({ error: "No org" }, { status: 400 });

    const { searchParams } = request.nextUrl;
    const projectId = searchParams.get("project_id");
    const supplier = searchParams.get("supplier");
    const supplierId = searchParams.get("supplier_id");
    const weekStart = searchParams.get("week_start");

    const { data: projects, error: projectsError } = await admin
      .from("projects")
      .select("id, name, code")
      .eq("organization_id", profile.organization_id)
      .order("name");

    if (projectsError) {
      console.error("[Site Reports Notes] Projects error:", projectsError.message);
      return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
    }

    const projectIds = (projects || []).map((p: any) => p.id);
    if (projectIds.length === 0) return NextResponse.json({ notes: [], projects: [], suppliers: [] });

    let reportQuery = (admin as any)
      .from("site_reports")
      .select("id, project_id, report_date, submitted_by_name")
      .in("project_id", projectIds as string[])
      .in("status", COUNTED_REPORT_STATUSES as unknown as string[]);

    if (projectId) reportQuery = reportQuery.eq("project_id", projectId);
    if (weekStart) {
      reportQuery = reportQuery.gte("report_date", weekStart).lte("report_date", addDays(weekStart, 6));
    }

    const { data: reports, error: reportsError } = await reportQuery.order("report_date", { ascending: false });
    if (reportsError) {
      console.error("[Site Reports Notes] Reports error:", reportsError.message);
      return NextResponse.json({ error: "Failed to fetch site reports" }, { status: 500 });
    }
    if (!reports || reports.length === 0) return NextResponse.json({ notes: [], projects, suppliers: [] });

    const reportIds = reports.map((r: any) => r.id);
    const reportMap: Record<string, any> = {};
    for (const r of reports) reportMap[r.id] = r;

    const { data: entries, error: entriesError } = await (admin as any)
      .from("site_report_entries")
      .select("*")
      .in("report_id", reportIds as string[])
      .eq("entry_type", "delivery_note");

    if (entriesError) {
      console.error("[Site Reports Notes] Entries error:", entriesError.message);
      return NextResponse.json({ error: "Failed to fetch delivery notes" }, { status: 500 });
    }

    // Resolve supplier_id → company_name in one lookup. Deliberately NOT a
    // PostgREST embed: the FK arrives with migration 093 and an embed would
    // return a silent 400 on databases where it has not been applied yet.
    const supplierIds = Array.from(
      new Set<string>((entries || []).map((e: any) => e.supplier_id).filter(Boolean)),
    );
    const supplierNames: Record<string, string> = {};
    if (supplierIds.length > 0) {
      const { data: supplierRows, error: supplierError } = await (admin as any)
        .from("suppliers")
        .select("id, company_name")
        .eq("organization_id", profile.organization_id)
        .in("id", supplierIds);

      if (supplierError) {
        console.warn("[Site Reports Notes] Suppliers lookup failed:", supplierError.message);
      }
      for (const s of supplierRows || []) supplierNames[s.id] = s.company_name;
    }

    // Photos are stored as storage paths (private bucket) — re-sign short-lived.
    const notePhotoUrls = await signPhotoPaths(admin, (entries || []).map((e: any) => e.photo_url));

    let notes = (entries || []).map((e: any) => {
      const linkedName = e.supplier_id ? supplierNames[e.supplier_id] : undefined;
      const displayName = linkedName || e.supplier_name || "";
      return {
        id: e.id,
        report_date: reportMap[e.report_id]?.report_date,
        project_id: reportMap[e.report_id]?.project_id,
        project_name: (projects || []).find((p: any) => p.id === reportMap[e.report_id]?.project_id)?.name || "",
        note_number: e.note_number,
        supplier_id: e.supplier_id || null,
        supplier_name: displayName,
        /** True when the note is linked to a row in the suppliers directory. */
        supplier_linked: Boolean(linkedName),
        photo_url: displayPhotoUrl(e.photo_url, notePhotoUrls),
        submitted_by: reportMap[e.report_id]?.submitted_by_name,
      };
    });

    if (supplierId) {
      notes = notes.filter((n: any) => n.supplier_id === supplierId);
    } else if (supplier) {
      // Legacy free-text filter — matches the grouping key, not the raw string,
      // so "sabliere sa" finds "Sablière SA  ".
      const needle = normalizeSupplierName(supplier);
      notes = notes.filter((n: any) => normalizeSupplierName(n.supplier_name).includes(needle));
    }

    // Group by supplier_id when linked, by normalised name otherwise.
    const groups = new Map<
      string,
      { key: string; supplier_id: string | null; name: string; linked: boolean; count: number; projects: Set<string> }
    >();
    for (const n of notes) {
      if (!n.supplier_name && !n.supplier_id) continue;
      const key = n.supplier_id ? `id:${n.supplier_id}` : `name:${normalizeSupplierName(n.supplier_name)}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          supplier_id: n.supplier_id,
          name: n.supplier_name || "—",
          linked: n.supplier_linked,
          count: 0,
          projects: new Set<string>(),
        };
        groups.set(key, group);
      }
      group.count += 1;
      if (n.project_name) group.projects.add(n.project_name);
    }

    const supplierSummary = Array.from(groups.values())
      .map((g) => ({
        key: g.key,
        supplier_id: g.supplier_id,
        name: g.name,
        linked: g.linked,
        count: g.count,
        projects: Array.from(g.projects),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return NextResponse.json({ notes, projects: projects || [], suppliers: supplierSummary });
  } catch (error) {
    console.error("[Site Reports Notes] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Calendar-safe date arithmetic (see hours route). */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split("T")[0];
}
