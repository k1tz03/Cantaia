import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// POST /api/debug/reset-onboarding
// Resets onboarding_completed to false for the current user
// so they get redirected to the onboarding wizard on next page load.
// Only works for superadmins.

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check superadmin
    const admin = createAdminClient();
    const { data: profile } = await (admin as any)
      .from("users")
      .select("is_superadmin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_superadmin) {
      return NextResponse.json({ error: "Superadmin only" }, { status: 403 });
    }

    // Reset onboarding
    await (admin as any)
      .from("users")
      .update({
        onboarding_completed: false,
        onboarding_current_step: 1,
        onboarding_data: {},
      })
      .eq("id", user.id);

    return NextResponse.json({
      success: true,
      message: "Onboarding reset. Refresh the page — you will be redirected to /onboarding.",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
