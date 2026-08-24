import { timingSafeEqual } from "node:crypto";

/**
 * Shared CRON authorization helper.
 *
 * Vercel Cron invokes scheduled paths with **GET** and sends
 * `Authorization: Bearer ${CRON_SECRET}`. Some internal callers
 * (e.g. `/api/admin/compute-daily-metrics`) historically used the
 * legacy `x-cron-secret: ${CRON_SECRET}` header, so both are accepted.
 *
 * Fail-closed: when `CRON_SECRET` is unset, nothing is authorized.
 */

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual throws on length mismatch — compare lengths first.
  if (bufA.length !== bufB.length) return false;
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Returns true when the incoming request carries a valid CRON credential.
 * Accepts both the Vercel Cron header and the legacy header.
 */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  // (a) Vercel Cron / super-admin run-cron: Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (match && safeEqual(match[1], secret)) return true;
  }

  // (b) Legacy header: x-cron-secret: <CRON_SECRET>
  const legacy = req.headers.get("x-cron-secret");
  if (legacy && safeEqual(legacy.trim(), secret)) return true;

  return false;
}
