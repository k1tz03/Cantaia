import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePdfBranding, DEFAULT_PDF_BRANDING } from "@/lib/pdf/pdf-branding";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// A3 landscape Gantt — geometry (all values in mm)
// ---------------------------------------------------------------------------

const PAGE_W = 420;
const PAGE_H = 297;
const MARGIN = 12;

/** Left column holding phase / task names. */
const LABEL_W = 116;
const CHART_X = MARGIN + LABEL_W;
const CHART_W = PAGE_W - MARGIN - CHART_X;

/** Banner height: tall on page 1 (branding block), compact afterwards. */
const HEADER_H_FIRST = 36;
const HEADER_H_NEXT = 16;

/** Month band + week band. */
const MONTH_BAND_H = 6;
const WEEK_BAND_H = 5;
const SCALE_H = MONTH_BAND_H + WEEK_BAND_H;

const ROW_H = 5.4;
const FOOTER_H = 16;

const BAR_INSET = 1.2;
const BAR_H = ROW_H - BAR_INSET * 2;
const BASELINE_H = 1.1;
const ACTUAL_H = 0.9;

type Rgb = [number, number, number];

const COLOR_INK: Rgb = [24, 24, 27];
const COLOR_MUTED: Rgb = [113, 113, 122];
const COLOR_FAINT: Rgb = [212, 212, 216];
const COLOR_GRID: Rgb = [232, 232, 236];
const COLOR_WEEKEND: Rgb = [246, 246, 248];
const COLOR_PHASE_BAND: Rgb = [240, 240, 244];
const COLOR_CRITICAL: Rgb = [220, 38, 38];
const COLOR_BASELINE: Rgb = [161, 161, 170];
const COLOR_TODAY: Rgb = [239, 68, 68];

/** Diamond fill per `planning_tasks.milestone_type` (see planning-generator). */
const MILESTONE_COLORS: Record<string, Rgb> = {
  start: [59, 130, 246],
  phase_start: [99, 102, 241],
  procurement: [139, 92, 246],
  hors_eau: [6, 182, 212],
  hors_air: [16, 185, 129],
  // The generator emits `reception_provisoire`; `reception` kept as an alias.
  reception_provisoire: [249, 115, 22],
  reception: [249, 115, 22],
};
const MILESTONE_FALLBACK: Rgb = [245, 158, 11];

