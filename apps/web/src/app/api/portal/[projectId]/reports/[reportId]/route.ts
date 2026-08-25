import { NextRequest, NextResponse } from "next/server";
import { requirePortalSession } from "@/lib/portal/session";
import { signPhotoPaths, displayPhotoUrl } from "@/lib/portal/photos";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A signature is a small PNG drawn on a ~400px canvas; anything bigger is not a
// signature and must not be written to a TEXT column read back on every load.
const MAX_SIGNATURE_CHARS = 400_000; // ≈ 300 KB of base64
const DEFAULT_HOURLY_RATE_CHF = 95; // same default as /api/pricing/config
// A shared PIN device must not be able to push an unbounded report.
const MAX_ENTRIES = 200;
const MAX_HOURS_PER_ENTRY = 24;

/** Returns the value only when it is a real UUID — garbage becomes NULL instead of a 500. */
function asUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null;
}

/**
 * A validated UUID that also belongs to `allowed`. A field device could type
 * (or a tampered request could send) any well-formed UUID; the FK only checks
 * the row exists, NOT that it belongs to this project/org, so a note could be
 * linked to another tenant's supplier or planning task. Anything unknown → NULL.
 */
function asScopedUuid(value: unknown, allowed: Set<string>): string | null {
  const id = asUuid(value);
  return id && allowed.has(id) ? id : null;
}

/**
 * A delivery-note photo is a storage PATH under this project/report (produced by
 * the upload route). Reject anything else — an external URL, a data: URI, a path
 * into another report/bucket — so a PIN device cannot store an arbitrary URL
 * that the app / public views would later render as <img src>.
 */
function asPhotoPath(value: unknown, projectId: string, reportId: string): string | null {
  if (typeof value !== "string" || !value) return null;
  const prefix = `${projectId}/${reportId}/`;
  if (!value.startsWith(prefix)) return null;
  const rest = value.slice(prefix.length);
  // The upload route only ever produces `<timestamp>-<rand>.<ext>`.
  return /^[a-zA-Z0-9._-]+$/.test(rest) ? value : null;
}

/**
 * True when PostgREST refused the request because a column does not exist —
 * i.e. migration 093 has not been applied on this database yet.
 *
 * The portal is the one screen that must never lose a day of work, so every
 * 093-dependent write falls back to the pre-093 shape instead of failing.
 */
function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST204" || error.code === "42703") return true;
  return /column|does not exist/i.test(error.message || "");
}

/** Wages never travel to a PIN-authenticated device. */
function stripRates<T extends Record<string, any>>(rows: T[]): T[] {
  return rows.map((row) => {
    const copy = { ...row };
    delete copy.hourly_rate_chf;
    return copy;
  });
}

function asText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

/** Clamp a duration to a sane [0, 24] hours; garbage → 0. */
function asHours(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_HOURS_PER_ENTRY);
}

function asSignature(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("data:image/png;base64,")) return null;
  if (value.length > MAX_SIGNATURE_CHARS) return null;
  return value;
}

/**
 * Labour rate for each entry, resolved SERVER-SIDE, plus the id sets a field
 * device is allowed to reference (its own crew, the org's suppliers, the
 * project's planning tasks). One round-trip funds both.
 *
 * The field device never sends (nor receives) a rate: wages are not crew
 * business. The value stored on the entry is a snapshot, so raising a rate next
 * month never rewrites the cost of a report already signed.
 */
