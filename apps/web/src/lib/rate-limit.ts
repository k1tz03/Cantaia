import { createAdminClient } from "@/lib/supabase/admin";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export interface RateLimitOptions {
  /** Max hits per window */
  limit: number;
  /** Window size in seconds */
  windowSec: number;
}

// In-memory fallback when the RPC is unavailable (dev without migration 079).
// Per-instance only — the DB path is the authoritative distributed limiter.
const memoryHits = new Map<string, { windowStart: number; count: number }>();

function memoryFallback(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const windowStart = Math.floor(now / (opts.windowSec * 1000)) * opts.windowSec * 1000;
  const entry = memoryHits.get(key);
  if (!entry || entry.windowStart !== windowStart) {
    memoryHits.set(key, { windowStart, count: 1 });
    if (memoryHits.size > 10_000) memoryHits.clear();
    return { allowed: true, remaining: opts.limit - 1, retryAfterSec: 0 };
  }
  entry.count += 1;
  const allowed = entry.count <= opts.limit;
  return {
    allowed,
    remaining: Math.max(opts.limit - entry.count, 0),
    retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((windowStart + opts.windowSec * 1000 - now) / 1000)),
  };
}

/**
 * Distributed fixed-window rate limiter backed by Postgres (migration 079).
 * Fails open on unexpected errors (availability over strictness), but logs them.
 *
 * Key convention: "<scope>:<subject>", e.g. "ai:user:<uuid>", "portal-pin:<projectId>:<ip>".
 */
export async function rateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await (admin as any).rpc("rate_limit_hit", {
      p_key: key,
      p_limit: opts.limit,
      p_window_sec: opts.windowSec,
    });
    if (error) {
      // 42883 = function does not exist (migration not applied yet)
      if (error.code === "42883" || /rate_limit_hit/.test(error.message ?? "")) {
        return memoryFallback(key, opts);
      }
      console.error("[rate-limit] RPC error, failing open:", error.message);
      return { allowed: true, remaining: opts.limit, retryAfterSec: 0 };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { allowed: true, remaining: opts.limit, retryAfterSec: 0 };
    return {
      allowed: row.allowed === true,
      remaining: row.remaining ?? 0,
      retryAfterSec: row.retry_after_sec ?? 0,
    };
  } catch (err) {
    console.error("[rate-limit] unexpected error, failing open:", err);
    return { allowed: true, remaining: opts.limit, retryAfterSec: 0 };
  }
}

/** Standard 429 JSON body for rate-limited API responses. */
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: "rate_limited",
      message: "Trop de requêtes. Réessayez dans quelques instants.",
      retry_after_sec: result.retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSec || 1),
      },
    }
  );
}
