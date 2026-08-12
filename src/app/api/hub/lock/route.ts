import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/admin/require-superadmin";
import { generateSalt, hashPin, verifyPin } from "@/lib/security/pin";
import {
  HUB_UNLOCK_COOKIE,
  HUB_UNLOCK_TTL_SECONDS,
  createHubUnlockToken,
  getHubSettings,
  isHubUnlocked,
} from "@/lib/hub/access";

// Verrou renforcé du Hub Perso (PIN 6 chiffres, step-up auth).
// GET  : statut { pinEnabled, unlocked, lockedUntil }
// POST : { action: "setup" | "verify" | "disable" | "lock", pin? }
// Rate limiting persistant en DB : 5 échecs → blocage 15 min.

const MAX_ATTEMPTS = 5;
const BLOCK_MINUTES = 15;

function setUnlockCookie(response: NextResponse, token: string) {
  response.cookies.set(HUB_UNLOCK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: HUB_UNLOCK_TTL_SECONDS,
    path: "/",
  });
}

function clearUnlockCookie(response: NextResponse) {
  response.cookies.set(HUB_UNLOCK_COOKIE, "", { maxAge: 0, path: "/" });
}

export async function GET() {
  try {
    const check = await requireSuperadmin();
    if (!check.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!check.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const settings = await getHubSettings(admin as any, check.userId);
    const unlocked = await isHubUnlocked(settings, check.userId);
    const lockedUntil =
      settings?.locked_until && new Date(settings.locked_until) > new Date()
        ? settings.locked_until
        : null;

    return NextResponse.json({
      success: true,
      pinEnabled: !!settings?.pin_enabled,
      unlocked,
      lockedUntil,
      autoArchiveEnabled: settings ? settings.auto_archive_enabled : true,
      lastAutoArchiveScan: settings?.last_auto_archive_scan || null,
    });
  } catch (error) {
    console.error("[Hub Lock] Status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!check.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const action = body.action as string;
    const pin = typeof body.pin === "string" ? body.pin : "";

    const admin = createAdminClient();
    const settings = await getHubSettings(admin as any, check.userId);

    // ── Verrouiller immédiatement (efface le cookie) ──
    if (action === "lock") {
      const response = NextResponse.json({ success: true, locked: true });
      clearUnlockCookie(response);
      return response;
    }

    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json(
        { error: "Le PIN doit contenir exactement 6 chiffres" },
        { status: 400 }
      );
    }

    // ── Configurer / changer le PIN ──
    if (action === "setup") {
      // Si un PIN existe déjà, exiger l'ancien PIN via current_pin
      if (settings?.pin_enabled && settings.pin_hash && settings.pin_salt) {
        const currentPin = typeof body.current_pin === "string" ? body.current_pin : "";
        if (!verifyPin(currentPin, settings.pin_salt, settings.pin_hash)) {
          return NextResponse.json({ error: "PIN actuel incorrect" }, { status: 401 });
        }
      }

      const salt = generateSalt();
      const hash = hashPin(pin, salt);
      const { error } = await (admin as any).from("personal_hub_settings").upsert(
        {
          user_id: check.userId,
          pin_enabled: true,
          pin_hash: hash,
          pin_salt: salt,
          failed_attempts: 0,
          locked_until: null,
        },
        { onConflict: "user_id" }
      );
      if (error) {
        console.error("[Hub Lock] Setup error:", error);
        return NextResponse.json(
          { error: "Échec de la configuration (migration 078 appliquée ?)" },
          { status: 500 }
        );
      }

      // Déverrouille immédiatement la session courante
      const token = await createHubUnlockToken(check.userId, salt);
      const response = NextResponse.json({ success: true, pinEnabled: true });
      setUnlockCookie(response, token);
      return response;
    }

    if (!settings?.pin_enabled || !settings.pin_hash || !settings.pin_salt) {
      return NextResponse.json({ error: "Aucun PIN configuré" }, { status: 400 });
    }

    // Blocage temporaire après échecs répétés
    if (settings.locked_until && new Date(settings.locked_until) > new Date()) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez plus tard.", code: "RATE_LIMITED", lockedUntil: settings.locked_until },
        { status: 429 }
      );
    }

    const valid = verifyPin(pin, settings.pin_salt, settings.pin_hash);
    if (!valid) {
      const attempts = (settings.failed_attempts || 0) + 1;
      const updates: Record<string, unknown> = { failed_attempts: attempts };
      if (attempts >= MAX_ATTEMPTS) {
        updates.failed_attempts = 0;
        updates.locked_until = new Date(Date.now() + BLOCK_MINUTES * 60 * 1000).toISOString();
      }
      await (admin as any)
        .from("personal_hub_settings")
        .update(updates)
        .eq("user_id", check.userId);
      return NextResponse.json(
        { error: "PIN incorrect", code: "INVALID_PIN", attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts) },
        { status: 401 }
      );
    }

    // PIN valide — reset des compteurs
    await (admin as any)
      .from("personal_hub_settings")
      .update({ failed_attempts: 0, locked_until: null })
      .eq("user_id", check.userId);

    // ── Déverrouiller ──
    if (action === "verify") {
      const token = await createHubUnlockToken(check.userId, settings.pin_salt);
      const response = NextResponse.json({ success: true, unlocked: true });
      setUnlockCookie(response, token);
      return response;
    }

    // ── Désactiver le verrou ──
    if (action === "disable") {
      await (admin as any)
        .from("personal_hub_settings")
        .update({ pin_enabled: false, pin_hash: null, pin_salt: null })
        .eq("user_id", check.userId);
      const response = NextResponse.json({ success: true, pinEnabled: false });
      clearUnlockCookie(response);
      return response;
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (error) {
    console.error("[Hub Lock] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