async function buildEntryContext(
  admin: any,
  projectId: string,
  organizationId: string | undefined,
): Promise<{
  resolveRate: (crewMemberId: string | null) => number | null;
  crewIds: Set<string>;
  supplierIds: Set<string>;
  planningTaskIds: Set<string>;
}> {
  const [crewResult, orgResult, suppliersResult, planningResult] = await Promise.all([
    // `*`: selecting hourly_rate_chf explicitly would 400 the whole query on a
    // database where 093 is not applied — and then every rate would be missing.
    admin.from("portal_crew_members").select("*").eq("project_id", projectId),
    organizationId
      ? admin.from("organizations").select("pricing_config").eq("id", organizationId).single()
      : Promise.resolve({ data: null }),
    organizationId
      ? admin.from("suppliers").select("id").eq("organization_id", organizationId).limit(2000)
      : Promise.resolve({ data: [] }),
    admin
      .from("project_plannings")
      .select("id, status, updated_at")
      .eq("project_id", projectId)
      .in("status", ["active", "draft"])
      .order("updated_at", { ascending: false }),
  ]);

  const perMember = new Map<string, number>();
  const crewIds = new Set<string>();
  for (const member of crewResult?.data || []) {
    crewIds.add(member.id);
    const rate = Number(member.hourly_rate_chf);
    if (Number.isFinite(rate) && rate > 0) perMember.set(member.id, rate);
  }

  const supplierIds = new Set<string>((suppliersResult?.data || []).map((s: any) => s.id));

  const planningTaskIds = new Set<string>();
  const plannings = planningResult?.data || [];
  const planning = plannings.find((p: any) => p.status === "active") || plannings[0];
  if (planning) {
    const { data: tasks } = await admin
      .from("planning_tasks")
      .select("id")
      .eq("planning_id", planning.id)
      .limit(2000);
    for (const task of tasks || []) planningTaskIds.add(task.id);
  }

  const orgRate = Number(orgResult?.data?.pricing_config?.hourly_rate);
  const fallback = Number.isFinite(orgRate) && orgRate > 0 ? orgRate : DEFAULT_HOURLY_RATE_CHF;

  return {
    resolveRate: (crewMemberId) => {
      if (crewMemberId && perMember.has(crewMemberId)) return perMember.get(crewMemberId)!;
      return fallback;
    },
    crewIds,
    supplierIds,
    planningTaskIds,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; reportId: string }> },
) {
  try {
    const { projectId, reportId } = await params;
    const { valid, admin } = await requirePortalSession(projectId);
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // `*` everywhere on 093-dependent tables: an explicit list would make the
    // query 400 on a database where the migration is not applied, and
    // supabase-js does not throw — the report would silently come back empty.
    const { data: report } = await (admin as any)
      .from("site_reports")
      .select("*")
      .eq("id", reportId)
      .eq("project_id", projectId)
      .single();

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const { data: entries } = await (admin as any)
      .from("site_report_entries")
      .select("*, portal_crew_members(name, role)")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true });

    // Photos are stored as storage paths — re-sign them (short-lived) for the
    // field form's preview. Legacy full URLs pass through unchanged.
    const signed = await signPhotoPaths(
      admin,
      (entries || []).map((e: any) => e.photo_url),
    );
    const withPhotos = (entries || []).map((e: any) =>
      e.entry_type === "delivery_note"
        ? { ...e, photo_display_url: displayPhotoUrl(e.photo_url, signed) }
        : e,
    );

    // The rate snapshot is stripped on the way out (see buildEntryContext).
    return NextResponse.json({ report, entries: stripRates(withPhotos) });
  } catch (error) {
    console.error("[Portal Report Detail] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; reportId: string }> },
) {
  try {
    const { projectId, reportId } = await params;
    const { valid, admin, userName, organizationId } = await requirePortalSession(projectId);
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Check report belongs to project and is editable
    const { data: report } = await (admin as any)
      .from("site_reports")
      .select("id, status")
      .eq("id", reportId)
      .eq("project_id", projectId)
      .single();

    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (report.status === "locked") return NextResponse.json({ error: "Report is locked" }, { status: 403 });

    const body = await request.json().catch(() => ({}));

    // Update report fields (bounded: a shared PIN device must not push megabytes)
    const updates: Record<string, any> = {};
    if (body.remarks !== undefined) updates.remarks = asText(body.remarks, 5000);
    if (body.weather !== undefined) updates.weather = asText(body.weather, 200);

    // Foreman signature (migration 093). Explicit null clears it.
    if (body.signature_data !== undefined) {
      const signature = asSignature(body.signature_data);
      if (signature) {
        updates.signature_data = signature;
        updates.signed_by = asText(body.signed_by, 120) || userName || null;
        updates.signed_at = new Date().toISOString();
      } else if (body.signature_data === null) {
        updates.signature_data = null;
        updates.signed_by = null;
        updates.signed_at = null;
      } else {
        return NextResponse.json({ error: "Invalid signature payload" }, { status: 400 });
      }
    }

    let signatureSaved = updates.signature_data !== undefined;

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await (admin as any)
        .from("site_reports")
        .update(updates)
        .eq("id", reportId);

      if (updateError && isMissingColumnError(updateError)) {
        // Migration 093 not applied: save the report without the signature
        // rather than rejecting a day of work.
        console.warn("[Portal Report Detail] Signature columns missing (migration 093 not applied)");
        signatureSaved = false;
        const { signature_data, signed_by, signed_at, ...legacyUpdates } = updates;
        void signature_data;
        void signed_by;
        void signed_at;
        if (Object.keys(legacyUpdates).length > 0) {
          const { error: retryError } = await (admin as any)
            .from("site_reports")
            .update(legacyUpdates)
            .eq("id", reportId);
          if (retryError) {
            console.error("[Portal Report Detail] Update report error:", retryError);
            return NextResponse.json({ error: "Failed to update report" }, { status: 500 });
          }
        }
      } else if (updateError) {
        console.error("[Portal Report Detail] Update report error:", updateError);
        return NextResponse.json({ error: "Failed to update report" }, { status: 500 });
      }
    }

    // Replace all entries if provided.
    // Insert-then-delete (never the reverse): a failed insert must not leave the
    // chef d'équipe with an empty report after a day on site.
    if (body.entries && Array.isArray(body.entries)) {
      if (body.entries.length > MAX_ENTRIES) {
        return NextResponse.json({ error: "Too many entries" }, { status: 400 });
      }

      const { data: previousEntries, error: previousError } = await (admin as any)
        .from("site_report_entries")
        .select("id")
        .eq("report_id", reportId);

      if (previousError) {
        console.error("[Portal Report Detail] Fetch existing entries error:", previousError);
        return NextResponse.json({ error: "Failed to update entries" }, { status: 500 });
      }

      const previousIds = (previousEntries || []).map((e: any) => e.id);

      if (body.entries.length > 0) {
        const { resolveRate, crewIds, supplierIds, planningTaskIds } =
          await buildEntryContext(admin, projectId, organizationId);

        const rows = body.entries.map((e: any) => {
          // Only accept a crew member that belongs to THIS project.
          const crewMemberId = asScopedUuid(e.crew_member_id, crewIds);
          const isLabor = e.entry_type === "labor";
          const isMachine = e.entry_type === "machine";

          return {
            report_id: reportId,
            entry_type: e.entry_type,
            crew_member_id: crewMemberId,
            work_description: asText(e.work_description, 2000),
            duration_hours: isLabor || isMachine ? asHours(e.duration_hours) : null,
            is_driver: e.is_driver === true,
            machine_description: asText(e.machine_description, 500),
            is_rented: e.is_rented === true,
            note_number: asText(e.note_number, 120),
            supplier_name: asText(e.supplier_name, 200),
            photo_url: e.entry_type === "delivery_note"
              ? asPhotoPath(e.photo_url, projectId, reportId)
              : null,
            // Migration 093 — imputation & valorisation. planning_task_id must
            // belong to this project's planning, supplier_id to this org.
            cfc_code: isLabor || isMachine ? asText(e.cfc_code, 32) : null,
            planning_task_id:
              isLabor || isMachine ? asScopedUuid(e.planning_task_id, planningTaskIds) : null,
            supplier_id:
              e.entry_type === "delivery_note" ? asScopedUuid(e.supplier_id, supplierIds) : null,
            hourly_rate_chf: isLabor ? resolveRate(crewMemberId) : null,
          };
        });

        let { error: insertError } = await (admin as any)
          .from("site_report_entries")
          .insert(rows);

        if (insertError && isMissingColumnError(insertError)) {
          // Migration 093 not applied: save the hours without the imputation
          // columns. Losing an imputation is annoying; losing the hours is not
          // an option.
          console.warn("[Portal Report Detail] Entry columns missing (migration 093 not applied)");
          const legacyRows = rows.map(
            ({ cfc_code, planning_task_id, supplier_id, hourly_rate_chf, ...rest }: any) => {
              void cfc_code;
              void planning_task_id;
              void supplier_id;
              void hourly_rate_chf;
              return rest;
            },
          );
          ({ error: insertError } = await (admin as any)
            .from("site_report_entries")
            .insert(legacyRows));
        }

        if (insertError) {
          // Old entries are still intact — nothing is lost.
          console.error("[Portal Report Detail] Insert entries error:", insertError);
          return NextResponse.json({ error: "Failed to save entries" }, { status: 500 });
        }
      }

      // New rows are committed: remove the superseded ones.
      if (previousIds.length > 0) {
        const { error: deleteError } = await (admin as any)
          .from("site_report_entries")
          .delete()
          .in("id", previousIds);

        if (deleteError) {
          console.error("[Portal Report Detail] Delete stale entries error:", deleteError);
          return NextResponse.json(
            { error: "Entries saved but the previous version could not be removed" },
            { status: 500 },
          );
        }
      }
    }

    // Submit if requested
    if (body.status === "submitted" && report.status === "draft") {
      const { error: submitError } = await (admin as any)
        .from("site_reports")
        .update({ status: "submitted" })
        .eq("id", reportId);

      if (submitError) {
        console.error("[Portal Report Detail] Submit error:", submitError);
        return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, signature_saved: signatureSaved });
  } catch (error) {
    console.error("[Portal Report Detail] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
