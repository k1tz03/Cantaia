import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: userRow } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!userRow?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const visitId = request.nextUrl.searchParams.get("visit_id");
    if (!visitId) {
      return NextResponse.json({ error: "visit_id required" }, { status: 400 });
    }

    // Verify visit belongs to user's org
    const { data: visit } = await ((admin as any).from("client_visits"))
      .select("id")
      .eq("id", visitId)
      .eq("organization_id", userRow.organization_id)
      .maybeSingle();

    if (!visit) {
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }

    const { data: photos, error } = await ((admin as any).from("visit_photos"))
      .select("*")
      .eq("visit_id", visitId)
      .eq("organization_id", userRow.organization_id)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("[PhotoList] Error:", error);
      return NextResponse.json({ error: "Failed to load photos" }, { status: 500 });
    }

    return NextResponse.json({ photos: photos || [] });
  } catch (error) {
    console.error("[PhotoList] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
