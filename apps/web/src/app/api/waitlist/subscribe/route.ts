/**
 * POST /api/waitlist/subscribe
 *
 * Public endpoint for the pre-launch teaser page at /soon.
 * Captures an email into the `waitlist` table via the service role
 * (RLS has no public INSERT policy — admin client is required).
 *
 * On successful insert, fires a confirmation email via Resend
 * (fire-and-forget so HTTP response latency stays low).
 *
 * Protection:
 *   - Zod validation (email + optional locale/source)
 *   - Distributed rate limit: 5 requests / IP / hour (Postgres-backed, migration 079)
 *   - Silent no-op on duplicate (avoids leaking whether an email is registered)
 *   - No confirmation email on duplicate (avoids double-sending + existence leak)
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api/parse-body";
import { rateLimit } from "@/lib/rate-limit";
import {
  WAITLIST_CONFIRMATION_FROM,
  WAITLIST_CONFIRMATION_HTML,
  WAITLIST_CONFIRMATION_SUBJECT,
} from "@/lib/emails/waitlist-confirmation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  locale: z.enum(["fr", "en", "de"]).optional(),
  source: z.string().trim().min(1).max(64).optional(),
});

// ─── Rate limit: 5 / IP / hour, shared across serverless instances ──────
const RATE_LIMIT_WINDOW_SEC = 60 * 60; // 1 hour
const RATE_LIMIT_MAX = 5;

/**
 * Resolve the caller IP from proxy headers.
 *
 * `x-forwarded-for` is a client-appendable list: a spoofed request can prepend
 * arbitrary values, so the FIRST entry is attacker-controlled. Each trusted
 * proxy appends the address it actually saw, therefore the LAST hop is the one
 * written by the edge that terminated our connection — that is the value we key
 * the rate limiter on. Falls back to `x-real-ip` (set by the platform).
 */
function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  const xrip = request.headers.get("x-real-ip");
  if (xrip) return xrip.trim();
  return "unknown";
}

// ─── Resend confirmation email (fire-and-forget) ─────────────────────────
/**
 * Sends the waitlist confirmation email via Resend. Never throws — all errors
 * are logged and swallowed so the HTTP response is not blocked or failed when
 * Resend is misconfigured, rate-limited, or temporarily unavailable.
 *
 * Uses a dynamic `import("resend")` to match the convention in
 * `/api/cron/briefing` and avoid bundling the SDK when `RESEND_API_KEY` is
 * unset (e.g., in local dev).
 */
async function sendConfirmationEmail(email: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(
      JSON.stringify({
        level: "info",
        msg: "waitlist_email_skipped",
        route: "/api/waitlist/subscribe",
        reason: "RESEND_API_KEY not set",
      }),
    );
    return;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: WAITLIST_CONFIRMATION_FROM,
      to: [email],
      subject: WAITLIST_CONFIRMATION_SUBJECT,
      html: WAITLIST_CONFIRMATION_HTML,
    });
    if (error) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "waitlist_email_failed",
          route: "/api/waitlist/subscribe",
          email_domain: email.split("@")[1] ?? "unknown",
          error: error.message ?? String(error),
        }),
      );
      return;
    }
    console.log(
      JSON.stringify({
        level: "info",
        msg: "waitlist_email_sent",
        route: "/api/waitlist/subscribe",
        email_domain: email.split("@")[1] ?? "unknown",
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "waitlist_email_failed",
        route: "/api/waitlist/subscribe",
        email_domain: email.split("@")[1] ?? "unknown",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const requestId = request.headers.get("x-vercel-id") ?? undefined;
  console.log(
    JSON.stringify({
      level: "info",
      msg: "start",
      route: "/api/waitlist/subscribe",
      requestId,
    }),
  );

  const ip = getClientIp(request);

  const limit = await rateLimit(`waitlist:${ip}`, {
    limit: RATE_LIMIT_MAX,
    windowSec: RATE_LIMIT_WINDOW_SEC,
  });
  if (!limit.allowed) {
    console.log(
      JSON.stringify({
        level: "warn",
        msg: "rate_limited",
        route: "/api/waitlist/subscribe",
        requestId,
        ms: Date.now() - start,
      }),
    );
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans une heure." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec || RATE_LIMIT_WINDOW_SEC) },
      },
    );
  }

  const { data, error: parseError } = await parseBody<unknown>(request);
  if (parseError) {
    return NextResponse.json({ error: parseError }, { status: 400 });
  }

  const result = bodySchema.safeParse(data);
  if (!result.success) {
    return NextResponse.json(
      { error: "Adresse email invalide." },
      { status: 400 },
    );
  }

  const { email, locale, source } = result.data;
  const userAgent = request.headers.get("user-agent");
  const referrer = request.headers.get("referer");

  const admin = createAdminClient();
  const { error: insertError } = await (admin as unknown as {
    from: (table: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: { code?: string; message?: string } | null }>;
    };
  })
    .from("waitlist")
    .insert({
      email,
      locale: locale ?? null,
      source: source ?? "teaser",
      ip_address: ip === "unknown" ? null : ip,
      user_agent: userAgent,
      referrer,
    });

  if (insertError) {
    // 23505 = unique_violation. Return success silently — don't leak existence.
    // Intentionally do NOT resend the confirmation email here: the user already
    // received one on their first signup, and sending again would both annoy
    // them and leak the fact that the address was already registered.
    if (insertError.code === "23505") {
      console.log(
        JSON.stringify({
          level: "info",
          msg: "done",
          route: "/api/waitlist/subscribe",
          requestId,
          duplicate: true,
          ms: Date.now() - start,
        }),
      );
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error(
      JSON.stringify({
        level: "error",
        msg: "insert_failed",
        route: "/api/waitlist/subscribe",
        requestId,
        error: insertError.message ?? String(insertError),
        ms: Date.now() - start,
      }),
    );
    return NextResponse.json(
      { error: "Impossible d'enregistrer votre email pour l'instant." },
      { status: 500 },
    );
  }

  // Fire-and-forget confirmation email. Resend latency (~300–800ms) must not
  // block the HTTP response to the visitor. Errors are already logged and
  // swallowed inside `sendConfirmationEmail`.
  void sendConfirmationEmail(email);

  console.log(
    JSON.stringify({
      level: "info",
      msg: "done",
      route: "/api/waitlist/subscribe",
      requestId,
      ms: Date.now() - start,
    }),
  );
  return NextResponse.json({ ok: true });
}
