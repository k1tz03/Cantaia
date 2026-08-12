// PIN 6 chiffres — hash SHA-256 salé (verrou renforcé du hub)

import { createHash, randomBytes, randomInt } from "crypto";

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
