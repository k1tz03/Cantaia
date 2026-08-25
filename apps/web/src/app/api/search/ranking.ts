import type { SearchResultType } from "./types";

/** Longest term we will ever send to the database. */
export const MAX_QUERY_LENGTH = 80;

/**
 * Strip characters that are structural inside a PostgREST `.or()` expression
 * (`,` separates filters, `()` group them, quotes/backslash escape values) plus
 * the `ilike` wildcards, so a user cannot inject an extra filter or craft a
 * pathological pattern.
 *
 * `.` and `-` are deliberately preserved: plan numbers ("A-101.2") and CFC
 * codes ("215.3") are among the most searched strings in this product, and
 * extra dots inside a value are harmless — PostgREST splits a filter on its
 * first two dots only, so the rest lands in the value.
 */
export function sanitizeTerm(raw: string): string {
  return raw
    .replace(/[,()%_*\\"'`\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

/**
 * Unicode letter or digit. `\b` is deliberately NOT used: it is ASCII-only, so
 * in French text ("prédalle", "béton armé") an accent reads as a word boundary
 * and mid-word matches get over-ranked.
 */
const WORD_CHAR = /[\p{L}\p{N}]/u;

export const SCORE_EXACT = 100;
export const SCORE_PREFIX = 80;
export const SCORE_WORD_START = 60;
export const SCORE_SUBSTRING = 40;

/**
 * Cheap relevance score: an exact match beats a prefix, a prefix beats a match
 * at the start of a word, which beats a match anywhere in the string.
 * The best score across all supplied fields wins.
 */
export function scoreMatch(term: string, ...fields: (string | null | undefined)[]): number {
  const q = term.toLowerCase();
  if (!q) return 0;

  let best = 0;
  for (const field of fields) {
    if (!field) continue;
    const value = field.toLowerCase();
    if (value === q) return SCORE_EXACT;

    // Walk every occurrence: "prédalle dalle" matches mid-word first but also
    // at a real word start, and the better of the two should win.
    for (let idx = value.indexOf(q); idx !== -1; idx = value.indexOf(q, idx + 1)) {
      if (idx === 0) {
        best = Math.max(best, SCORE_PREFIX);
        break; // nothing after a prefix match can score higher in this field
      }
      best = Math.max(best, WORD_CHAR.test(value[idx - 1]) ? SCORE_SUBSTRING : SCORE_WORD_START);
    }
  }
  return best;
}

/** Projects always float to the top; everything else sorts on relevance. */
export function typeRank(type: SearchResultType): number {
  return type === "project" ? 0 : 1;
}

/** Ordering contract: projects first, then relevance, then alphabetical. */
export function compareResults(
  a: { type: SearchResultType; title: string; score: number },
  b: { type: SearchResultType; title: string; score: number }
): number {
  const rank = typeRank(a.type) - typeRank(b.type);
  if (rank !== 0) return rank;
  if (b.score !== a.score) return b.score - a.score;
  return a.title.localeCompare(b.title);
}
