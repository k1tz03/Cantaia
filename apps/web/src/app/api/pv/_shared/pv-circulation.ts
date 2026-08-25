// ============================================================
// PV circulation — shared server helpers (Agent O)
// ============================================================
// Underscore-prefixed folder: Next.js excludes it from routing, so this file
// is a plain module even though it lives under app/api/pv/.
//
// Three concerns live here because the PV routes all need them and none of
// them belongs in a client bundle:
//
//   1. Persistent point numbering  — {meeting_number}.{index}, never reshuffled
//   2. Carry-over of open points   — "points ouverts de la séance n-1"
//   3. The org PV outline (trame)  — organizations.pv_template + the default
//
// Everything here is defensive: a PV must still open when the previous meeting
// is malformed, the tasks table is unreachable, or pv_template holds garbage.

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export interface PVCarriedPoint {
  /** Persistent number from the ORIGIN meeting, e.g. "4.2". */
  number: string;
  description: string;
  responsible_name?: string;
  responsible_company?: string;
  deadline?: string | null;
  priority?: string;
  /** Where the point comes from — printed as "Séance n°4". */
  origin_meeting_number: number | null;
  /** Resolution state, derived from the task created at finalisation. */
  status: "open" | "in_progress" | "done";
}

export interface PVTemplateSection {
  titre: string;
  ordre: number;
  obligatoire: boolean;
}

/** Marker put on the carry-over section so it is never duplicated. */
export const CARRY_OVER_FLAG = "carried_over";
export const CARRY_OVER_TITLE = "Points ouverts (séance précédente)";

/** Cantaia's built-in outline, used when the org defined no `pv_template`. */
export const DEFAULT_PV_TEMPLATE: PVTemplateSection[] = [
  { titre: "Tour de table / remarques générales", ordre: 1, obligatoire: true },
  { titre: "Avancement des travaux", ordre: 2, obligatoire: true },
  { titre: "Planning", ordre: 3, obligatoire: false },
  { titre: "Points techniques", ordre: 4, obligatoire: false },
  { titre: "Points financiers", ordre: 5, obligatoire: false },
  { titre: "Sécurité / hygiène", ordre: 6, obligatoire: false },
  { titre: "Divers", ordre: 7, obligatoire: false },
];

// ------------------------------------------------------------
// 1. Persistent numbering
// ------------------------------------------------------------

/**
 * Point numbers are `{meeting_number}.{index}` and are STORED, not derived.
 * Deleting section 4.2 must leave 4.3 as 4.3: a point discussed under "4.3"
 * in the room, in the e-mails and in the previous PV cannot silently become
 * "4.2" because someone removed a line above it.
 *
 * This assigns a number only to sections that do not have one yet, continuing
 * after the highest index already in use.
 */
export function assignPersistentNumbers(
  sections: any[],
  meetingNumber: number | null | undefined
): any[] {
  if (!Array.isArray(sections)) return [];
  const prefix = Number.isFinite(Number(meetingNumber)) ? Number(meetingNumber) : 1;

  let highest = 0;
  for (const section of sections) {
    const idx = parseSectionIndex(section?.number, prefix);
    if (idx !== null && idx > highest) highest = idx;
  }

  return sections.map((section) => {
    if (!section || typeof section !== "object") return section;
    // ANY existing number is kept, including one whose prefix belongs to
    // another séance: a stored number is a reference that was read out in the
    // room and quoted in the previous PV. Only the high-water mark above is
    // prefix-aware, so a stale "3.9" cannot push this meeting's counter.
    if (String(section.number ?? "").trim() !== "") return section;
    highest += 1;
    return { ...section, number: `${prefix}.${highest}` };
  });
}

/** Extracts the `index` out of a `{prefix}.{index}` number, or null. */
function parseSectionIndex(value: unknown, prefix: number): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Legacy PVs stored a bare "1", "2"… Treat it as the index.
    return value > 0 ? Math.trunc(value) : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dotted = trimmed.match(/^(\d+)\.(\d+)$/);
  if (dotted) {
    // Only ours when the prefix matches — a "3.2" inherited from meeting 3
    // must not push meeting 4's counter to 3.
    return Number(dotted[1]) === prefix ? Number(dotted[2]) : null;
  }

  const bare = trimmed.match(/^(\d+)$/);
  return bare ? Number(bare[1]) : null;
}

/** Next free `{meeting_number}.{index}` for a newly added section. */
export function nextSectionNumber(
  sections: any[],
  meetingNumber: number | null | undefined
): string {
  const prefix = Number.isFinite(Number(meetingNumber)) ? Number(meetingNumber) : 1;
  let highest = 0;
  for (const section of sections || []) {
    const idx = parseSectionIndex(section?.number, prefix);
    if (idx !== null && idx > highest) highest = idx;
  }
  return `${prefix}.${highest + 1}`;
}

// ------------------------------------------------------------
// 2. Carry-over of open points
// ------------------------------------------------------------

