export const APP_NAME = "Cantaia";
export const APP_DESCRIPTION =
  "AI assistant for construction project managers in Switzerland";

export const SUPPORTED_LOCALES = ["fr", "en", "de"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "fr";

export const CURRENCIES = ["CHF", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = "CHF";

export const PROJECT_COLORS = [
  "#6366F1", // Indigo
  "#8B5CF6", // Violet
  "#EC4899", // Pink
  "#EF4444", // Red
  "#F97316", // Orange
  "#F59E0B", // Amber
  "#10B981", // Emerald
  "#06B6D4", // Cyan
] as const;

export const SUBSCRIPTION_PLANS = {
  trial:      { name: "Trial",      maxUsers: 1,   maxProjects: 2,    price: 0 },
  starter:    { name: "Starter",    maxUsers: 1,   maxProjects: 5,    price: 149 },
  pro:        { name: "Pro",        maxUsers: 3,   maxProjects: -1,   price: 349 },
  enterprise: { name: "Enterprise", maxUsers: -1,  maxProjects: -1,   price: 790 },
} as const;

export const TRIAL_DURATION_DAYS = 14;

export const MICROSOFT_GRAPH_SCOPES = [
  "Mail.Read",
  "Mail.ReadBasic",
  "Calendars.Read",
  "User.Read",
] as const;

export const EMAIL_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export const AI_MODELS = {
  classifier: "claude-sonnet-4-5-20250929",
  pvGenerator: "claude-sonnet-4-5-20250929",
  briefing: "claude-sonnet-4-5-20250929",
  transcription: "whisper-1",
} as const;
