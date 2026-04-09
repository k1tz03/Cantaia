import { z } from "zod";

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(30),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(30),
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),
  OPENAI_API_KEY: z.string().startsWith("sk-").optional(),
  GEMINI_API_KEY: z.string().min(10).optional(),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  CRON_SECRET: z.string().min(16).optional(),
  MICROSOFT_CLIENT_ID: z.string().uuid().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().min(10).optional(),
  MICROSOFT_TOKEN_ENCRYPTION_KEY: z.string().length(64).optional(),
  OUTLOOK_WEBHOOK_SECRET: z.string().min(16).optional(),
  // Pre-launch teaser bypass. Visiting cantaia.io/?preview=<secret> sets a
  // 30-day httpOnly cookie so Julien (and anyone with the secret) can reach
  // the real site while the /soon countdown is gating public traffic.
  CANTAIA_PREVIEW_SECRET: z.string().min(16).optional(),
  BASE_DOMAIN: z.string().default("cantaia.io"),
});

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
