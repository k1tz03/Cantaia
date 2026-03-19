import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const CRON_ROUTES: Record<string, string> = {
  briefing: "/api/cron/briefing",
  sync: "/api/email/sync/cron",
  benchmarks: "/api/cron/aggregate-benchmarks",
  patterns: "/api/cron/extract-patterns",
};

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
    const { cronName } = body;

    if (!cronName || !CRON_ROUTES[cronName]) {
      return NextResponse.json(
        {
          error: `Invalid cronName. Valid: ${Object.keys(CRON_ROUTES).join(", ")}`,
        },
        { status: 400 }
      );
    }

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json(
        { error: "CRON_SECRET not configured" },
        { status: 500 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cantaia.ch";
    const cronPath = CRON_ROUTES[cronName];
    const cronResponse = await fetch(`${appUrl}${cronPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
    });

    const result = await cronResponse.json().catch(() => ({
      status: cronResponse.status,
    }));

    await (admin as any)
      .from("admin_activity_logs")
      .insert({
        user_id: user.id,
        action: "run_cron",
        metadata: { cron_name: cronName, status: cronResponse.status },
      })
      .catch(() => {});

    return NextResponse.json({
      success: cronResponse.ok,
      status: cronResponse.status,
      result,
    });
  } catch (error) {
    console.error("[super-admin/run-cron]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
