/**
 * Shared contract for GET /api/search.
 *
 * Kept in its own module (not in `route.ts`) so client components can import
 * the types without pulling a route handler into the client graph.
 */

export const SEARCH_TYPES = [
  "project",
  "email",
  "task",
  "submission",
  "supplier",
  "plan",
  "meeting",
] as const;

export type SearchResultType = (typeof SEARCH_TYPES)[number];

export interface SearchResult {
  id: string;
  type: SearchResultType;
  /** Primary label — project name, email subject, task title… */
  title: string;
  /** Secondary line: code, client, sender, parent project… */
  subtitle: string | null;
  /** Locale-less app path; the caller prefixes `/{locale}`. */
  href: string;
  projectId?: string | null;
}

export interface SearchResponse {
  /** The sanitized term actually used for the query. */
  query: string;
  results: SearchResult[];
  total: number;
  /** Sources that errored — the response is still usable, just incomplete. */
  failed: SearchResultType[];
}

/** Minimum query length before the API touches the database. */
export const MIN_QUERY_LENGTH = 2;
