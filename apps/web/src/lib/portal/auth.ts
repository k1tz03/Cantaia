import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
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

/** Constant-time comparison of the stored hash with the candidate PIN hash. */
export function verifyPin(pin: string, salt: string, hash: string): boolean {
  const expected = Buffer.from(hash, "hex");
  const actual = Buffer.from(hashPin(pin, salt), "hex");
  // Different lengths (corrupted / non-hex stored hash) can never match, and
  // timingSafeEqual would throw on mismatched buffer sizes.
  if (expected.length === 0 || expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * JWT signing secret for portal sessions.
 * Throws when the service role key is missing: without it the secret would
 * degrade to the (DB-readable) salt alone, making session tokens forgeable.
 */
function getPortalSecret(salt: string): Uint8Array {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required to sign portal session tokens",
    );
  }
  // NOTE: the 16-char slice is kept as-is on purpose — widening it would
  // invalidate every portal session currently in the field.
  return new TextEncoder().encode(salt + serviceKey.slice(0, 16));
}

export async function createPortalToken(projectId: string, salt: string, userName: string): Promise<string> {
  const secret = getPortalSecret(salt);
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

    const secret = getPortalSecret(salt);
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
