// ============================================================
// Activity Logger — Logs user actions for the superadmin dashboard
// ============================================================
// IMPORTANT: Logging must NEVER block or fail the main operation.
// All errors are caught silently and logged to console.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, AdminActionType } from "@cantaia/database";

export interface LogActivityParams {
  supabase: SupabaseClient<Database>;
  userId: string;
  organizationId: string;
  action: AdminActionType;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log a user activity. Fire-and-forget — never throws.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const { error } = await params.supabase
      .from("admin_activity_logs")
      .insert({
        user_id: params.userId,
        organization_id: params.organizationId,
        action: params.action,
        metadata: params.metadata ?? {},
        ip_address: params.ipAddress ?? null,
        user_agent: params.userAgent ?? null,
      } as any);

    if (error) {
      console.error("[logActivity] Insert error (non-blocking):", error.message);
    }
  } catch (err) {
    console.error("[logActivity] Error (non-blocking):", err instanceof Error ? err.message : err);
  }
}

/**
 * Fire-and-forget version that doesn't await.
 * Use this in hot paths where you don't want to add latency.
 */
export function logActivityAsync(params: LogActivityParams): void {
  logActivity(params).catch(() => {});
}
