import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Signed URL lifetime for photo previews. */
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

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

    // The `audio` bucket is private — hand the client signed URLs instead of
    // letting it build public URLs that would 404.
    const rows = (photos || []) as Array<{ file_url: string }>;
    let signedUrls: Record<string, string> = {};

    if (rows.length > 0) {
      const paths = rows.map((p) => p.file_url);
      const { data: signed, error: signErr } = await admin.storage
        .from("audio")
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

      if (signErr) {
        console.error("[PhotoList] Signed URL error:", signErr);
      } else {
        signedUrls = Object.fromEntries(
          (signed || [])
            .filter((s) => s.signedUrl && s.path)
            .map((s) => [s.path as string, s.signedUrl as string])
        );
      }
    }

    return NextResponse.json({
      photos: rows.map((p) => ({ ...p, signed_url: signedUrls[p.file_url] ?? null })),
    });
  } catch (error) {
    console.error("[PhotoList] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
