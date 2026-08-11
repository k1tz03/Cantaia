import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/admin/require-superadmin";

// Détail / mise à jour / suppression d'un document du coffre-fort personnel.
// GET retourne une signed URL (bucket privé). Accès : superadmin + owner only.

const CATEGORIES = ["fiche_paie", "contrat", "facture", "impots", "sante", "identite", "autre"];

async function getOwnedDocument(admin: any, id: string, userId: string) {
  const { data: document } = await admin
    .from("personal_documents")
    .select("*")
    .eq("id", id)
    .single();
  if (!document || document.user_id !== userId) return null;
  return document;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const check = await requireSuperadmin();
    if (!check.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!check.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const document = await getOwnedDocument(admin as any, id, check.userId);
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { data: signed, error: signError } = await admin.storage
      .from(document.storage_bucket || "personal-vault")
      .createSignedUrl(document.storage_path, 3600, {
        download: document.file_name,
      });

    if (signError || !signed?.signedUrl) {
      console.error("[Hub] Signed URL error:", signError);
      return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
    }

    return NextResponse.json({ success: true, document, url: signed.signedUrl });
  } catch (error) {
    console.error("[Hub] Document detail error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const check = await requireSuperadmin();
    if (!check.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!check.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const document = await getOwnedDocument(admin as any, id, check.userId);
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) {
      updates.title = body.title.trim().slice(0, 300);
    }
    if (typeof body.notes === "string") {
      updates.notes = body.notes.trim() || null;
    }
    if (typeof body.category === "string" && CATEGORIES.includes(body.category)) {
      updates.category = body.category;
    }
    if (typeof body.document_date === "string") {
      updates.document_date = /^\d{4}-\d{2}-\d{2}$/.test(body.document_date)
        ? body.document_date
        : null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data: updated, error } = await (admin as any)
      .from("personal_documents")
      .update(updates)
      .eq("id", id)
      .eq("user_id", check.userId)
      .select()
      .single();

    if (error) {
      console.error("[Hub] Document update error:", error);
      return NextResponse.json({ error: "Failed to update document" }, { status: 500 });
    }

    return NextResponse.json({ success: true, document: updated });
  } catch (error) {
    console.error("[Hub] Document update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const check = await requireSuperadmin();
    if (!check.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!check.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const document = await getOwnedDocument(admin as any, id, check.userId);
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Storage d'abord, puis DB (échec storage loggé mais non bloquant)
    const { error: storageError } = await admin.storage
      .from(document.storage_bucket || "personal-vault")
      .remove([document.storage_path]);
    if (storageError) {
      console.error("[Hub] Storage delete error:", storageError);
    }

    const { error } = await (admin as any)
      .from("personal_documents")
      .delete()
      .eq("id", id)
      .eq("user_id", check.userId);

    if (error) {
      console.error("[Hub] Document delete error:", error);
      return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Hub] Document delete error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
