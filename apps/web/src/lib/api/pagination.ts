/**
 * Pagination utilities for API routes.
 * Usage: const { from, to, page, limit } = parsePagination(request);
 *        query.range(from, to)
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface PaginationParams {
  page: number;
  limit: number;
  from: number;
  to: number;
}

export function parsePagination(request: Request): PaginationParams {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const rawLimit = parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { page, limit, from, to };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export function paginatedJson<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / params.limit);
  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasMore: params.page < totalPages,
    },
  };
}
