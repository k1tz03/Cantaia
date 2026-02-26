// ============================================================
// Cantaia — Superadmin Auth Guard
// ============================================================
// Used by admin API routes and pages to verify superadmin access.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface SuperadminCheck {
  authorized: boolean;
  userId: string | null;
  error?: string;
}

/**
 * Verify the current user is a superadmin.
 * Used in API routes: if (!check.authorized) return 403.
 */
export async function requireSuperadmin(): Promise<SuperadminCheck> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { authorized: false, userId: null, error: "Not authenticated" };
    }

    const admin = createAdminClient();
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("is_superadmin")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.is_superadmin) {
      return { authorized: false, userId: user.id, error: "Not a superadmin" };
    }

    return { authorized: true, userId: user.id };
  } catch {
    return { authorized: false, userId: null, error: "Auth check failed" };
  }
}
