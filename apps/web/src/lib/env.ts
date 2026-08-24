import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";

const serverSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(30),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(30),
    ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),
    OPENAI_API_KEY: z.string().startsWith("sk-").optional(),
    GEMINI_API_KEY: z.string().min(10).optional(),
    STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
    STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
    // Stripe Price IDs — required for checkout/plan changes to work in production.
    // Kept optional in the schema so local dev without billing still boots; a
    // warning is logged at boot when they are missing in production (see below).
    STRIPE_PRICE_STARTER: z.string().startsWith("price_").optional(),
    STRIPE_PRICE_PRO: z.string().startsWith("price_").optional(),
    STRIPE_PRICE_ENTERPRISE: z.string().startsWith("price_").optional(),
    CRON_SECRET: z.string().min(16).optional(),
    MICROSOFT_CLIENT_ID: z.string().uuid().optional(),
    MICROSOFT_CLIENT_SECRET: z.string().min(10).optional(),
    // 64 hex chars = 32 bytes (AES-256-GCM). MANDATORY in production: without it
    // safeEncrypt() silently falls back to plaintext and OAuth tokens are stored
    // in clear in the DB (SEC2.NC4).
    MICROSOFT_TOKEN_ENCRYPTION_KEY: z.string().length(64).optional(),
    OUTLOOK_WEBHOOK_SECRET: z.string().min(16).optional(),
    BASE_DOMAIN: z.string().default("cantaia.io"),
  })
  .superRefine((val, ctx) => {
    if (isProduction && !val.MICROSOFT_TOKEN_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MICROSOFT_TOKEN_ENCRYPTION_KEY"],
        message:
          "MICROSOFT_TOKEN_ENCRYPTION_KEY is required in production (64 hex chars) — without it OAuth tokens are stored in plaintext.",
      });
    }
  });

/** Env vars that must be present in production but are only warned about (not fatal). */
const PRODUCTION_RECOMMENDED = [
  "STRIPE_PRICE_STARTER",
  "STRIPE_PRICE_PRO",
  "STRIPE_PRICE_ENTERPRISE",
] as const;

/**
 * Boot-time check (server only). Logs a single warning listing the production
 * env vars that are missing, without crashing the deployment.
 */
function warnMissingProductionEnv() {
  if (!isProduction) return;
  const missing = PRODUCTION_RECOMMENDED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.warn(
      `[env] Missing production environment variables: ${missing.join(", ")}. ` +
        "Stripe checkout / plan changes will fail until they are set on Vercel."
    );
  }
  if (!process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY) {
    console.warn(
      "[env] MICROSOFT_TOKEN_ENCRYPTION_KEY is not set — Microsoft OAuth tokens are being stored in PLAINTEXT."
    );
  }
}

if (typeof window === "undefined") {
  warnMissingProductionEnv();
}

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(30),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

let _env: ServerEnv | ClientEnv | null = null;

function validateEnv() {
  if (typeof window !== "undefined") {
    return clientSchema.parse({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    });
  }
  return serverSchema.parse(process.env);
}

/** Validated environment variables. Lazy — only validates on first access. */
export const env = new Proxy({} as ServerEnv & ClientEnv, {
  get(_target, prop) {
    if (!_env) _env = validateEnv();
    return (_env as Record<string, unknown>)[prop as string];
  },
});

/**
 * Returns the canonical app URL (https://cantaia.io), stripped of trailing slashes.
 * Use this everywhere instead of reading NEXT_PUBLIC_APP_URL directly.
 * Prefers BASE_DOMAIN if set, rejects .vercel.app for user-facing URLs.
 */
export function getAppUrl(): string {
  const baseDomain = process.env.BASE_DOMAIN;
  if (baseDomain) return `https://${baseDomain}`.replace(/\/+$/, "");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cantaia.io";
  // Never expose .vercel.app in user-facing links (share links, portals, emails)
  if (appUrl.includes(".vercel.app")) return "https://cantaia.io";
  return appUrl.replace(/\/+$/, "");
}
