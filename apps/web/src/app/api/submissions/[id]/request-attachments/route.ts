import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/submissions/[id]/request-attachments?request_id=<uuid>
 *   → { attachments: [{ name, url, source, uploaded_at }] }
 *
 * Signed URLs (1 h) for the files attached to one price request — both the
 * documents sent WITH the request and the offer files a supplier uploaded
 * through the portal. The `submissions` bucket is private (migration 068/081),
 * so raw storage paths are useless to the client without this endpoint.
 *
 * `attachments` entries come in two historical shapes:
 *   - plain string (legacy attachment_urls from send-price-requests);
 *   - { file_url, file_name, source, uploaded_at } (portal uploads).
 */

const BUCKET = "submissions";
const SIGNED_URL_TTL_SEC = 3600;

interface AttachmentOut {
  name: string;
  url: string;
  source: string;
  uploaded_at: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: submissionId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const requestId = request.nextUrl.searchParams.get("request_id");
    if (!requestId) {
      return NextResponse.json({ error: "request_id required" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: profile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Anti-IDOR: UNCONDITIONAL — submission → project → org, refused whenever
    // any link of the chain is missing.
    const { data: submission } = await (admin as any)
      .from("submissions")
      .select("id, project_id, projects!submissions_project_id_fkey(organization_id)")
      .eq("id", submissionId)
      .maybeSingle();

    const projOrg = (submission as any)?.projects?.organization_id;
    if (!submission || !projOrg || projOrg !== profile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: priceRequest, error: prError } = await (admin as any)
      .from("submission_price_requests")
      .select("id, attachments")
      .eq("id", requestId)
      .eq("submission_id", submissionId)
      .maybeSingle();

    if (prError) {
      console.error("[request-attachments] lookup failed:", prError.message);
      return NextResponse.json({ error: prError.message }, { status: 500 });
    }
    if (!priceRequest) {
      return NextResponse.json({ error: "Price request not found" }, { status: 404 });
    }

    const raw: unknown[] = Array.isArray(priceRequest.attachments)
      ? priceRequest.attachments
      : [];

    const attachments: AttachmentOut[] = [];

    for (const entry of raw) {
      let filePath: string | null = null;
      let name = "document";
      let source = "request";
      let uploadedAt: string | null = null;

      if (typeof entry === "string" && entry) {
        filePath = entry;
        name = entry.split("/").pop() || "document";
      } else if (entry && typeof entry === "object") {
        const obj = entry as Record<string, unknown>;
        if (typeof obj.file_url === "string" && obj.file_url) {
          filePath = obj.file_url;
          name =
            (typeof obj.file_name === "string" && obj.file_name) ||
            obj.file_url.split("/").pop() ||
            "document";
          if (typeof obj.source === "string" && obj.source) source = obj.source;
          if (typeof obj.uploaded_at === "string") uploadedAt = obj.uploaded_at;
        }
      }

      if (!filePath) continue;

      // Legacy entries may hold a full (public) URL — pass those through.
      if (/^https?:\/\//i.test(filePath)) {
        attachments.push({ name, url: filePath, source, uploaded_at: uploadedAt });
        continue;
      }

      const { data: signed, error: signError } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(filePath, SIGNED_URL_TTL_SEC);

      if (signError || !signed?.signedUrl) {
        console.warn(
          "[request-attachments] signed URL failed for",
          filePath,
          signError?.message
        );
        continue;
      }

      attachments.push({ name, url: signed.signedUrl, source, uploaded_at: uploadedAt });
    }

    return NextResponse.json({ success: true, attachments });
  } catch (err: any) {
    console.error("[request-attachments] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
