import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkUsageLimit } from "@cantaia/config/plan-features";
import { grantCredits } from "@/lib/credits";

export const maxDuration = 120;

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
/** Signed URL lifetime for photo previews. */
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Get user's org
    const { data: userRow } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!userRow?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    const orgId = userRow.organization_id;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const visitId = formData.get("visit_id") as string | null;
    const photoType = (formData.get("photo_type") as string) || "site";
    const caption = formData.get("caption") as string | null;
    const locationDescription = formData.get("location_description") as string | null;

    if (!file || !visitId) {
      return NextResponse.json({ error: "file and visit_id required" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Accepted: JPEG, PNG, WebP" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
    }

    if (!["site", "handwritten_notes"].includes(photoType)) {
      return NextResponse.json({ error: "Invalid photo_type" }, { status: 400 });
    }

    // Verify visit belongs to user's org
    const { data: visit } = await ((admin as any).from("client_visits"))
      .select("id, organization_id")
      .eq("id", visitId)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!visit) {
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }

    // Sanitize filename
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = safeName.split(".").pop() || "jpg";
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `photos/${orgId}/${visitId}/${uniqueName}`;

    // Upload to storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await admin.storage
      .from("audio")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) {
      console.error("[PhotoUpload] Storage error:", uploadErr);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    // Next sort_order = max + 1, not count: a deleted photo would make count
    // reuse an order already in use. (Still best-effort under concurrency, but
    // no longer wrong after a deletion.)
    const { data: lastPhoto } = await ((admin as any).from("visit_photos"))
      .select("sort_order")
      .eq("visit_id", visitId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSortOrder = ((lastPhoto as any)?.sort_order ?? -1) + 1;

    // Insert DB record
    const { data: photo, error: insertErr } = await ((admin as any).from("visit_photos"))
      .insert({
        visit_id: visitId,
        organization_id: orgId,
        photo_type: photoType,
        file_url: storagePath,
        file_name: safeName,
        file_size: file.size,
        mime_type: file.type,
        sort_order: nextSortOrder,
        caption: caption || null,
        location_description: locationDescription || null,
        ai_analysis_status: "pending",
        created_by: user.id,
      })
      .select("id, file_url, photo_type, sort_order, ai_analysis_status")
      .single();

    if (insertErr) {
      console.error("[PhotoUpload] DB error:", insertErr);
      return NextResponse.json({ error: "Failed to save photo record" }, { status: 500 });
    }

    // Handwritten notes are analysed automatically in the background so the
    // report generation never runs on un-transcribed notes. Direct function
    // call (no internal HTTP fetch) — the request cookies would not survive.
    //
    // Billing policy: the automatic path is charged the SAME `handwritten_notes`
    // credit as the manual "Analyser" button — otherwise the nominal path was
    // free while the manual re-run cost 5, an inconsistency. The debit is taken
    // synchronously here (atomic) and refunded if the background job fails; if
    // the org cannot pay, auto-analysis is skipped and the manual button remains.
    if (photoType === "handwritten_notes" && photo?.id) {
      const { data: orgRow } = await admin
        .from("organizations")
        .select("subscription_plan")
        .eq("id", orgId)
        .maybeSingle();

      const usageCheck = await checkUsageLimit(
        admin,
        orgId,
        (orgRow as any)?.subscription_plan || "trial",
        "handwritten_notes"
      );

      if (usageCheck.allowed) {
        const refundCredits =
          usageCheck.remaining_credits !== null ? usageCheck.required_credits ?? 0 : 0;
        after(async () => {
          try {
            const { runHandwrittenNotesAnalysis } = await import("@cantaia/core/visits");
            const result = await runHandwrittenNotesAnalysis({
              admin: admin as any,
              photoId: photo.id,
              userId: user.id,
            });
            if (!result.ok) {
              console.warn("[PhotoUpload] Background notes analysis failed:", result.error);
              if (refundCredits > 0) {
                await grantCredits(orgId, refundCredits, "refund", `handwritten_notes:${photo.id}`, user.id);
              }
            }
          } catch (err) {
            console.error("[PhotoUpload] Background notes analysis threw:", err);
            if (refundCredits > 0) {
              await grantCredits(orgId, refundCredits, "refund", `handwritten_notes:${photo.id}`, user.id);
            }
          }
        });
      } else {
        // Not enough credits / over quota → leave the note un-analysed; the
        // manual "Analyser" action can run it once the org tops up.
        console.log("[PhotoUpload] Auto notes analysis skipped (usage limit):", usageCheck);
      }
    }

    // Private bucket → return a signed URL the client can render directly
    let signedUrl: string | null = null;
    const { data: signed, error: signedErr } = await admin.storage
      .from("audio")
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (signedErr) {
      console.error("[PhotoUpload] Signed URL error:", signedErr);
    } else {
      signedUrl = signed?.signedUrl ?? null;
    }

    return NextResponse.json({
      success: true,
      photo: { ...photo, signed_url: signedUrl },
    });
  } catch (error) {
    console.error("[PhotoUpload] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
