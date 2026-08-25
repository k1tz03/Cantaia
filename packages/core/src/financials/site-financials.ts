// ============================================================
// Cantaia — Financials core (site reports → CHF)
// ============================================================
// SINGLE source of truth for the "hours → francs" chain.
//
// Before this module the same aggregation lived (differently) in four places:
//   /api/projects/[id]/financials, /api/direction/stats,
//   /api/cron/sync-financials and ProjectFinancialsSection (client recompute).
// Three of them ignored labour entirely — the margin they published was
// `invoiced - purchases`, i.e. structurally wrong for a construction company —
// and each applied a different report-status filter, so drafts silently moved
// the margin in some views and not in others.
//
// Rules encoded here (and nowhere else):
//   * Only reports with status ∈ COUNTED_REPORT_STATUSES are money.
//     A draft is a field note, never a financial fact.
//   * Hourly rate cascade, per entry:
//       entry.hourly_rate_chf → crew member.hourly_rate_chf →
//       organizations.pricing_config.hourly_rate → DEFAULT_HOURLY_RATE (95)
//   * margin = invoiced − purchases − laborCost − machineCost
//     machineCost is 0 unless a machine rate exists (per entry or configured);
//     machineHours is always exposed so the UI can say "not valued yet".
//
// Columns `site_report_entries.hourly_rate_chf` / `cfc_code` /
// `planning_task_id` / `supplier_id` and `portal_crew_members.hourly_rate_chf`
// come from migration 093 (owned by another agent). Everything here degrades
// to the org-level rate when they are absent, so it is safe to ship before it.

/** Report statuses that count as financial facts. Drafts never do. */
export const COUNTED_REPORT_STATUSES = ["submitted", "locked"] as const;
export type CountedReportStatus = (typeof COUNTED_REPORT_STATUSES)[number];

/** Fallback hourly rate when the org has no `pricing_config.hourly_rate`. */
export const DEFAULT_HOURLY_RATE = 95;

/**
 * Always select `*` on site_report_entries / site_reports.
 * Migration 093 adds columns this code reads; an explicit column list would
 * make every query 400 (PostgREST) on databases where 093 is not applied yet,
 * and supabase-js does not throw — the failure would be silent.
 */
export const SITE_ENTRY_COLUMNS = "*";

export type SiteEntryType = "labor" | "machine" | "delivery_note";

/** Shape this module reads. Extra columns are ignored, missing ones tolerated. */
export interface SiteReportEntryLike {
  id?: string;
  report_id?: string;
  entry_type: string;
  duration_hours?: number | string | null;
  crew_member_id?: string | null;
  /** migration 093 */
  hourly_rate_chf?: number | string | null;
  /** migration 093 */
  cfc_code?: string | null;
  /** migration 093 */
  supplier_id?: string | null;
  machine_description?: string | null;
  is_rented?: boolean | null;
  work_description?: string | null;
  is_driver?: boolean | null;
  note_number?: string | null;
  supplier_name?: string | null;
  [key: string]: unknown;
}

/** Contract shape (see contracts.md). `laborCost`/`machineCost` are filled in
 *  only when rates are supplied to `aggregateSiteEntries`. */
export interface SiteAggregates {
  laborHours: number;
  machineHours: number;
  deliveryNotes: number;
  workers: Set<string> | number;
  /** Valued labour, CHF — present only when `rates` was passed. */
  laborCost?: number;
  /** Valued machines, CHF — present only when `rates` was passed. */
  machineCost?: number;
  /** False when no machine rate could be resolved (machineCost is then 0). */
  machineValued?: boolean;
}

export interface RateContext {
  /** crew_member_id → hourly rate (CHF), from portal_crew_members. */
  crewRates?: Record<string, number | null | undefined>;
  /** organizations.pricing_config.hourly_rate, or DEFAULT_HOURLY_RATE. */
  defaultRate?: number;
  /** organizations.pricing_config.machine_rate — undefined = not configured. */
  machineRate?: number | null;
}

