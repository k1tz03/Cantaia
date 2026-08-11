import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/admin/require-superadmin";

// GET /api/hub/emails — derniers emails synchronisés du propriétaire
// Accès : superadmin uniquement (page Hub Perso), données scopées user_id.
export async function GET(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!check.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { searchParams } = request.nextUrl;
    const limit = Math.min(parseInt(searchParams.get("limit") || "25"), 100);
    const q = (searchParams.get("q") || "").trim();

    let query = (admin as any)
      .from("email_records")
      .select(
        "id, subject, sender_name, sender_email, received_at, body_preview, classification, ai_summary, has_attachments, is_processed"
      )
      .eq("user_id", check.userId)
      .order("received_at", { ascending: false })
      .limit(limit);

    if (q.length >= 2) {
      const safe = q.replace(/[%_,().]/g, "");
      query = query.or(
        `subject.ilike.%${safe}%,sender_name.ilike.%${safe}%,sender_email.ilike.%${safe}%`
      );
    }

    const { data: emails, error } = await query;
    if (error) {
      console.error("[Hub] Emails list error:", error);
      return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 });
    }

    // Flag des emails déjà conservés dans le hub
    let savedIds: string[] = [];
    try {
      const { data: saved } = await (admin as any)
        .from("personal_saved_emails")
        .select("email_record_id")
        .eq("user_id", check.userId);
      savedIds = (saved || []).map((s: any) => s.email_record_id);
    } catch {
      // Table absente (migration 077 pas appliquée) — dégradation gracieuse
    }

    const savedSet = new Set(savedIds);
    const enriched = (emails || []).map((e: any) => ({
      ...e,
      is_saved: savedSet.has(e.id),
    }));

    return NextResponse.json({ success: true, emails: enriched, savedCount: savedIds.length });
  } catch (error) {
    console.error("[Hub] Emails error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
