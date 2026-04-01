import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Check if files exist in Supabase Storage under the closure folder for a project.
 * This serves as a fallback when the project_receptions table doesn't exist (migration 010 not applied).
 *
 * Returns a synthetic reception object based on files found in storage.
 */
async function getReceptionFromStorage(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  projectId: string
): Promise<{
  id: string;
  pv_document_url: string | null;
  pv_signed_url: string | null;
  status: string;
} | null> {
  try {
    // List files in the closure folder for this project
    const { data: files, error } = await admin.storage
      .from("audio")
      .list(`closure/${orgId}/${projectId}`, { limit: 100 });

    if (error || !files || files.length === 0) {
      // Also try without orgId (new path format)
      const { data: files2 } = await admin.storage
        .from("audio")
        .list(`closure/${projectId}`, { limit: 100 });

      if (!files2 || files2.length === 0) return null;

      return buildReceptionFromFiles(admin, files2, `closure/${projectId}`);
    }

    return buildReceptionFromFiles(admin, files, `closure/${orgId}/${projectId}`);
  } catch (err) {
    console.warn("[ClosureData] Storage fallback failed:", err);
    return null;
  }
}

function buildReceptionFromFiles(
  admin: ReturnType<typeof createAdminClient>,
  files: { name: string }[],
  basePath: string
): {
  id: string;
  pv_document_url: string | null;
  pv_signed_url: string | null;
  status: string;
} | null {
  // Look for PV document (PVR-*.docx or similar)
  const pvDoc = files.find(
    (f) =>
      f.name.startsWith("PVR-") ||
      (f.name.includes(".docx") && !f.name.startsWith("signed_"))
  );

  // Look for signed PV (signed_*.pdf/jpg/png)
  const signedPV = files.find(
    (f) => f.name.startsWith("signed_")
  );

  if (!pvDoc && !signedPV) return null;

  const pvUrl = pvDoc
    ? admin.storage.from("audio").getPublicUrl(`${basePath}/${pvDoc.name}`).data
        ?.publicUrl || null
    : null;

  const signedUrl = signedPV
    ? admin.storage
        .from("audio")
        .getPublicUrl(`${basePath}/${signedPV.name}`).data?.publicUrl || null
    : null;

  return {
    id: `storage-fallback-${basePath}`,
    pv_document_url: pvUrl,
    pv_signed_url: signedUrl,
    status: signedUrl ? "signed" : pvUrl ? "completed" : "pending",
  };
}

