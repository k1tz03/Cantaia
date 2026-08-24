import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPin, createPortalToken, getPortalCookieName, COOKIE_MAX_AGE_SECONDS } from "@/lib/portal/auth";
import { rateLimit } from "@/lib/rate-limit";

// Distributed rate limiting (migration 079 RPC, in-memory fallback in dev).
// Two independent budgets:
//   - per IP + project: stops a single attacker brute-forcing 10^6 PINs
//   - per project:      caps total damage, but high enough that one attacker
//                       cannot lock out the whole crew (the old in-memory
//                       per-project counter blocked everyone after 5 tries)
const PIN_WINDOW_SEC = 15 * 60; // 15 min
const PIN_MAX_PER_IP = 5;
const PIN_MAX_PER_PROJECT = 30;

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const { pin, userName } = body;

    if (!pin || typeof pin !== "string" || pin.length !== 6) {
      return NextResponse.json({ error: "Invalid PIN format" }, { status: 400 });
    }

    if (!userName || typeof userName !== "string" || userName.trim().length < 2) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Rate limiting — persistent (survives serverless cold starts / instances)
    // NOTE: a whole crew behind one site NAT shares an IP; the per-project
    // budget is deliberately much higher so one attacker cannot lock them out.
    const ip = getClientIp(request);
    const [ipLimit, projectLimit] = await Promise.all([
      rateLimit(`portal-pin:${projectId}:${ip}`, { limit: PIN_MAX_PER_IP, windowSec: PIN_WINDOW_SEC }),
      rateLimit(`portal-pin:${projectId}`, { limit: PIN_MAX_PER_PROJECT, windowSec: PIN_WINDOW_SEC }),
    ]);

    if (!ipLimit.allowed || !projectLimit.allowed) {
      const retryAfter = Math.max(ipLimit.retryAfterSec, projectLimit.retryAfterSec, 1);
      return NextResponse.json(
        { error: "Too many attempts. Try again later.", code: "RATE_LIMITED", retry_after_sec: retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const admin = createAdminClient();

    const { data: project, error } = await (admin as any)
      .from("projects")
      .select("id, portal_enabled, portal_pin_hash, portal_pin_salt")
      .eq("id", projectId)
      .single();

    if (error || !project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.portal_enabled) {
      return NextResponse.json({ error: "Portal disabled" }, { status: 403 });
    }

    if (!project.portal_pin_hash || !project.portal_pin_salt) {
      return NextResponse.json({ error: "Portal not configured" }, { status: 403 });
    }

    const valid = verifyPin(pin, project.portal_pin_salt, project.portal_pin_hash);

    if (!valid) {
      // The attempt was already counted against both budgets above.
      return NextResponse.json(
        { error: "Invalid PIN", code: "INVALID_PIN", remaining_attempts: ipLimit.remaining },
        { status: 401 },
      );
    }

    // Create JWT token
    const token = await createPortalToken(projectId, project.portal_pin_salt, userName.trim());

    const response = NextResponse.json({ success: true, userName: userName.trim() });
    response.cookies.set(getPortalCookieName(projectId), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[Portal Auth] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
