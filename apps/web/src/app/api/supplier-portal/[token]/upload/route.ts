import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  PORTAL_IP_LIMIT,
  portalClientIp,
  supplierPortalClosedReason,
} from "@/lib/submissions/supplier-portal";
import { isValidPortalTokenFormat } from "@cantaia/core/submissions";

/**
 * PUBLIC — supplier portal attachment upload.
 *
 *   POST /api/supplier-portal/[token]/upload   { filename, size, content_type? }
 *     → { signed_url, storage_path, token, file_name }
 *
 * The binary never transits through this route: the browser PUTs it straight to
 * the Supabase signed URL. That sidesteps the 4.5 MB serverless body cap and
 * matches /api/submissions/upload-url, which does the same for internal users.
 *
 * The returned `storage_path` is what the supplier posts back as
 * `attachment.file_url` when submitting the offer — a path, not a public URL,
 * because the `submissions` bucket is private (migration 068) and the file must
 * only ever be reachable through a signed URL issued to the owning org.
 *
 * Guards:
 *   - the opaque price-request token is the only credential;
 *   - a request already answered through the portal cannot receive new files;
 *   - PDF / image / spreadsheet only, 10 MB, 5 uploads per hour per token.
 */

const UPLOAD_LIMIT = { limit: 5, windowSec: 3600 };
const BUCKET = "submissions";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Extensions a supplier may legitimately attach to an offer. Never SVG (stored XSS). */
const ALLOWED_EXTENSIONS = new Set(["pdf", "xlsx", "xls", "csv", "png", "jpg", "jpeg", "webp"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!isValidPortalTokenFormat(token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const ipLimit = await rateLimit(`portal:ip:${portalClientIp(request)}`, PORTAL_IP_LIMIT);
  if (!ipLimit.allowed) return rateLimitResponse(ipLimit);

  const limit = await rateLimit(`supplier-portal-upload:${token}`, UPLOAD_LIMIT);
  if (!limit.allowed) return rateLimitResponse(limit);

  let body: { filename?: string; size?: number; content_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const filename = typeof body.filename === "string" ? body.filename.trim() : "";
  if (!filename) {
    return NextResponse.json({ error: "filename_required" }, { status: 400 });
  }

  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  }

  if (typeof body.size === "number" && body.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "file_too_large", max_bytes: MAX_UPLOAD_BYTES }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolve the token — a flat 404 for unknown and foreign tokens alike.
  // (`award_outcome` / `material_group` / `deadline` are safe to name here:
  // a row can only be found by portal_token, which migration 099 introduced
  // together with award_outcome.)
  const { data: priceRequest, error: lookupError } = await (admin as any)
    .from("submission_price_requests")
    .select("id, submission_id, status, portal_submitted_at, award_outcome, material_group, deadline")
    .eq("portal_token", token)
    .maybeSingle();

  if (lookupError) {
    console.error("[supplier-portal/upload] lookup failed:", lookupError.message);
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!priceRequest) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Guard promised by this route's contract: a request whose answer is already
  // decided (responded + award posted) — or whose deadline is > 7 days past —
  // cannot receive new files. Same 410 contract as the offer POST.
  const { data: parentSubmission } = await (admin as any)
    .from("submissions")
    .select("deadline")
    .eq("id", priceRequest.submission_id)
    .maybeSingle();

  const closedReason = await supplierPortalClosedReason(
    admin,
    priceRequest,
    parentSubmission?.deadline ?? null
  );
  if (closedReason) {
    return NextResponse.json({ error: "closed", reason: closedReason }, { status: 410 });
  }

  // Path traversal guard — the supplier controls this string.
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const storagePath = `supplier-portal/${priceRequest.submission_id}/${priceRequest.id}/${Date.now()}_${safeName}`;

  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(storagePath);

  if (error) {
    const missingBucket = /not found/i.test(error.message || "");
    console.error("[supplier-portal/upload] createSignedUploadUrl failed:", error.message);
    return NextResponse.json(
      {
        error: missingBucket ? "storage_unavailable" : "upload_url_failed",
        // Surfaced to the operator through the logs, not to the supplier UI.
        detail: missingBucket
          ? `Bucket "${BUCKET}" missing — apply migration 068.`
          : error.message,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    signed_url: data.signedUrl,
    token: data.token,
    storage_path: storagePath,
    file_name: safeName,
  });
}
