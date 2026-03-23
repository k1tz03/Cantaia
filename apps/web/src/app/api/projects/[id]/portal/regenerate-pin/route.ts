import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePin, generateSalt, hashPin } from "@/lib/portal/auth";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("organization_id").eq("id", user.id).single();

    const { data: project } = await admin
      .from("projects")
      .select("id, organization_id")
      .eq("id", id)
      .single();

    if (!project || project.organization_id !== profile?.organization_id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const pin = generatePin();
    const salt = generateSalt();

    const { error } = await admin
      .from("projects")
      .update({
        portal_pin_hash: hashPin(pin, salt),
        portal_pin_salt: salt,
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Failed to regenerate" }, { status: 500 });
    }

    return NextResponse.json({ success: true, pin });
  } catch (error) {
    console.error("[Portal] Regenerate PIN error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
