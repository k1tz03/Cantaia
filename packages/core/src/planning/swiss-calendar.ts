// ═══════════════════════════════════════════════════════════════
// Cantaia — Swiss working calendar
//
// Week-ends alone are not a Swiss construction calendar: federal and
// cantonal public holidays plus the "vacances du bâtiment" remove
// 25-30 working days a year. Ignoring them made every generated
// schedule structurally optimistic (audit distortion D4).
// ═══════════════════════════════════════════════════════════════

// ============================================================================
// Types
// ============================================================================

export interface CalendarClosure {
  /** ISO date, inclusive */
  start: string;
  /** ISO date, inclusive */
  end: string;
  label: string;
}

export interface WorkingCalendar {
  /** Canton code the holidays were derived from ("VD", "GE", ...) */
  canton: string | null;
  /** Set of ISO dates (YYYY-MM-DD) that are public holidays */
  holidays: Set<string>;
  /** Company closure periods (vacances du bâtiment) */
  closures: CalendarClosure[];
  /** Working days per week (5 = Mon-Fri) */
  workingDaysPerWeek: number;
}

export interface BuildCalendarOptions {
  canton?: string | null;
  /** First and last year to cover (inclusive). Defaults to [now, now + 4]. */
  fromYear?: number;
  toYear?: number;
  /**
   * Building-trade closures. Pass `false` to disable, omit for the Swiss
   * default (3 weeks late July → mid-August + 2 weeks over Christmas).
   */
  closures?: CalendarClosure[] | false;
}

// ============================================================================
// Date helpers (all UTC-free, local-date semantics like the rest of the module)
// ============================================================================

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mkDate(year: number, month1: number, day: number): Date {
  return new Date(year, month1 - 1, day);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Easter Sunday (Gregorian, anonymous algorithm). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);   // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return mkDate(year, month, day);
}