/** Loose normalisation so "Commander les fenêtres." matches "commander les fenetres". */
function normalizeForMatch(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    // NFD splits "é" into "e" + a combining mark; the non-ASCII filter below
    // then drops the mark, so accents stop mattering for the comparison.
    .normalize("NFD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Loads the previous finalized/sent meeting of a project and returns the points
 * that are still open.
 *
 * "Still open" is decided by crossing the PV actions with the tasks that
 * finalisation created for that meeting (`tasks.source = 'meeting'`,
 * `source_id = <meeting id>`): a task marked done/cancelled closes its point.
 * An action with no matching task is treated as OPEN — the conservative
 * direction, since a point wrongly carried forward costs one click while a
 * point wrongly dropped disappears from the project.
 *
 * Never throws.
 */
export async function loadPreviousOpenPoints(
  admin: any,
  projectId: string,
  excludeMeetingId?: string | null
): Promise<{ points: PVCarriedPoint[]; previousMeetingNumber: number | null }> {
  const empty = { points: [] as PVCarriedPoint[], previousMeetingNumber: null };
  if (!admin || !projectId) return empty;

  try {
    let query = admin
      .from("meetings")
      .select("id, meeting_number, meeting_date, pv_content, status")
      .eq("project_id", projectId)
      .in("status", ["finalized", "sent"])
      .order("meeting_number", { ascending: false })
      .order("meeting_date", { ascending: false })
      .limit(1);

    if (excludeMeetingId) query = query.neq("id", excludeMeetingId);

    const { data: previous, error } = await query.maybeSingle();
    if (error || !previous?.pv_content) return empty;

    const sections = (previous.pv_content as any)?.sections;
    if (!Array.isArray(sections)) return empty;

    // Flatten the previous PV's actions, keeping their stored numbers.
    const actions: Array<{ section: any; action: any }> = [];
    for (const section of sections) {
      for (const action of section?.actions || []) {
        if (action?.description) actions.push({ section, action });
      }
    }
    if (actions.length === 0) {
      return { points: [], previousMeetingNumber: previous.meeting_number ?? null };
    }

    // Resolution state comes from the tasks finalisation created.
    const statusByTitle = new Map<string, string>();
    try {
      const { data: tasks } = await admin
        .from("tasks")
        .select("title, status")
        .eq("source", "meeting")
        .eq("source_id", previous.id);
      for (const task of tasks || []) {
        const key = normalizeForMatch(task.title);
        // First writer wins only if it is not already a terminal state — a
        // duplicated title should resolve to "done" when any of them is done.
        const existing = statusByTitle.get(key);
        if (!existing || existing === "todo") statusByTitle.set(key, task.status);
      }
    } catch {
      // Tasks unreadable → every action is reported as open.
    }

    const points: PVCarriedPoint[] = [];
    for (const { section, action } of actions) {
      // A point the editor explicitly marked "Traité" in the PVCarriedSection
      // dropdown (`action.carried_status === 'done'`) is closed, even when it
      // never spawned a task (a carried point does not always create one). Not
      // reading this flag re-carried resolved points to séance N+1 forever.
      if (action.carried_status === "done") continue;

      const taskStatus = statusByTitle.get(normalizeForMatch(action.description));
      if (taskStatus === "done" || taskStatus === "cancelled") continue;

      points.push({
        number: String(section?.number ?? ""),
        description: String(action.description),
        responsible_name: action.responsible_name || "",
        responsible_company: action.responsible_company || "",
        deadline: action.deadline ?? null,
        priority: action.priority === "urgent" ? "urgent" : "normal",
        origin_meeting_number: previous.meeting_number ?? null,
        status: taskStatus === "in_progress" ? "in_progress" : "open",
      });
    }

    return { points, previousMeetingNumber: previous.meeting_number ?? null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[pv] loadPreviousOpenPoints(${projectId}) failed: ${message}`);
    return empty;
  }
}

/**
 * Builds the "Points ouverts (séance précédente)" section from carried points.
 * Returns null when there is nothing to carry — an empty section on every PV
 * would be noise.
 */
export function buildCarryOverSection(
  points: PVCarriedPoint[],
  meetingNumber: number | null | undefined
): any | null {
  if (!points?.length) return null;
  const prefix = Number.isFinite(Number(meetingNumber)) ? Number(meetingNumber) : 1;
  const origin = points.find((p) => p.origin_meeting_number != null)?.origin_meeting_number;

  return {
    number: `${prefix}.1`,
    title: origin != null ? `${CARRY_OVER_TITLE} — n°${origin}` : CARRY_OVER_TITLE,
    content: "",
    decisions: [],
    // Each carried point stays an ACTION so finalisation re-creates its task
    // if it is still open at the end of this meeting.
    actions: points.map((p) => ({
      description: p.description,
      responsible_name: p.responsible_name || "",
      responsible_company: p.responsible_company || "",
      deadline: p.deadline ?? null,
      priority: p.priority === "urgent" ? "urgent" : "normal",
      // Editor-facing metadata (ignored by the PDF action table).
      carried_from: p.number || null,
      carried_status: p.status,
    })),
    [CARRY_OVER_FLAG]: true,
  };
}

/** True when the PV already carries its "points ouverts" section. */
export function hasCarryOverSection(pvContent: any): boolean {
  const sections = pvContent?.sections;
  if (!Array.isArray(sections)) return false;
  return sections.some((s: any) => s?.[CARRY_OVER_FLAG] === true);
}

/**
 * Puts the carry-over section first, leaving the rest of the PV untouched.
 * Idempotent: a PV that already has one is returned unchanged.
 */
export function prependCarryOverSection(pvContent: any, section: any | null): any {
  if (!section) return pvContent;
  if (hasCarryOverSection(pvContent)) return pvContent;
  const sections = Array.isArray(pvContent?.sections) ? pvContent.sections : [];
  return { ...(pvContent || {}), sections: [section, ...sections] };
}

// ------------------------------------------------------------
// 3. The org PV outline (trame)
// ------------------------------------------------------------

/**
 * Validates and normalises whatever `organizations.pv_template` holds.
 * Returns null when the org defined no usable outline (→ Cantaia default).
 */
export function parsePVTemplate(raw: unknown): PVTemplateSection[] | null {
  const sections = (raw as any)?.sections;
  if (!Array.isArray(sections) || sections.length === 0) return null;

  const cleaned: PVTemplateSection[] = [];
  for (const entry of sections) {
    const titre = String(entry?.titre ?? entry?.title ?? "").trim();
    if (!titre) continue;
    cleaned.push({
      titre: titre.slice(0, 200),
      ordre: Number.isFinite(Number(entry?.ordre)) ? Number(entry.ordre) : cleaned.length + 1,
      obligatoire: entry?.obligatoire === true,
    });
    if (cleaned.length >= 40) break; // sanity cap
  }

  if (cleaned.length === 0) return null;
  cleaned.sort((a, b) => a.ordre - b.ordre);
  return cleaned.map((s, i) => ({ ...s, ordre: i + 1 }));
}

/** Reads the org outline, falling back to the Cantaia default. Never throws. */
export async function loadPVTemplate(
  admin: any,
  organizationId: string | null | undefined
): Promise<{ sections: PVTemplateSection[]; isCustom: boolean }> {
  const fallback = { sections: DEFAULT_PV_TEMPLATE, isCustom: false };
  if (!admin || !organizationId) return fallback;

  try {
    const { data, error } = await admin
      .from("organizations")
      .select("pv_template")
      .eq("id", organizationId)
      .maybeSingle();

    // Migration 095 not applied yet → the column is missing, not an outage.
    if (error || !data) return fallback;

    const parsed = parsePVTemplate(data.pv_template);
    return parsed ? { sections: parsed, isCustom: true } : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Prompt fragment appended to the PV generation prompt. Built here rather than
 * in `@cantaia/core/ai/prompts.ts` so the shared prompt module stays untouched.
 */
export function buildPVPromptSupplement(opts: {
  template: PVTemplateSection[] | null;
  carriedPoints: PVCarriedPoint[];
  previousMeetingNumber: number | null;
}): string {
  const blocks: string[] = [];

  if (opts.template?.length) {
    const outline = opts.template
      .map((s) => `  ${s.ordre}. ${s.titre}${s.obligatoire ? " (obligatoire)" : ""}`)
      .join("\n");
    blocks.push(
      `TRAME IMPOSÉE PAR L'ORGANISATION — respecte cet ordre et ces intitulés de sections :\n${outline}\n` +
        `- Reprends CHAQUE section marquée (obligatoire), même si la transcription n'en parle pas : ` +
        `dans ce cas écris "Rien à signaler." dans son contenu.\n` +
        `- Tu peux ajouter des sections supplémentaires à la fin si la séance a abordé d'autres sujets.`
    );
  }

  if (opts.carriedPoints?.length) {
    const label =
      opts.previousMeetingNumber != null
        ? `séance précédente (n°${opts.previousMeetingNumber})`
        : "séance précédente";
    const list = opts.carriedPoints
      .map((p) => {
        const who = [p.responsible_name, p.responsible_company].filter(Boolean).join(" / ");
        const parts = [
          `  - [${p.number || "?"}] ${p.description}`,
          who ? `responsable : ${who}` : "",
          p.deadline ? `délai : ${p.deadline}` : "",
          `statut connu : ${p.status === "in_progress" ? "en cours" : "ouvert"}`,
        ].filter(Boolean);
        return parts.join(" — ");
      })
      .join("\n");

    blocks.push(
      `POINTS OUVERTS DE LA ${label.toUpperCase()}, À REPRENDRE AVEC LEUR STATUT :\n${list}\n` +
        `- Une section "${CARRY_OVER_TITLE}" est DÉJÀ créée en tête du PV et contient ces points : ` +
        `ne la recrée pas et ne les répète pas dans tes propres sections.\n` +
        `- Si la transcription indique qu'un de ces points a été traité, clos ou fait avancer, ` +
        `mentionne-le explicitement dans la section correspondante de la séance du jour.`
    );
  }

  if (blocks.length === 0) return "";
  return `\n\n${blocks.join("\n\n")}`;
}
