import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/admin/require-superadmin";

// Coffre-fort de documents personnels (bucket privé `personal-vault`)
// Accès : superadmin uniquement, données scopées user_id.

const BUCKET = "personal-vault";
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/csv",
  "text/plain",
  "message/rfc822", // .eml
];
const CATEGORIES = ["fiche_paie", "contrat", "facture", "impots", "sante", "identite", "autre"];

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
    const category = request.nextUrl.searchParams.get("category");

    let query = (admin as any)
      .from("personal_documents")
      .select("*")
      .eq("user_id", check.userId)
      .order("created_at", { ascending: false });

    if (category && CATEGORIES.includes(category)) {
      query = query.eq("category", category);
    }

    const { data: documents, error } = await query;
    if (error) {
      console.error("[Hub] Documents list error:", error);
      // Table absente (migration 077 pas appliquée) — dégradation gracieuse
      return NextResponse.json({ success: true, documents: [], totalSize: 0 });
    }

    const totalSize = (documents || []).reduce(
      (sum: number, d: any) => sum + (Number(d.file_size) || 0),
      0
    );

    return NextResponse.json({ success: true, documents: documents || [], totalSize });
  } catch (error) {
    console.error("[Hub] Documents error:", error);
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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Type de fichier non autorisé" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 25 MB)" }, { status: 400 });
    }

    const rawCategory = String(formData.get("category") || "autre");
    const category = CATEGORIES.includes(rawCategory) ? rawCategory : "autre";
    const title = String(formData.get("title") || "").trim() || file.name;
    const notes = String(formData.get("notes") || "").trim() || null;
    const documentDateRaw = String(formData.get("document_date") || "").trim();
    const documentDate = /^\d{4}-\d{2}-\d{2}$/.test(documentDateRaw) ? documentDateRaw : null;

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${check.userId}/${category}/${Date.now()}_${sanitizedName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });

    if (uploadError) {
      console.error("[Hub] Upload error:", uploadError);
      return NextResponse.json(
        { error: "Échec de l'upload (le bucket personal-vault existe-t-il ?)" },
        { status: 500 }
      );
    }

    const { data: document, error: insertError } = await (admin as any)
      .from("personal_documents")
      .insert({
        user_id: check.userId,
        category,
        title: title.slice(0, 300),
        notes,
        document_date: documentDate,
        storage_bucket: BUCKET,
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
      })
      .select()
      .single();

    if (insertError || !document) {
      console.error("[Hub] Document insert error:", insertError);
      // Rollback du fichier orphelin
      await admin.storage.from(BUCKET).remove([path]);
      return NextResponse.json(
        { error: "Échec de l'enregistrement (migration 077 appliquée ?)" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, document }, { status: 201 });
  } catch (error) {
    console.error("[Hub] Document upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
