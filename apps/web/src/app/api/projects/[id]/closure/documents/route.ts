import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * /api/projects/[id]/closure/documents
 *
 * Step 6 of the closure workflow ("documents de clôture") counted rows in
 * `closure_documents` but nothing could ever create one — the "Ajouter les
 * documents" button pointed at /closure/documents, a route that did not exist.
 * This is the read/write path behind that page.
 *
 * Files land in the same `audio` bucket / `closure/{orgId}/{projectId}/` prefix
 * as the rest of the closure module, so the archive ZIP and the project-delete
 * storage cleanup both pick them up without extra wiring.
 */

export const maxDuration = 60;

const DOCUMENT_TYPES = [
  "pv_reception",
  "pv_reserves_lifted",
  "guarantee_certificate",
  "final_invoice",
  "as_built_plans",
  "other",
];

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — the base64 body must fit Vercel's limit

async function resolveScope(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }

  const admin = createAdminClient();

  const { data: profile } = await (admin as any)
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.organization_id) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 403 }) } as const;
  }

  const { data: project } = await (admin as any)
    .from("projects")
    .select("id, organization_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project || project.organization_id !== profile.organization_id) {
    return { error: NextResponse.json({ error: "Project not found" }, { status: 404 }) } as const;
  }

  return { admin, userId: user.id, organizationId: profile.organization_id as string } as const;
}

/** GET — list the closure documents of a project. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const scope = await resolveScope(projectId);
    if ("error" in scope) return scope.error;

    const { data, error } = await (scope.admin as any)
      .from("closure_documents")
      .select("id, document_type, document_name, document_url, notes, uploaded_at")
      .eq("project_id", projectId)
      .order("uploaded_at", { ascending: false });

    if (error) {
      // Table absent (migration 010) — the page shows its empty state.
      console.warn("[ClosureDocuments] List failed:", error.message);
      return NextResponse.json({ documents: [], table_missing: true });
    }

    return NextResponse.json({ documents: data || [] });
  } catch (err) {
    console.error("[ClosureDocuments] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST — upload one closure document.
 * Body: { file_base64, filename, content_type, document_type, notes? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const scope = await resolveScope(projectId);
    if ("error" in scope) return scope.error;

    const body = await request.json().catch(() => null);
    if (!body?.file_base64 || !body?.filename) {
      return NextResponse.json({ error: "file_base64 et filename sont requis" }, { status: 400 });
    }

    const documentType = DOCUMENT_TYPES.includes(body.document_type) ? body.document_type : "other";
    const buffer = Buffer.from(body.file_base64, "base64");

    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: `Fichier trop volumineux (max ${MAX_BYTES / (1024 * 1024)} Mo)` },
        { status: 413 },
      );
    }

    // Path traversal guard — the filename comes from the browser.
    const safeName = String(body.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `closure/${scope.organizationId}/${projectId}/doc_${Date.now()}_${safeName}`;

    const { error: uploadErr } = await scope.admin.storage
      .from("audio")
      .upload(storagePath, buffer, {
        contentType: body.content_type || "application/octet-stream",
        upsert: true,
      });

    if (uploadErr) {
      console.error("[ClosureDocuments] Upload failed:", uploadErr.message);
      return NextResponse.json({ error: `Upload échoué: ${uploadErr.message}` }, { status: 500 });
    }

    const { data: urlData } = scope.admin.storage.from("audio").getPublicUrl(storagePath);

    // Latest reception, when there is one — keeps the document attached to the
    // PV it belongs to.
    let receptionId: string | null = null;
    try {
      const { data: reception } = await (scope.admin as any)
        .from("project_receptions")
        .select("id")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      receptionId = reception?.id ?? null;
    } catch {
      // project_receptions may not exist — the document is still valid.
    }

    const { data: document, error: insertErr } = await (scope.admin as any)
      .from("closure_documents")
      .insert({
        project_id: projectId,
        reception_id: receptionId,
        organization_id: scope.organizationId,
        document_type: documentType,
        document_name: String(body.filename).slice(0, 200),
        document_url: urlData?.publicUrl || storagePath,
        uploaded_by: scope.userId,
        notes: body.notes?.trim?.() || null,
      })
      .select("id, document_type, document_name, document_url, notes, uploaded_at")
      .single();

    if (insertErr) {
      console.error("[ClosureDocuments] Insert failed:", insertErr.message);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, document });
  } catch (err) {
    console.error("[ClosureDocuments] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** DELETE — remove one closure document (?document_id=). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: projectId } = await params;
    const documentId = request.nextUrl.searchParams.get("document_id");
    if (!documentId) {
      return NextResponse.json({ error: "document_id is required" }, { status: 400 });
    }

    const scope = await resolveScope(projectId);
    if ("error" in scope) return scope.error;

    // Scope the delete by project too: a document id alone must not be enough.
    const { error } = await (scope.admin as any)
      .from("closure_documents")
      .delete()
      .eq("id", documentId)
      .eq("project_id", projectId);

    if (error) {
      console.error("[ClosureDocuments] Delete failed:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ClosureDocuments] DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