const MONTH_NAMES = [
  "Janv.", "Fev.", "Mars", "Avr.", "Mai", "Juin",
  "Juil.", "Aout", "Sept.", "Oct.", "Nov.", "Dec.",
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function hexToRgb(hex: string | null | undefined, fallback: Rgb): Rgb {
  if (typeof hex !== "string") return fallback;
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return fallback;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function mix(color: Rgb, target: Rgb, amount: number): Rgb {
  const k = Math.min(1, Math.max(0, amount));
  return [
    Math.round(color[0] + (target[0] - color[0]) * k),
    Math.round(color[1] + (target[1] - color[1]) * k),
    Math.round(color[2] + (target[2] - color[2]) * k),
  ];
}

const lighten = (c: Rgb, k: number): Rgb => mix(c, [255, 255, 255], k);
const darken = (c: Rgb, k: number): Rgb => mix(c, [0, 0, 0], k);

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length < 10) return null;
  const d = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function fmtDate(value: unknown): string {
  const d = parseDate(value);
  if (!d) return "-";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${d.getUTCFullYear()}`;
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/** ISO-8601 week number — what Swiss site meetings actually refer to. */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function startOfIsoWeek(date: Date): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d;
}

/** jsPDF needs the format name alongside the data URI. */
function logoFormat(dataUri: string): "PNG" | "JPEG" {
  return dataUri.startsWith("data:image/png") ? "PNG" : "JPEG";
}

// ---------------------------------------------------------------------------
// Row model
// ---------------------------------------------------------------------------

interface GanttRow {
  kind: "phase" | "task" | "milestone" | "section";
  label: string;
  sublabel?: string;
  color: Rgb;
  task?: any;
  phase?: any;
}

/**
 * GET /api/planning/[id]/export-pdf
 * Renders the planning as a real graphical A3 landscape Gantt chart:
 * time scale, coloured bars, milestone diamonds, dependency elbows,
 * critical path, baseline ghosts, branded header, paginated.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { data: planning } = await (admin as any)
      .from("project_plannings")
      .select("*, projects(name, code)")
      .eq("id", id)
      .maybeSingle();

    if (!planning || planning.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [{ data: phases }, { data: tasks }, { data: dependencies }] = await Promise.all([
      (admin as any)
        .from("planning_phases")
        .select("*")
        .eq("planning_id", id)
        .order("sort_order", { ascending: true }),
      (admin as any)
        .from("planning_tasks")
        .select("*, suppliers(company_name)")
        .eq("planning_id", id)
        .order("sort_order", { ascending: true }),
      (admin as any)
        .from("planning_dependencies")
        .select("*")
        .eq("planning_id", id),
    ]);

    const allTasks: any[] = (tasks || []).map((t: any) => ({
      ...t,
      supplier_name: t.suppliers?.company_name || null,
    }));

    // ── Branding (never fatal — resolvePdfBranding swallows its own errors) ──
    let branding = { ...DEFAULT_PDF_BRANDING };
    try {
      branding = await resolvePdfBranding(admin, userProfile.organization_id);
    } catch (err) {
      console.warn("[planning/export-pdf] branding unavailable:", err);
    }
    const accent = hexToRgb(branding.primaryColor, [249, 115, 22]);
    const logo = branding.logoData;

    // ── Critical path: the CPM stores sort_order strings, not uuids ─────────
    const criticalIds = new Set<string>();
    const rawCritical = planning.ai_generation_log?.critical_path_task_ids;
    if (Array.isArray(rawCritical)) {
      const bySortOrder = new Map<string, string>();
      for (const t of allTasks) {
        if (t.sort_order !== null && t.sort_order !== undefined) {
          bySortOrder.set(String(t.sort_order), t.id);
        }
      }
      for (const so of rawCritical) {
        const taskId = bySortOrder.get(String(so));
        if (taskId) criticalIds.add(taskId);
      }
    }

    const baseline: Record<string, { start_date: string; end_date: string }> =
      (planning.config && typeof planning.config === "object" && planning.config.baseline) || {};
    const hasBaseline = Object.keys(baseline).length > 0;

    // ── Timeline window ─────────────────────────────────────────────────────
    const dateCandidates: Date[] = [];
    for (const t of allTasks) {
      const s = parseDate(t.start_date);
      const e = parseDate(t.end_date);
      if (s) dateCandidates.push(s);
      if (e) dateCandidates.push(e);
    }
    const planStart = parseDate(planning.start_date);
    const planEnd = parseDate(planning.calculated_end_date);
    if (planStart) dateCandidates.push(planStart);
    if (planEnd) dateCandidates.push(planEnd);

    if (dateCandidates.length === 0) {
      return NextResponse.json({ error: "Planning has no dated task" }, { status: 400 });
    }

    let timelineStart = new Date(Math.min(...dateCandidates.map((d) => d.getTime())));
    let timelineEnd = new Date(Math.max(...dateCandidates.map((d) => d.getTime())));
    timelineStart = startOfIsoWeek(addDays(timelineStart, -3));
    timelineEnd = addDays(timelineEnd, 7);

    const totalDays = Math.max(1, daysBetween(timelineStart, timelineEnd) + 1);
    const mmPerDay = CHART_W / totalDays;
    const dayX = (d: Date) => CHART_X + daysBetween(timelineStart, d) * mmPerDay;

    // ── Row list (phases → tasks, then the milestone block) ─────────────────
    const rows: GanttRow[] = [];
    const phaseById = new Map<string, any>();
    for (const phase of phases || []) phaseById.set(phase.id, phase);

    for (const phase of phases || []) {
      const phaseColor = hexToRgb(phase.color, accent);
      const phaseTasks = allTasks.filter(
        (t) => t.phase_id === phase.id && !t.is_milestone,
      );
      rows.push({ kind: "phase", label: phase.name || "Phase", color: phaseColor, phase });
      for (const task of phaseTasks) {
        rows.push({
          kind: "task",
          label: task.name || "-",
          sublabel: task.supplier_name || undefined,
          color: phaseColor,
          task,
          phase,
        });
      }
    }

    // Tasks without a phase (manual additions) keep their place rather than vanish.
    const orphanTasks = allTasks.filter(
      (t) => !t.is_milestone && (!t.phase_id || !phaseById.has(t.phase_id)),
    );
    if (orphanTasks.length > 0) {
      rows.push({ kind: "section", label: "Hors phase", color: COLOR_MUTED });
      for (const task of orphanTasks) {
        rows.push({
          kind: "task",
          label: task.name || "-",
          sublabel: task.supplier_name || undefined,
          color: accent,
          task,
        });
      }
    }

    const milestones = allTasks.filter((t) => t.is_milestone);
    if (milestones.length > 0) {
      rows.push({ kind: "section", label: "Jalons", color: COLOR_MUTED });
      for (const ms of milestones) {
        rows.push({
          kind: "milestone",
          label: ms.name || "Jalon",
          color: MILESTONE_COLORS[ms.milestone_type as string] ?? MILESTONE_FALLBACK,
          task: ms,
        });
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "Planning has no task" }, { status: 400 });
    }

    // ── Pagination ──────────────────────────────────────────────────────────
    const rowsForPage = (pageIndex: number) => {
      const headerH = pageIndex === 0 ? HEADER_H_FIRST : HEADER_H_NEXT;
      const available = PAGE_H - FOOTER_H - headerH - SCALE_H;
      return Math.max(1, Math.floor(available / ROW_H));
    };

    const pages: GanttRow[][] = [];
    let cursor = 0;
    while (cursor < rows.length) {
      const capacity = rowsForPage(pages.length);
      pages.push(rows.slice(cursor, cursor + capacity));
      cursor += capacity;
    }

    // ── Render ──────────────────────────────────────────────────────────────
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", format: "a3", unit: "mm" });

    const projectName = planning.projects?.name || planning.title || "Projet";
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayVisible =
      today >= timelineStart && today <= timelineEnd;

    /** Absolute y of the top of a row, for a given page top and index. */
    const rowTop = (chartTop: number, index: number) => chartTop + index * ROW_H;

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      if (pageIndex > 0) doc.addPage();
      const pageRows = pages[pageIndex];
      const headerH = pageIndex === 0 ? HEADER_H_FIRST : HEADER_H_NEXT;
      const scaleTop = headerH;
      const chartTop = headerH + SCALE_H;
      const chartBottom = chartTop + pageRows.length * ROW_H;

      // ---- Header band -----------------------------------------------------
      doc.setFillColor(accent[0], accent[1], accent[2]);
      doc.rect(0, 0, PAGE_W, 1.6, "F");

      let textX = MARGIN;
      if (pageIndex === 0 && logo) {
        try {
          doc.addImage(logo, logoFormat(logo), MARGIN, 5, 16, 16);
          textX = MARGIN + 20;
        } catch {
          // A cosmetic asset must never take the export down.
          textX = MARGIN;
        }
      }

      doc.setTextColor(COLOR_INK[0], COLOR_INK[1], COLOR_INK[2]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(pageIndex === 0 ? 17 : 12);
      doc.text("PLANNING DE CHANTIER", textX, pageIndex === 0 ? 12 : 9);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(pageIndex === 0 ? 11 : 9);
      doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
      doc.text(
        doc.splitTextToSize(projectName, 200)[0],
        textX,
        pageIndex === 0 ? 18 : 14,
      );

      if (pageIndex === 0) {
        doc.setFontSize(8.5);
        const meta = [
          `Debut: ${fmtDate(planning.start_date)}`,
          `Fin estimee: ${fmtDate(planning.calculated_end_date)}`,
          planning.project_type ? `Type: ${planning.project_type}` : null,
          planning.location_canton ? `Canton: ${planning.location_canton}` : null,
          `${allTasks.filter((t) => !t.is_milestone).length} taches`,
          `${milestones.length} jalons`,
        ]
          .filter(Boolean)
          .join("   |   ");
        doc.text(meta, textX, 24);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(accent[0], accent[1], accent[2]);
        doc.text(branding.name, PAGE_W - MARGIN, 12, { align: "right" });

        // Legend, right-aligned under the org name
        drawLegend(doc, PAGE_W - MARGIN, 17, accent, hasBaseline);
      }

      // ---- Time scale ------------------------------------------------------
      // Month band
      doc.setDrawColor(COLOR_FAINT[0], COLOR_FAINT[1], COLOR_FAINT[2]);
      doc.setLineWidth(0.15);
      doc.setFillColor(250, 250, 251);
      doc.rect(CHART_X, scaleTop, CHART_W, MONTH_BAND_H, "F");

      let monthCursor = new Date(
        Date.UTC(timelineStart.getUTCFullYear(), timelineStart.getUTCMonth(), 1),
      );
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      while (monthCursor <= timelineEnd) {
        const nextMonth = new Date(
          Date.UTC(monthCursor.getUTCFullYear(), monthCursor.getUTCMonth() + 1, 1),
        );
        const x0 = Math.max(CHART_X, dayX(monthCursor));
        const x1 = Math.min(CHART_X + CHART_W, dayX(nextMonth));
        if (x1 > x0 + 0.5) {
          doc.setDrawColor(COLOR_FAINT[0], COLOR_FAINT[1], COLOR_FAINT[2]);
          doc.line(x0, scaleTop, x0, scaleTop + MONTH_BAND_H);
          const label = `${MONTH_NAMES[monthCursor.getUTCMonth()]} ${String(
            monthCursor.getUTCFullYear(),
          ).slice(2)}`;
          const width = doc.getTextWidth(label);
          if (x1 - x0 > width + 2) {
            doc.setTextColor(COLOR_INK[0], COLOR_INK[1], COLOR_INK[2]);
            doc.text(label, (x0 + x1) / 2, scaleTop + MONTH_BAND_H - 1.8, {
              align: "center",
            });
          }
        }
        monthCursor = nextMonth;
      }

      // Week band
      doc.setFillColor(255, 255, 255);
      doc.rect(CHART_X, scaleTop + MONTH_BAND_H, CHART_W, WEEK_BAND_H, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.6);
      const weekWidthMm = 7 * mmPerDay;
      const weekLabelEvery = weekWidthMm >= 6 ? 1 : weekWidthMm >= 3 ? 2 : 4;
      let weekCursor = startOfIsoWeek(timelineStart);
      let weekIndex = 0;
      const weekLines: number[] = [];
      while (weekCursor <= timelineEnd) {
        const x = dayX(weekCursor);
        if (x >= CHART_X - 0.01 && x <= CHART_X + CHART_W) {
          weekLines.push(x);
          if (weekIndex % weekLabelEvery === 0) {
            doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
            doc.text(
              `S${isoWeek(weekCursor)}`,
              x + weekWidthMm / 2,
              scaleTop + MONTH_BAND_H + WEEK_BAND_H - 1.4,
              { align: "center" },
            );
          }
        }
        weekCursor = addDays(weekCursor, 7);
        weekIndex++;
      }

      doc.setDrawColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
      doc.setLineWidth(0.25);
      doc.line(MARGIN, chartTop, PAGE_W - MARGIN, chartTop);

      // ---- Chart background ------------------------------------------------
      // Weekend shading (only when a day is wide enough to be visible)
      if (mmPerDay >= 0.45) {
        doc.setFillColor(COLOR_WEEKEND[0], COLOR_WEEKEND[1], COLOR_WEEKEND[2]);
        for (let i = 0; i < totalDays; i++) {
          const d = addDays(timelineStart, i);
          if (!isWeekend(d)) continue;
          doc.rect(dayX(d), chartTop, mmPerDay, chartBottom - chartTop, "F");
        }
      }

      // Week grid lines
      doc.setDrawColor(COLOR_GRID[0], COLOR_GRID[1], COLOR_GRID[2]);
      doc.setLineWidth(0.1);
      for (const x of weekLines) doc.line(x, chartTop, x, chartBottom);

      // ---- Rows ------------------------------------------------------------
      const rowIndexByTaskId = new Map<string, number>();
      pageRows.forEach((row, index) => {
        if (row.task?.id) rowIndexByTaskId.set(row.task.id, index);
      });

      pageRows.forEach((row, index) => {
        const top = rowTop(chartTop, index);
        const centerY = top + ROW_H / 2;

        if (row.kind === "phase" || row.kind === "section") {
          doc.setFillColor(COLOR_PHASE_BAND[0], COLOR_PHASE_BAND[1], COLOR_PHASE_BAND[2]);
          doc.rect(MARGIN, top, PAGE_W - MARGIN * 2, ROW_H, "F");
          if (row.kind === "phase") {
            doc.setFillColor(row.color[0], row.color[1], row.color[2]);
            doc.rect(MARGIN, top, 1.6, ROW_H, "F");
          }
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.2);
          doc.setTextColor(COLOR_INK[0], COLOR_INK[1], COLOR_INK[2]);
          doc.text(
            doc.splitTextToSize(row.label, LABEL_W - 8)[0],
            MARGIN + 3.5,
            centerY + 1.1,
          );

          // Phase summary band across the chart
          if (row.kind === "phase" && row.phase) {
            const ps = parseDate(row.phase.start_date);
            const pe = parseDate(row.phase.end_date);
            if (ps && pe) {
              const x0 = dayX(ps);
              const x1 = Math.max(x0 + 0.8, dayX(addDays(pe, 1)));
              const band = lighten(row.color, 0.55);
              doc.setFillColor(band[0], band[1], band[2]);
              doc.rect(x0, centerY - 0.9, x1 - x0, 1.8, "F");
              const cap = darken(row.color, 0.15);
              doc.setFillColor(cap[0], cap[1], cap[2]);
              doc.rect(x0, centerY - 1.6, 0.8, 3.2, "F");
              doc.rect(x1 - 0.8, centerY - 1.6, 0.8, 3.2, "F");
            }
          }
          return;
        }

        // Zebra striping for readability across 280mm
        if (index % 2 === 1) {
          doc.setFillColor(252, 252, 253);
          doc.rect(MARGIN, top, PAGE_W - MARGIN * 2, ROW_H, "F");
        }

        const task = row.task;
        const isCritical = task?.id ? criticalIds.has(task.id) : false;

        // Label column
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.8);
        doc.setTextColor(COLOR_INK[0], COLOR_INK[1], COLOR_INK[2]);
        const labelPrefix = row.kind === "milestone" ? "  " : "   ";
        const nameLine = doc.splitTextToSize(
          `${labelPrefix}${row.label}`,
          LABEL_W - 34,
        )[0];
        doc.text(nameLine, MARGIN + 1, centerY + 1);

        if (row.sublabel) {
          doc.setFontSize(5.6);
          doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
          const supplierLine = doc.splitTextToSize(row.sublabel, 30)[0];
          doc.text(supplierLine, MARGIN + LABEL_W - 32, centerY + 1);
        }

        // Dates / duration column
        doc.setFontSize(5.8);
        doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
        if (row.kind === "milestone") {
          doc.text(fmtDate(task?.start_date), CHART_X - 1.5, centerY + 1, {
            align: "right",
          });
        } else {
          doc.text(
            `${fmtDate(task?.start_date)} > ${fmtDate(task?.end_date)}  ${
              Number(task?.duration_days) || 0
            }j`,
            CHART_X - 1.5,
            centerY + 1,
            { align: "right" },
          );
        }

        if (isCritical) {
          doc.setFillColor(COLOR_CRITICAL[0], COLOR_CRITICAL[1], COLOR_CRITICAL[2]);
          doc.rect(MARGIN, top + 1, 0.7, ROW_H - 2, "F");
        }

        const start = parseDate(task?.start_date);
        const end = parseDate(task?.end_date);
        if (!start) return;

        if (row.kind === "milestone") {
          drawDiamond(doc, dayX(start), centerY, 1.9, row.color, isCritical);
          return;
        }

        if (!end) return;

        // Baseline ghost bar (drawn first, under the live bar)
        const bl = baseline[task.id];
        if (bl) {
          const bs = parseDate(bl.start_date);
          const be = parseDate(bl.end_date);
          if (bs && be) {
            const bx0 = dayX(bs);
            const bx1 = Math.max(bx0 + 0.6, dayX(addDays(be, 1)));
            doc.setFillColor(COLOR_BASELINE[0], COLOR_BASELINE[1], COLOR_BASELINE[2]);
            doc.rect(bx0, top + ROW_H - BASELINE_H - 0.35, bx1 - bx0, BASELINE_H, "F");
          }
        }

        // Live bar
        const x0 = dayX(start);
        const x1 = Math.max(x0 + 0.8, dayX(addDays(end, 1)));
        const barW = x1 - x0;
        const fill = lighten(row.color, 0.45);
        doc.setFillColor(fill[0], fill[1], fill[2]);
        doc.roundedRect(x0, top + BAR_INSET, barW, BAR_H, 0.5, 0.5, "F");

        const progress = Math.min(100, Math.max(0, Number(task?.progress) || 0));
        if (progress > 0) {
          const done = darken(row.color, 0.12);
          doc.setFillColor(done[0], done[1], done[2]);
          doc.rect(x0, top + BAR_INSET, (barW * progress) / 100, BAR_H, "F");
        }

        doc.setDrawColor(
          isCritical ? COLOR_CRITICAL[0] : darken(row.color, 0.25)[0],
          isCritical ? COLOR_CRITICAL[1] : darken(row.color, 0.25)[1],
          isCritical ? COLOR_CRITICAL[2] : darken(row.color, 0.25)[2],
        );
        doc.setLineWidth(isCritical ? 0.45 : 0.15);
        doc.roundedRect(x0, top + BAR_INSET, barW, BAR_H, 0.5, 0.5, "S");

        // Real execution overlay (migration 094)
        const actualStart = parseDate(task?.actual_start_date);
        const actualEnd = parseDate(task?.actual_end_date);
        if (actualStart) {
          const ax0 = dayX(actualStart);
          const ax1 = actualEnd
            ? Math.max(ax0 + 0.6, dayX(addDays(actualEnd, 1)))
            : ax0 + 0.8;
          doc.setFillColor(COLOR_INK[0], COLOR_INK[1], COLOR_INK[2]);
          doc.rect(ax0, top + 0.35, ax1 - ax0, ACTUAL_H, "F");
        }

        // In-bar label when the bar is wide enough to carry it
        if (barW >= 22) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(5.4);
          const ink = darken(row.color, 0.5);
          doc.setTextColor(ink[0], ink[1], ink[2]);
          const inner = doc.splitTextToSize(row.label, barW - 3)[0];
          doc.text(inner, x0 + 1.5, centerY + 0.9);
        }
      });

      // ---- Dependency connectors (same-page links only) ---------------------
      doc.setLineWidth(0.12);
      for (const dep of dependencies || []) {
        const fromIdx = rowIndexByTaskId.get(dep.predecessor_id);
        const toIdx = rowIndexByTaskId.get(dep.successor_id);
        if (fromIdx === undefined || toIdx === undefined) continue;

        const fromRow = pageRows[fromIdx];
        const toRow = pageRows[toIdx];
        const fromEnd = parseDate(fromRow.task?.end_date) || parseDate(fromRow.task?.start_date);
        const toStart = parseDate(toRow.task?.start_date);
        if (!fromEnd || !toStart) continue;

        const critical =
          criticalIds.has(dep.predecessor_id) && criticalIds.has(dep.successor_id);
        if (critical) {
          doc.setDrawColor(COLOR_CRITICAL[0], COLOR_CRITICAL[1], COLOR_CRITICAL[2]);
          doc.setLineWidth(0.3);
        } else {
          doc.setDrawColor(COLOR_BASELINE[0], COLOR_BASELINE[1], COLOR_BASELINE[2]);
          doc.setLineWidth(0.12);
        }

        const x1 = fromRow.kind === "milestone" ? dayX(fromEnd) : dayX(addDays(fromEnd, 1));
        const y1 = rowTop(chartTop, fromIdx) + ROW_H / 2;
        const x2 = dayX(toStart);
        const y2 = rowTop(chartTop, toIdx) + ROW_H / 2;

        // Elbow: out of the predecessor, down/up the gutter, into the successor
        const gutter = Math.min(2.2, Math.max(0.8, mmPerDay * 1.5));
        const midX = x2 > x1 + gutter * 2 ? x2 - gutter : x1 + gutter;
        doc.line(x1, y1, midX, y1);
        doc.line(midX, y1, midX, y2);
        doc.line(midX, y2, x2, y2);
        drawArrowHead(doc, x2, y2, critical ? COLOR_CRITICAL : COLOR_BASELINE);
      }

      // ---- Today line ------------------------------------------------------
      if (todayVisible) {
        const tx = dayX(today);
        doc.setDrawColor(COLOR_TODAY[0], COLOR_TODAY[1], COLOR_TODAY[2]);
        doc.setLineWidth(0.35);
        doc.line(tx, chartTop, tx, chartBottom);
        doc.setFillColor(COLOR_TODAY[0], COLOR_TODAY[1], COLOR_TODAY[2]);
        doc.setFontSize(5.4);
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        const label = "Auj.";
        const w = doc.getTextWidth(label) + 2;
        doc.rect(tx - w / 2, chartTop - 3.2, w, 3.2, "F");
        doc.text(label, tx, chartTop - 0.9, { align: "center" });
      }

      // ---- Chart frame -----------------------------------------------------
      doc.setDrawColor(COLOR_FAINT[0], COLOR_FAINT[1], COLOR_FAINT[2]);
      doc.setLineWidth(0.2);
      doc.rect(MARGIN, scaleTop, PAGE_W - MARGIN * 2, chartBottom - scaleTop, "S");
      doc.line(CHART_X, scaleTop, CHART_X, chartBottom);
    }

    // ── Footer on every page ─────────────────────────────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setDrawColor(COLOR_FAINT[0], COLOR_FAINT[1], COLOR_FAINT[2]);
      doc.setLineWidth(0.15);
      doc.line(MARGIN, PAGE_H - 11, PAGE_W - MARGIN, PAGE_H - 11);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
      doc.text(
        `${branding.name} — genere par Cantaia le ${fmtDate(new Date().toISOString())}`,
        MARGIN,
        PAGE_H - 6.5,
      );
      doc.text(`Page ${i}/${totalPages}`, PAGE_W - MARGIN, PAGE_H - 6.5, {
        align: "right",
      });
      if (totalPages > 1) {
        doc.text(
          `${projectName} — suite`,
          PAGE_W / 2,
          PAGE_H - 6.5,
          { align: "center" },
        );
      }
    }

    const pdfBuffer = doc.output("arraybuffer");
    const safeProjectName =
      projectName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "") || "Planning";
    const filename = `Planning_${safeProjectName}_${new Date().toISOString().split("T")[0]}.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[planning/export-pdf] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

function drawDiamond(
  doc: any,
  cx: number,
  cy: number,
  radius: number,
  color: Rgb,
  outlined: boolean,
) {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.triangle(cx, cy - radius, cx + radius, cy, cx, cy + radius, "F");
  doc.triangle(cx, cy - radius, cx - radius, cy, cx, cy + radius, "F");
  if (outlined) {
    doc.setDrawColor(COLOR_CRITICAL[0], COLOR_CRITICAL[1], COLOR_CRITICAL[2]);
    doc.setLineWidth(0.3);
    doc.line(cx, cy - radius, cx + radius, cy);
    doc.line(cx + radius, cy, cx, cy + radius);
    doc.line(cx, cy + radius, cx - radius, cy);
    doc.line(cx - radius, cy, cx, cy - radius);
  }
}

function drawArrowHead(doc: any, x: number, y: number, color: Rgb) {
  doc.setFillColor(color[0], color[1], color[2]);
  doc.triangle(x, y, x - 1.1, y - 0.6, x - 1.1, y + 0.6, "F");
}

function drawLegend(
  doc: any,
  rightX: number,
  y: number,
  accent: Rgb,
  hasBaseline: boolean,
) {
  const entries: Array<{ label: string; render: (x: number, cy: number) => void }> = [
    {
      label: "Tache",
      render: (x, cy) => {
        const fill = lighten(accent, 0.45);
        doc.setFillColor(fill[0], fill[1], fill[2]);
        doc.roundedRect(x, cy - 1.1, 5, 2.2, 0.4, 0.4, "F");
      },
    },
    {
      label: "Chemin critique",
      render: (x, cy) => {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(COLOR_CRITICAL[0], COLOR_CRITICAL[1], COLOR_CRITICAL[2]);
        doc.setLineWidth(0.4);
        doc.roundedRect(x, cy - 1.1, 5, 2.2, 0.4, 0.4, "FD");
      },
    },
    {
      label: "Jalon",
      render: (x, cy) => drawDiamond(doc, x + 2.5, cy, 1.7, MILESTONE_FALLBACK, false),
    },
    {
      label: "Hors d'eau / hors d'air",
      render: (x, cy) => {
        drawDiamond(doc, x + 1.6, cy, 1.5, MILESTONE_COLORS.hors_eau, false);
        drawDiamond(doc, x + 4.6, cy, 1.5, MILESTONE_COLORS.hors_air, false);
      },
    },
    {
      label: "Commande",
      render: (x, cy) => drawDiamond(doc, x + 2.5, cy, 1.7, MILESTONE_COLORS.procurement, false),
    },
    {
      label: "Reception",
      render: (x, cy) => drawDiamond(doc, x + 2.5, cy, 1.7, MILESTONE_COLORS.reception, false),
    },
  ];

  if (hasBaseline) {
    entries.push({
      label: "Baseline",
      render: (x, cy) => {
        doc.setFillColor(COLOR_BASELINE[0], COLOR_BASELINE[1], COLOR_BASELINE[2]);
        doc.rect(x, cy - 0.5, 5, 1, "F");
      },
    });
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);

  // Measure right-to-left so the strip ends flush with the right margin.
  const widths = entries.map((e) => 6.5 + doc.getTextWidth(e.label) + 5);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = rightX - total;
  const cy = y + 1.4;

  entries.forEach((entry, i) => {
    entry.render(x, cy);
    doc.setTextColor(COLOR_MUTED[0], COLOR_MUTED[1], COLOR_MUTED[2]);
    doc.text(entry.label, x + 6.5, cy + 0.9);
    x += widths[i];
  });
}
