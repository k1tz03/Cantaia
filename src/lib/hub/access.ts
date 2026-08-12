// ============================================================
// Hub Perso — Guard d'accès partagé
// Combine le guard superadmin (seul le propriétaire accède au hub)
// et le verrou renforcé PIN (step-up auth, cookie JWT 30 min).
// ============================================================

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/admin/require-superadmin";

export const HUB_UNLOCK_COOKIE = "cantaia_hub_unlock";
export const HUB_UNLOCK_TTL_SECONDS = 30 * 60; // 30 minutes

export interface HubSettings {
  user_id: string;
  pin_enabled: boolean;
  pin_hash: string | null;
  pin_salt: string | null;
  failed_attempts: number;
  locked_until: string | null;
  auto_archive_enabled: boolean;
  last_auto_archive_scan: string | null;
}

export function hubUnlockSecret(salt: string): Uint8Array {
  return new TextEncoder().encode(
    "hub:" + salt + (process.env.SUPABASE_SERVICE_ROLE_KEY || "").slice(0, 16)
  );
}

export async function getHubSettings(
  admin: any,
  userId: string
): Promise<HubSettings | null> {
  try {
    const { data } = await admin
      .from("personal_hub_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    return (data as HubSettings) || null;
  } catch {
    // Table absente (migration 078 pas appliquée) — pas de verrou
    return null;
  }
}

export async function createHubUnlockToken(
  userId: string,
  salt: string
): Promise<string> {
  return new SignJWT({ userId, scope: "hub-unlock" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${HUB_UNLOCK_TTL_SECONDS}s`)
    .sign(hubUnlockSecret(salt));
}

export async function isHubUnlocked(
  settings: HubSettings | null,
  userId: string
): Promise<boolean> {
  if (!settings?.pin_enabled || !settings.pin_salt) return true;
  try {
    const store = await cookies();
    const token = store.get(HUB_UNLOCK_COOKIE)?.value;
    if (!token) return false;
    const { payload } = await jwtVerify(token, hubUnlockSecret(settings.pin_salt));
    return payload.userId === userId && payload.scope === "hub-unlock";
  } catch {
    return false;
  }
}

export type HubAccess =
  | { ok: true; userId: string; admin: ReturnType<typeof createAdminClient> }
  | { ok: false; response: NextResponse };

// Guard complet : 401 non authentifié, 403 pas superadmin, 423 hub verrouillé.
export async function requireHubAccess(): Promise<HubAccess> {
  const check = await requireSuperadmin();
  if (!check.userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!check.authorized) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const admin = createAdminClient();
  const settings = await getHubSettings(admin as any, check.userId);
  if (settings?.pin_enabled) {
    const unlocked = await isHubUnlocked(settings, check.userId);
    if (!unlocked) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Hub verrouillé — PIN requis", code: "HUB_LOCKED" },
          { status: 423 }
        ),
      };
    }
  }

  return { ok: true, userId: check.userId, admin };
}
