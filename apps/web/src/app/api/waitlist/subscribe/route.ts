/**
 * POST /api/waitlist/subscribe
 *
 * Public endpoint for the pre-launch teaser page at /soon.
 * Captures an email into the `waitlist` table via the service role
 * (RLS has no public INSERT policy — admin client is required).
 *
 * Protection:
 *   - Zod validation (email + optional locale/source)
 *   - In-memory rate limit: 5 requests / IP / hour
 *   - Silent no-op on duplicate (avoids leaking whether an email is registered)
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api/parse-body";

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

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  if (!checkRateLimit(ip)) {
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
    if (insertError.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("[waitlist] Insert error:", insertError);
    return NextResponse.json(
      { error: "Impossible d'enregistrer votre email pour l'instant." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