/** Nth given weekday of a month (weekday: 0 = Sunday). */
function nthWeekdayOfMonth(year: number, month1: number, weekday: number, nth: number): Date {
  const first = mkDate(year, month1, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return addDays(first, offset + (nth - 1) * 7);
}

// ============================================================================
// Holidays
// ============================================================================

/** Holidays observed in essentially every canton. */
function commonHolidays(year: number): Array<{ date: Date; label: string }> {
  const easter = easterSunday(year);
  return [
    { date: mkDate(year, 1, 1), label: 'Nouvel An' },
    { date: addDays(easter, -2), label: 'Vendredi Saint' },
    { date: addDays(easter, 1), label: 'Lundi de Paques' },
    { date: addDays(easter, 39), label: 'Ascension' },
    { date: addDays(easter, 50), label: 'Lundi de Pentecote' },
    { date: mkDate(year, 8, 1), label: 'Fete nationale' },
    { date: mkDate(year, 12, 25), label: 'Noel' },
  ];
}

/**
 * Cantonal additions on top of `commonHolidays`.
 * Covers the cantons Cantaia actually operates in; unknown cantons fall back
 * to the common set (never throws).
 */
function cantonalHolidays(canton: string, year: number): Array<{ date: Date; label: string }> {
  const easter = easterSunday(year);
  const berchtold = { date: mkDate(year, 1, 2), label: 'Berchtold / 2 janvier' };
  const stEtienne = { date: mkDate(year, 12, 26), label: 'Saint-Etienne' };
  const feteDieu = { date: addDays(easter, 60), label: 'Fete-Dieu' };
  const premierMai = { date: mkDate(year, 5, 1), label: 'Fete du travail' };
  const toussaint = { date: mkDate(year, 11, 1), label: 'Toussaint' };
  const assomption = { date: mkDate(year, 8, 15), label: 'Assomption' };
  const immaculee = { date: mkDate(year, 12, 8), label: 'Immaculee Conception' };

  switch (canton) {
    case 'VD':
      return [
        berchtold,
        // Lundi du Jeûne fédéral : lundi après le 3e dimanche de septembre
        { date: addDays(nthWeekdayOfMonth(year, 9, 0, 3), 1), label: 'Lundi du Jeune federal' },
      ];
    case 'GE':
      return [
        // Jeûne genevois : jeudi qui suit le 1er dimanche de septembre
        { date: addDays(nthWeekdayOfMonth(year, 9, 0, 1), 4), label: 'Jeune genevois' },
        { date: mkDate(year, 12, 31), label: 'Restauration de la Republique' },
      ];
    case 'VS':
      return [feteDieu, assomption, toussaint, immaculee];
    case 'FR':
      return [feteDieu, assomption, toussaint, immaculee, stEtienne];
    case 'NE':
      return [
        berchtold,
        { date: mkDate(year, 3, 1), label: 'Instauration de la Republique' },
      ];
    case 'JU':
      return [
        berchtold,
        premierMai,
        feteDieu,
        { date: mkDate(year, 6, 23), label: 'Independance jurassienne' },
        toussaint,
      ];
    case 'BE':
      return [berchtold, stEtienne];
    case 'ZH':
      return [berchtold, premierMai, stEtienne];
    case 'BS':
    case 'BL':
      return [premierMai, stEtienne];
    case 'LU':
    case 'ZG':
    case 'SZ':
    case 'OW':
    case 'NW':
    case 'UR':
    case 'AI':
      return [berchtold, feteDieu, assomption, toussaint, immaculee, stEtienne];
    case 'TI':
      return [
        berchtold,
        { date: mkDate(year, 1, 6), label: 'Epiphanie' },
        premierMai,
        feteDieu,
        { date: mkDate(year, 6, 29), label: 'Saints Pierre et Paul' },
        assomption,
        toussaint,
        immaculee,
        stEtienne,
      ];
    default:
      return [berchtold, stEtienne];
  }
}

/** Normalize any canton input ("Vaud", "vd", "Lausanne") to a 2-letter code. */
export function normalizeCantonCode(canton: string | null | undefined): string | null {
  if (!canton) return null;
  const c = canton
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

  const MAP: Record<string, string> = {
    vd: 'VD', vaud: 'VD', lausanne: 'VD', yverdon: 'VD', nyon: 'VD', montreux: 'VD', vevey: 'VD',
    ge: 'GE', geneve: 'GE', genf: 'GE', geneva: 'GE',
    vs: 'VS', valais: 'VS', wallis: 'VS', sion: 'VS', martigny: 'VS', monthey: 'VS',
    fr: 'FR', fribourg: 'FR', freiburg: 'FR', bulle: 'FR',
    ne: 'NE', neuchatel: 'NE', neuenburg: 'NE',
    ju: 'JU', jura: 'JU', delemont: 'JU',
    be: 'BE', berne: 'BE', bern: 'BE', biel: 'BE', bienne: 'BE', thoune: 'BE',
    zh: 'ZH', zurich: 'ZH', winterthour: 'ZH',
    bs: 'BS', bale: 'BS', basel: 'BS',
    bl: 'BL',
    lu: 'LU', lucerne: 'LU', luzern: 'LU',
    zg: 'ZG', zoug: 'ZG', zug: 'ZG',
    sg: 'SG', 'st-gall': 'SG', 'saint-gall': 'SG',
    tg: 'TG', thurgovie: 'TG', thurgau: 'TG',
    gr: 'GR', grisons: 'GR', graubunden: 'GR',
    ag: 'AG', argovie: 'AG', aargau: 'AG',
    so: 'SO', soleure: 'SO', solothurn: 'SO',
    sh: 'SH', schaffhouse: 'SH',
    ai: 'AI', ar: 'AR', appenzell: 'AI',
    sz: 'SZ', schwyz: 'SZ',
    ow: 'OW', nw: 'NW', ur: 'UR', gl: 'GL',
    ti: 'TI', tessin: 'TI', ticino: 'TI', lugano: 'TI',
  };

  return MAP[c] ?? (c.length === 2 ? c.toUpperCase() : null);
}

// ============================================================================
// Building-trade closures (vacances du bâtiment)
// ============================================================================

/**
 * Swiss default building closures for a given year:
 *  - 3 weeks: from the Monday of the last full week of July
 *  - 2 weeks: 22 December → 4 January
 */
export function defaultBuildingClosures(year: number): CalendarClosure[] {
  // Monday on/after 21 July
  const anchor = mkDate(year, 7, 21);
  const offsetToMonday = (1 - anchor.getDay() + 7) % 7;
  const summerStart = addDays(anchor, offsetToMonday);
  const summerEnd = addDays(summerStart, 20); // 3 weeks inclusive

  return [
    { start: toIsoDate(summerStart), end: toIsoDate(summerEnd), label: 'Vacances du batiment (ete)' },
    { start: `${year}-12-22`, end: `${year + 1}-01-04`, label: 'Vacances du batiment (fin d annee)' },
  ];
}

// ============================================================================
// Builder
// ============================================================================

export function buildSwissCalendar(options: BuildCalendarOptions = {}): WorkingCalendar {
  const canton = normalizeCantonCode(options.canton);
  const thisYear = new Date().getFullYear();
  const fromYear = options.fromYear ?? thisYear;
  const toYear = options.toYear ?? fromYear + 4;

  const holidays = new Set<string>();
  const closures: CalendarClosure[] = [];

  for (let y = fromYear; y <= toYear; y++) {
    for (const h of commonHolidays(y)) holidays.add(toIsoDate(h.date));
    if (canton) {
      for (const h of cantonalHolidays(canton, y)) holidays.add(toIsoDate(h.date));
    }
    if (options.closures !== false && !options.closures) {
      closures.push(...defaultBuildingClosures(y));
    }
  }

  if (Array.isArray(options.closures)) {
    closures.push(...options.closures);
  }

  return { canton, holidays, closures, workingDaysPerWeek: 5 };
}

/** A calendar with week-ends only — the legacy behaviour, used as a default. */
export function weekendOnlyCalendar(): WorkingCalendar {
  return { canton: null, holidays: new Set(), closures: [], workingDaysPerWeek: 5 };
}

// ============================================================================
// Queries
// ============================================================================

function isWithinClosure(iso: string, closures: CalendarClosure[]): boolean {
  for (const c of closures) {
    if (iso >= c.start && iso <= c.end) return true;
  }
  return false;
}

/** True when the date can be worked (not a week-end / holiday / closure). */
export function isWorkingDay(date: Date, calendar?: WorkingCalendar | null): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return false;
  if (!calendar) return true;
  const iso = toIsoDate(date);
  if (calendar.holidays.has(iso)) return false;
  if (isWithinClosure(iso, calendar.closures)) return false;
  return true;
}

/** Label of the non-working reason, or null when the day is workable. */
export function nonWorkingReason(date: Date, calendar?: WorkingCalendar | null): string | null {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return 'week-end';
  if (!calendar) return null;
  const iso = toIsoDate(date);
  if (calendar.holidays.has(iso)) return 'jour ferie';
  const closure = calendar.closures.find((c) => iso >= c.start && iso <= c.end);
  return closure ? closure.label : null;
}

/** Move a date forward to the next workable day (no-op if already workable). */
export function nextWorkingDay(date: Date, calendar?: WorkingCalendar | null): Date {
  const result = new Date(date);
  let guard = 0;
  while (!isWorkingDay(result, calendar) && guard < 400) {
    result.setDate(result.getDate() + 1);
    guard++;
  }
  return result;
}
