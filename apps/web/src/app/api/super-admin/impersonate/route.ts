import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await (admin as any)
      .from("users")
      .select("is_superadmin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_superadmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { targetUserId } = body;

    if (!targetUserId) {
      return NextResponse.json(
        { error: "Missing targetUserId" },
        { status: 400 }
      );
    }

    const { data: targetUser } = await (admin as any)
      .from("users")
      .select("email")
      .eq("id", targetUserId)
      .single();

    if (!targetUser?.email) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data: linkData, error: linkError } =
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email: targetUser.email,
      });

    if (linkError || !linkData) {
      return NextResponse.json(
        { error: "Failed to generate link" },
        { status: 500 }
      );
    }

    const { error: logError } = await (admin as any)
      .from("admin_activity_logs")
      .insert({
        user_id: user.id,
        action: "impersonate",
        metadata: {
          target_user_id: targetUserId,
          target_email: targetUser.email,
        },
      });
    if (logError) {
      console.error("[super-admin/impersonate] Audit log error:", logError);
    }

    return NextResponse.json({
      url: linkData.properties?.action_link,
    });
  } catch (error) {
    console.error("[super-admin/impersonate]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
