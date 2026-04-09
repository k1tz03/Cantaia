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
 *   - In-memory rate limit: 5 requests / IP / hour
 *   - Silent no-op on duplicate (avoids leaking whether an email is registered)
 *   - No confirmation email on duplicate (avoids double-sending + existence leak)
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api/parse-body";
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

// ─── In-memory rate limit (per serverless instance) ─────────────────────
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xrip = request.headers.get("x-real-ip");
  if (xrip) return xrip.trim();
  return "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  // Periodic cleanup (avoid unbounded growth)
  if (rateLimitMap.size > 5_000) {
    for (const [key, val] of rateLimitMap.entries()) {
      if (val.resetAt < now) rateLimitMap.delete(key);
    }
  }

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
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

  if (!checkRateLimit(ip)) {
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
      { status: 429 },
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
