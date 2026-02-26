import { createAdminClient } from "@/lib/supabase/admin";
import type { LogLevel } from "@cantaia/database";

/**
 * Log an event to the app_logs table.
 * Fails silently — never throws.
 */
export async function logToDb(params: {
  userId?: string;
  organizationId?: string;
  level: LogLevel;
  source: string;
  message: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    const adminClient = createAdminClient();
    await adminClient.from("app_logs").insert({
      user_id: params.userId || null,
      organization_id: params.organizationId || null,
      level: params.level,
      source: params.source,
      message: params.message,
      details: params.details || {},
    });
  } catch {
    // Logging should never break the app
    console.error(`[logToDb] Failed to log: ${params.source} — ${params.message}`);
  }
}
