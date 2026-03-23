import { createHash, randomBytes, randomInt } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const PORTAL_COOKIE_PREFIX = "portal_session_";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export function generatePin(): string {
  return String(randomInt(100000, 999999));
}

export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

export function hashPin(pin: string, salt: string): string {
  return createHash("sha256").update(pin + salt).digest("hex");
}

export function verifyPin(pin: string, salt: string, hash: string): boolean {
  return hashPin(pin, salt) === hash;
}

export async function createPortalToken(projectId: string, salt: string, userName: string): Promise<string> {
  const secret = new TextEncoder().encode(salt + (process.env.SUPABASE_SERVICE_ROLE_KEY || "").slice(0, 16));
  return new SignJWT({ projectId, userName })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifyPortalToken(projectId: string, salt: string): Promise<{ valid: boolean; userName?: string }> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(PORTAL_COOKIE_PREFIX + projectId)?.value;
    if (!token) return { valid: false };

    const secret = new TextEncoder().encode(salt + (process.env.SUPABASE_SERVICE_ROLE_KEY || "").slice(0, 16));
    const { payload } = await jwtVerify(token, secret);
    if (payload.projectId !== projectId) return { valid: false };
    return { valid: true, userName: payload.userName as string };
  } catch {
    return { valid: false };
  }
}

export function getPortalCookieName(projectId: string): string {
  return PORTAL_COOKIE_PREFIX + projectId;
}

export const COOKIE_MAX_AGE_SECONDS = COOKIE_MAX_AGE;