/** CHF rounding — 2 decimals, no float dust. */
export function roundChf(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

/** A rate is usable when it parses to a finite, non-negative number. */
function usableRate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Read the org hourly rate out of `organizations.pricing_config` (JSONB).
 * Falls back to DEFAULT_HOURLY_RATE — never returns 0 by accident, because a
 * 0 rate would silently publish a labour cost of zero.
 */
export function resolveOrgHourlyRate(pricingConfig: unknown): number {
  const cfg = (pricingConfig || {}) as Record<string, unknown>;
  const rate = usableRate(cfg.hourly_rate);
  return rate !== null && rate > 0 ? rate : DEFAULT_HOURLY_RATE;
}

/**
 * Machine rate from `organizations.pricing_config.machine_rate`.
 * `null` means "not configured" → machine hours are counted but not valued.
 */
export function resolveOrgMachineRate(pricingConfig: unknown): number | null {
  const cfg = (pricingConfig || {}) as Record<string, unknown>;
  return usableRate(cfg.machine_rate);
}

/** crew rows → { id: hourly_rate_chf } map for the rate cascade. */
export function buildCrewRateMap(
  crew: Array<{ id: string; hourly_rate_chf?: number | string | null }> | null | undefined,
): Record<string, number | null> {
  const map: Record<string, number | null> = {};
  for (const c of crew || []) {
    if (!c?.id) continue;
    map[c.id] = usableRate(c.hourly_rate_chf);
  }
  return map;
}

/**
 * The rate cascade, in one place:
 *   entry rate → crew member rate → org rate → DEFAULT_HOURLY_RATE.
 */
export function resolveEntryHourlyRate(
  entry: SiteReportEntryLike,
  rates: RateContext = {},
): number {
  const entryRate = usableRate(entry.hourly_rate_chf);
  if (entryRate !== null) return entryRate;

  if (entry.crew_member_id) {
    const crewRate = usableRate(rates.crewRates?.[entry.crew_member_id]);
    if (crewRate !== null) return crewRate;
  }

  const orgRate = usableRate(rates.defaultRate);
  return orgRate !== null && orgRate > 0 ? orgRate : DEFAULT_HOURLY_RATE;
}

/**
 * Machine rate for one entry: an explicit rate on the entry wins, otherwise the
 * org-configured machine rate. `null` = no rate → the hours stay unvalued.
 */
export function resolveEntryMachineRate(
  entry: SiteReportEntryLike,
  rates: RateContext = {},
): number | null {
  const entryRate = usableRate(entry.hourly_rate_chf);
  if (entryRate !== null) return entryRate;
  return usableRate(rates.machineRate);
}

/**
 * Aggregate raw site_report_entries rows.
 * Pass `rates` to also get `laborCost` / `machineCost` valued with the cascade.
 */
export function aggregateSiteEntries(
  entries: SiteReportEntryLike[] | null | undefined,
  rates?: RateContext,
): SiteAggregates {
  let laborHours = 0;
  let machineHours = 0;
  let deliveryNotes = 0;
  let laborCost = 0;
  let machineCost = 0;
  let machineValued = false;
  const workers = new Set<string>();

  for (const entry of entries || []) {
    if (!entry) continue;
    const hours = toNumber(entry.duration_hours);

    if (entry.entry_type === "labor") {
      laborHours += hours;
      if (entry.crew_member_id) workers.add(entry.crew_member_id);
      if (rates) laborCost += hours * resolveEntryHourlyRate(entry, rates);
    } else if (entry.entry_type === "machine") {
      machineHours += hours;
      if (rates) {
        const rate = resolveEntryMachineRate(entry, rates);
        if (rate !== null) {
          machineCost += hours * rate;
          machineValued = true;
        }
      }
    } else if (entry.entry_type === "delivery_note") {
      deliveryNotes += 1;
    }
  }

  const result: SiteAggregates = {
    laborHours: roundChf(laborHours),
    machineHours: roundChf(machineHours),
    deliveryNotes,
    workers,
  };

  if (rates) {
    result.laborCost = roundChf(laborCost);
    result.machineCost = roundChf(machineCost);
    result.machineValued = machineValued;
  }

  return result;
}

export interface ProjectFinancialsInput {
  invoiced: number;
  purchases: number;
  laborHours: number;
  machineHours: number;
  hourlyRate: number;
  machineRate?: number | null;
  /** Pre-valued labour (per-entry rates) — wins over laborHours × hourlyRate. */
  laborCost?: number;
  /** Pre-valued machines — wins over machineHours × machineRate. */
  machineCost?: number;
}

export interface ProjectFinancials {
  laborCost: number;
  machineCost: number;
  margin: number;
  /** null when nothing was invoiced — a percentage of zero is meaningless. */
  marginPct: number | null;
}

/**
 * The real margin: invoiced − purchases − labour − machines.
 *
 * Machines are only subtracted when a rate exists; otherwise machineCost is 0
 * and the caller must surface machineHours so the number is honestly incomplete
 * rather than quietly wrong.
 */
export function computeProjectFinancials(i: ProjectFinancialsInput): ProjectFinancials {
  const invoiced = toNumber(i.invoiced);
  const purchases = toNumber(i.purchases);

  const laborCost =
    i.laborCost !== undefined && i.laborCost !== null
      ? toNumber(i.laborCost)
      : toNumber(i.laborHours) * (usableRate(i.hourlyRate) ?? DEFAULT_HOURLY_RATE);

  const resolvedMachineRate = usableRate(i.machineRate);
  const machineCost =
    i.machineCost !== undefined && i.machineCost !== null
      ? toNumber(i.machineCost)
      : resolvedMachineRate !== null
        ? toNumber(i.machineHours) * resolvedMachineRate
        : 0;

  const margin = invoiced - purchases - laborCost - machineCost;

  return {
    laborCost: roundChf(laborCost),
    machineCost: roundChf(machineCost),
    margin: roundChf(margin),
    marginPct: invoiced > 0 ? roundChf((margin / invoiced) * 100) : null,
  };
}

/** One valued labour line — used by the payroll export and the régie sheet. */
export interface ValuedLaborLine {
  entry_id: string | null;
  report_id: string | null;
  report_date: string | null;
  project_id: string | null;
  project_name: string;
  crew_member_id: string | null;
  crew_member_name: string;
  crew_member_role: string;
  work_description: string;
  cfc_code: string | null;
  is_driver: boolean;
  hours: number;
  rate_chf: number;
  amount_chf: number;
}

export interface ValuedMachineLine {
  entry_id: string | null;
  report_id: string | null;
  report_date: string | null;
  project_id: string | null;
  project_name: string;
  machine_description: string;
  is_rented: boolean;
  cfc_code: string | null;
  hours: number;
  /** null when no machine rate is configured — hours counted, not valued. */
  rate_chf: number | null;
  amount_chf: number | null;
}

export interface LineContext {
  reportDate?: string | null;
  projectId?: string | null;
  projectName?: string;
  crewName?: string;
  crewRole?: string;
}

/** Value one labour entry into a flat, export-ready line. */
export function toValuedLaborLine(
  entry: SiteReportEntryLike,
  rates: RateContext,
  ctx: LineContext = {},
): ValuedLaborLine {
  const hours = toNumber(entry.duration_hours);
  const rate = resolveEntryHourlyRate(entry, rates);
  return {
    entry_id: (entry.id as string) || null,
    report_id: (entry.report_id as string) || null,
    report_date: ctx.reportDate ?? null,
    project_id: ctx.projectId ?? null,
    project_name: ctx.projectName ?? "",
    crew_member_id: entry.crew_member_id ?? null,
    crew_member_name: ctx.crewName || "",
    crew_member_role: ctx.crewRole || "",
    work_description: (entry.work_description as string) || "",
    cfc_code: (entry.cfc_code as string) || null,
    is_driver: entry.is_driver === true,
    hours: roundChf(hours),
    rate_chf: roundChf(rate),
    amount_chf: roundChf(hours * rate),
  };
}

/** Value one machine entry into a flat, export-ready line. */
export function toValuedMachineLine(
  entry: SiteReportEntryLike,
  rates: RateContext,
  ctx: LineContext = {},
): ValuedMachineLine {
  const hours = toNumber(entry.duration_hours);
  const rate = resolveEntryMachineRate(entry, rates);
  return {
    entry_id: (entry.id as string) || null,
    report_id: (entry.report_id as string) || null,
    report_date: ctx.reportDate ?? null,
    project_id: ctx.projectId ?? null,
    project_name: ctx.projectName ?? "",
    machine_description: (entry.machine_description as string) || "",
    is_rented: entry.is_rented === true,
    cfc_code: (entry.cfc_code as string) || null,
    hours: roundChf(hours),
    rate_chf: rate !== null ? roundChf(rate) : null,
    amount_chf: rate !== null ? roundChf(hours * rate) : null,
  };
}

/** Payroll grouping key: one row per worker × day × project. */
export interface PayrollRow {
  report_date: string;
  project_id: string;
  project_name: string;
  crew_member_id: string | null;
  crew_member_name: string;
  crew_member_role: string;
  cfc_codes: string[];
  hours: number;
  /** Weighted average when the day mixes several rates. */
  rate_chf: number;
  amount_chf: number;
}

/**
 * Collapse valued labour lines into payroll rows (worker × day × project).
 * Lines with different rates on the same day are merged with a weighted average
 * rate so `hours × rate ≈ amount` stays true on the payslip.
 */
export function buildPayrollRows(lines: ValuedLaborLine[]): PayrollRow[] {
  const byKey = new Map<string, PayrollRow & { _cfc: Set<string> }>();

  for (const line of lines) {
    const key = [
      line.report_date || "",
      line.project_id || "",
      line.crew_member_id || line.crew_member_name || "",
    ].join("|");

    let row = byKey.get(key);
    if (!row) {
      row = {
        report_date: line.report_date || "",
        project_id: line.project_id || "",
        project_name: line.project_name,
        crew_member_id: line.crew_member_id,
        crew_member_name: line.crew_member_name,
        crew_member_role: line.crew_member_role,
        cfc_codes: [],
        hours: 0,
        rate_chf: 0,
        amount_chf: 0,
        _cfc: new Set<string>(),
      };
      byKey.set(key, row);
    }

    row.hours += line.hours;
    row.amount_chf += line.amount_chf;
    if (line.cfc_code) row._cfc.add(line.cfc_code);
  }

  return Array.from(byKey.values())
    .map((row) => {
      const hours = roundChf(row.hours);
      const amount = roundChf(row.amount_chf);
      return {
        report_date: row.report_date,
        project_id: row.project_id,
        project_name: row.project_name,
        crew_member_id: row.crew_member_id,
        crew_member_name: row.crew_member_name,
        crew_member_role: row.crew_member_role,
        cfc_codes: Array.from(row._cfc).sort(),
        hours,
        rate_chf: hours > 0 ? roundChf(amount / hours) : 0,
        amount_chf: amount,
      };
    })
    .sort(
      (a, b) =>
        a.report_date.localeCompare(b.report_date) ||
        a.crew_member_name.localeCompare(b.crew_member_name) ||
        a.project_name.localeCompare(b.project_name),
    );
}

/** Trim + lowercase — the fallback identity for free-text supplier names. */
export function normalizeSupplierName(name: unknown): string {
  return typeof name === "string" ? name.trim().toLowerCase() : "";
}
