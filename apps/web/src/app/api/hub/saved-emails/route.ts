import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/admin/require-superadmin";

// Emails importants conservés dans le Hub Perso (table personal_saved_emails)
// Accès : superadmin uniquement, données scopées user_id.

export async function GET() {
  try {
    const check = await requireSuperadmin();
    if (!check.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!check.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: saved, error } = await (admin as any)
      .from("personal_saved_emails")
      .select("id, email_record_id, note, created_at")
      .eq("user_id", check.userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Hub] Saved emails list error:", error);
      return NextResponse.json({ success: true, emails: [] });
    }

    const emailIds = (saved || []).map((s: any) => s.email_record_id);
    let recordsMap: Record<string, any> = {};
    if (emailIds.length > 0) {
      const { data: records } = await (admin as any)
        .from("email_records")
        .select(
          "id, subject, sender_name, sender_email, received_at, body_preview, classification, ai_summary, has_attachments"
        )
        .in("id", emailIds);
      for (const r of records || []) recordsMap[r.id] = r;
    }

    const enriched = (saved || [])
      .filter((s: any) => recordsMap[s.email_record_id])
      .map((s: any) => ({
        saved_id: s.id,
        note: s.note,
        saved_at: s.created_at,
        ...recordsMap[s.email_record_id],
        is_saved: true,
      }));

    return NextResponse.json({ success: true, emails: enriched });
  } catch (error) {
    console.error("[Hub] Saved emails error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!check.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const emailRecordId = body.email_record_id;
    if (!emailRecordId) {
      return NextResponse.json({ error: "email_record_id is required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // IDOR : l'email doit appartenir à l'utilisateur
    const { data: record } = await (admin as any)
      .from("email_records")
      .select("id, user_id")
      .eq("id", emailRecordId)
      .single();

    if (!record || record.user_id !== check.userId) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    const { data: saved, error } = await (admin as any)
      .from("personal_saved_emails")
      .upsert(
        {
          user_id: check.userId,
          email_record_id: emailRecordId,
          note: typeof body.note === "string" ? body.note.slice(0, 2000) : null,
        },
        { onConflict: "user_id,email_record_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("[Hub] Save email error:", error);
      return NextResponse.json({ error: "Failed to save email" }, { status: 500 });
    }

    return NextResponse.json({ success: true, saved }, { status: 201 });
  } catch (error) {
    console.error("[Hub] Save email error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!check.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const emailRecordId = request.nextUrl.searchParams.get("email_record_id");
    if (!emailRecordId) {
      return NextResponse.json({ error: "email_record_id is required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await (admin as any)
      .from("personal_saved_emails")
      .delete()
      .eq("user_id", check.userId)
      .eq("email_record_id", emailRecordId);

    if (error) {
      console.error("[Hub] Unsave email error:", error);
      return NextResponse.json({ error: "Failed to remove" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Hub] Unsave email error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
