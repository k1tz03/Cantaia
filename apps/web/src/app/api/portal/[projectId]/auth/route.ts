import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPin, createPortalToken, getPortalCookieName, COOKIE_MAX_AGE_SECONDS } from "@/lib/portal/auth";

// Simple in-memory rate limiting (per-project)
const attempts: Record<string, { count: number; blockedUntil: number }> = {};
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION = 15 * 60 * 1000; // 15 min

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

    // Rate limiting
    const now = Date.now();
    const key = projectId;
    if (attempts[key] && attempts[key].blockedUntil > now) {
      return NextResponse.json({ error: "Too many attempts. Try again later.", code: "RATE_LIMITED" }, { status: 429 });
    }

    const admin = createAdminClient();

    const { data: project, error } = await admin
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
      // Track failed attempt
      if (!attempts[key]) attempts[key] = { count: 0, blockedUntil: 0 };
      attempts[key].count++;
      if (attempts[key].count >= MAX_ATTEMPTS) {
        attempts[key].blockedUntil = now + BLOCK_DURATION;
        attempts[key].count = 0;
      }
      return NextResponse.json({ error: "Invalid PIN", code: "INVALID_PIN" }, { status: 401 });
    }

    // Reset attempts on success
    delete attempts[key];

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
