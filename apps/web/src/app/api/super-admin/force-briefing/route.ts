import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/env";

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

    const briefingResponse = await fetch(`${getAppUrl()}/api/briefing/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: targetUserId }),
    });

    const result = await briefingResponse.json();

    await (admin as any)
      .from("admin_activity_logs")
      .insert({
        user_id: user.id,
        action: "force_briefing",
        metadata: { target_user_id: targetUserId },
      })
      .catch(() => {});

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("[super-admin/force-briefing]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
