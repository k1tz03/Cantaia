/**
 * AES-256-GCM encryption/decryption for Microsoft OAuth tokens.
 * Uses Node.js built-in crypto module.
 * Requires MICROSOFT_TOKEN_ENCRYPTION_KEY env var (32-byte hex string).
 */

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const key = process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("MICROSOFT_TOKEN_ENCRYPTION_KEY not configured");
  }
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) {
    throw new Error("MICROSOFT_TOKEN_ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  }
  return buf;
}

/**
 * Encrypt a plaintext token string.
 * Returns a base64-encoded string: iv:authTag:ciphertext
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  // Format: base64(iv):base64(authTag):base64(ciphertext)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypt an encrypted token string.
 * Expects format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }

  const iv = Buffer.from(parts[0], "base64");
  const authTag = Buffer.from(parts[1], "base64");
  const ciphertext = parts[2];

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Check if a token string looks encrypted (has the iv:tag:data format).
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 3 && parts[0].length > 10;
}
