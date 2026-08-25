// ============================================================
// PV PDF builder — shared by export-pdf and send (Agent O)
// ============================================================
// GET /api/pv/[id]/export-pdf downloads the PDF; POST /api/pv/[id]/send
// attaches the very same bytes to the circulation e-mail. Building it twice
// would mean two letterheads drifting apart, so both routes call this.

import { generatePVPdf, type PVData } from "@/lib/pdf/PVDocument";
import { resolvePdfBranding } from "@/lib/pdf/pdf-branding";

/** Default opposition period when the meeting has no explicit value. */
export const DEFAULT_OPPOSITION_DAYS = 10;

export interface BuiltPVPdf {
  buffer: Buffer;
  filename: string;
  projectName: string;
  projectCode: string;
  meetingNumber: number | null;
  oppositionDeadlineDays: number;
  orgName: string;
}

/** Storage/HTTP-safe filename fragment. */
function slug(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "Projet";
}

/**
 * Renders the PV of a meeting that has ALREADY been authorised by the caller.
 *
 * `meeting` must come with its `projects` join (name, code, organization_id) —
 * the routes fetch it for their own org check, so re-reading it here would be a
 * wasted round-trip. Throws only when the meeting has no PV content.
 */
export async function buildPVPdf(
  admin: any,
  meeting: any,
  organizationId: string | null | undefined
): Promise<BuiltPVPdf> {
  if (!meeting?.pv_content) {
    throw new Error("Meeting has no PV content");
  }

  const pv = meeting.pv_content as PVData;
  const project = (meeting as any).projects || {};
  const projectName = project.name ?? pv.header?.project_name ?? "Projet";
  const projectCode = project.code ?? pv.header?.project_code ?? "";

  // Migration 095 may not be applied yet → column absent → undefined → default.
  const rawDays = (meeting as any).opposition_deadline_days;
  const oppositionDeadlineDays =
    typeof rawDays === "number" && Number.isFinite(rawDays) && rawDays >= 0
      ? rawDays
      : DEFAULT_OPPOSITION_DAYS;

  const branding = await resolvePdfBranding(admin, organizationId);

  const buffer = await generatePVPdf(pv, projectName, projectCode, {
    branding,
    oppositionDeadlineDays,
    showSignatures: true,
  });

  const meetingNumber =
    typeof meeting.meeting_number === "number"
      ? meeting.meeting_number
      : Number(pv.header?.meeting_number) || null;
  const dateStr = String(pv.header?.date ?? "").replace(/[./]/g, "-");
  const filename = `PV_${slug(projectName)}_Seance${meetingNumber ?? ""}${
    dateStr ? `_${slug(dateStr)}` : ""
  }.pdf`;

  return {
    buffer,
    filename,
    projectName,
    projectCode,
    meetingNumber,
    oppositionDeadlineDays,
    orgName: branding.name,
  };
}