/**
 * GET /api/projects/[id]/closure/data
 *
 * Server-side route that fetches ALL closure workflow data using the admin client.
 * This bypasses RLS and gracefully handles missing tables (migration 010 not applied).
 * Falls back to Supabase Storage to detect PV files when the table doesn't exist.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Verify user belongs to the same org as the project (anti-IDOR)
    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const orgId = profile.organization_id;

    const { data: project } = await (admin as any)
      .from("projects")
      .select("id, organization_id, name, status")
      .eq("id", projectId)
      .maybeSingle();

    if (!project || project.organization_id !== orgId) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Fetch all closure data in parallel using admin client (bypasses RLS)
    const [tasksRes, meetingsRes, emailsRes] = await Promise.all([
      admin.from("tasks").select("id, status").eq("project_id", projectId),
      admin
        .from("meetings")
        .select("id, meeting_date, meeting_number, status")
        .eq("project_id", projectId),
      admin
        .from("email_records")
        .select("classification")
        .eq("project_id", projectId),
    ]);

    // Fetch project_receptions — table may not exist (migration 010)
    let reception = null;
    let receptionTableExists = true;
    try {
      const { data: receptionData, error: receptionErr } = await (admin as any)
        .from("project_receptions")
        .select(
          "id, pv_document_url, pv_signed_url, status, reception_type, reception_date"
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (receptionErr) {
        console.warn(
          "[ClosureData] project_receptions query failed:",
          receptionErr.message
        );
        receptionTableExists = false;
      } else {
        reception = receptionData;
      }
    } catch (err) {
      console.warn("[ClosureData] project_receptions exception:", err);
      receptionTableExists = false;
    }

    // FALLBACK: If table doesn't exist OR no record found, check Supabase Storage
    let storageBasedFallbackUsed = false;
    if (!reception) {
      console.log(
        "[ClosureData] No reception in DB (tableExists:", receptionTableExists, "), checking Storage fallback for orgId:", orgId, "projectId:", projectId
      );
      reception = await getReceptionFromStorage(admin, orgId, projectId);
      if (reception) {
        console.log(
          "[ClosureData] Found reception files in Storage:",
          reception.status, "pv_document_url:", reception.pv_document_url
        );
        storageBasedFallbackUsed = true;
      } else {
        console.warn("[ClosureData] Storage fallback found NO files either");
      }
    }

    // Fetch closure_documents — table may not exist (migration 010)
    let closureDocs: { id: string }[] = [];
    try {
      const { data: docsData, error: docsErr } = await (admin as any)
        .from("closure_documents")
        .select("id")
        .eq("project_id", projectId);

      if (docsErr) {
        console.warn(
          "[ClosureData] closure_documents query failed:",
          docsErr.message
        );
      } else {
        closureDocs = docsData || [];
      }
    } catch (err) {
      console.warn("[ClosureData] closure_documents exception:", err);
    }

    return NextResponse.json({
      tasks: tasksRes.data || [],
      meetings: meetingsRes.data || [],
      emails: emailsRes.data || [],
      reception,
      closureDocs,
      _meta: {
        receptionTableExists,
        storageBasedFallback: storageBasedFallbackUsed,
        hasReception: !!reception,
        receptionSource: reception
          ? (storageBasedFallbackUsed ? "storage" : "database")
          : "none",
      },
    });
  } catch (error) {
    console.error("[ClosureData] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[id]/closure/data
 *
 * Update reception record (upload signed PV, complete project, etc.)
 * Uses admin client to bypass RLS.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Verify org
    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { data: project } = await (admin as any)
      .from("projects")
      .select("id, organization_id")
      .eq("id", projectId)
      .maybeSingle();

    if (!project || project.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === "get-upload-url") {
      // Generate a signed upload URL so the client can upload directly to Storage
      // This bypasses the Vercel 4.5MB body size limit AND Storage policies
      const { filename } = body as { filename: string };
      const safeName = (filename || "signed.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `closure/${profile.organization_id}/${projectId}/signed_${Date.now()}_${safeName}`;

      const { data, error } = await admin.storage
        .from("audio")
        .createSignedUploadUrl(storagePath);

      if (error || !data) {
        console.error("[ClosureData] Failed to create signed upload URL:", error?.message);
        return NextResponse.json(
          { error: `Failed to create upload URL: ${error?.message || "unknown"}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        upload_url: data.signedUrl,
        token: data.token,
        storage_path: storagePath,
      });
    }

    if (action === "upload-signed") {
      const { signed_url, reception_id } = body as { signed_url: string; reception_id: string };

      // Try to update in DB first
      let dbSuccess = false;

      if (reception_id && !reception_id.startsWith("storage-fallback-") && !reception_id.startsWith("local-fallback-")) {
        // Real DB record — update it
        const { error } = await (admin as any)
          .from("project_receptions")
          .update({
            pv_signed_url: signed_url,
            pv_signed_at: new Date().toISOString(),
            status: "signed",
          })
          .eq("id", reception_id);

        if (!error) {
          dbSuccess = true;
        } else {
          console.warn("[ClosureData] DB update failed:", error.message);
        }
      }

      if (!dbSuccess) {
        // Try to create a new record (table might not exist)
        try {
          const { error } = await (admin as any)
            .from("project_receptions")
            .insert({
              project_id: projectId,
              organization_id: profile.organization_id,
              reception_type: "provisional",
              reception_date: new Date().toISOString().split("T")[0],
              status: "signed",
              pv_signed_url: signed_url,
              pv_signed_at: new Date().toISOString(),
            });

          if (error) {
            console.warn(
              "[ClosureData] DB insert failed (table may not exist):",
              error.message
            );
          }
        } catch (err) {
          console.warn("[ClosureData] DB insert exception:", err);
        }
      }

      return NextResponse.json({ success: true });
    }

    if (action === "ensure-reception") {
      // Secondary save: create a minimal reception record if none exists
      // This is a fallback when generate-pv's DB save failed
      const { reception_type, reception_date } = body;

      // First check if a record already exists
      let hasExisting = false;
      try {
        const { data: existing } = await (admin as any)
          .from("project_receptions")
          .select("id")
          .eq("project_id", projectId)
          .limit(1)
          .maybeSingle();
        hasExisting = !!existing;
      } catch {
        // Table might not exist
      }

      if (!hasExisting) {
        // Try to create a minimal record
        try {
          const { error: insertErr } = await (admin as any)
            .from("project_receptions")
            .insert({
              project_id: projectId,
              organization_id: profile.organization_id,
              reception_type: reception_type || "provisional",
              reception_date: reception_date || new Date().toISOString().split("T")[0],
              status: "completed",
              pv_document_url: `closure/${profile.organization_id}/${projectId}/PVR-generated.docx`,
            });

          if (insertErr) {
            console.warn("[ClosureData] ensure-reception insert failed:", insertErr.message);
            // Table might not exist — that's OK, Storage fallback will handle it
          } else {
            console.log("[ClosureData] ensure-reception: created reception record");
          }
        } catch (err) {
          console.warn("[ClosureData] ensure-reception exception:", err);
        }
      }

      return NextResponse.json({ success: true });
    }

    if (action === "complete") {
      // Mark project as completed
      const now = new Date().toISOString();
      const { error } = await (admin as any)
        .from("projects")
        .update({ status: "completed", closed_at: now })
        .eq("id", projectId);

      if (error) {
        console.error("[ClosureData] Failed to complete project:", error);
        return NextResponse.json(
          { error: "Failed to update project status" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[ClosureData] POST Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
