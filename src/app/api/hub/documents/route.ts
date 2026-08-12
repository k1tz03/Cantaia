import { NextRequest, NextResponse } from "next/server";
import { requireHubAccess } from "@/lib/hub/access";

// Coffre-fort de documents personnels (bucket privé `personal-vault`)
// Accès : superadmin + verrou PIN (requireHubAccess), données scopées user_id.

export const maxDuration = 60; // extraction texte PDF à l'upload

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

// Extraction texte pour la recherche plein texte (PDF via pdfjs, CSV/TXT direct)
async function extractText(buffer: Buffer, fileType: string): Promise<string> {
  try {
    if (fileType === "application/pdf") {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
      const textParts: string[] = [];
      for (let i = 1; i <= Math.min(doc.numPages, 50); i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        textParts.push(content.items.map((item: any) => item.str).join(" "));
      }
      return textParts.join("\n").slice(0, 100000);
    }
    if (fileType === "text/csv" || fileType === "text/plain") {
      return buffer.toString("utf-8").slice(0, 100000);
    }
    if (
      fileType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      fileType === "application/vnd.ms-excel"
    ) {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const texts: string[] = [];
      for (const sheetName of workbook.SheetNames.slice(0, 5)) {
        texts.push(XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName], { blankrows: false }));
      }
      return texts.join("\n").slice(0, 100000);
    }
  } catch (e) {
    console.warn("[Hub] Text extraction failed:", e);
  }
  return "";
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireHubAccess();
    if (!access.ok) return access.response;
    const { admin, userId } = access;

    const category = request.nextUrl.searchParams.get("category");
    const search = (request.nextUrl.searchParams.get("search") || "").trim();

    function baseQuery() {
      let q = (admin as any)
        .from("personal_documents")
        .select("id, category, title, notes, document_date, expiry_date, reminder_days, auto_archived, file_name, file_size, file_type, source_email_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (category && CATEGORIES.includes(category)) q = q.eq("category", category);
      return q;
    }

    let documents: any[] | null = null;
    let error: any = null;

    if (search.length >= 2) {
      // Recherche plein texte (tsvector 'french' sur titre + notes + texte extrait)
      const res = await baseQuery().textSearch("search_vector", search, {
        type: "websearch",
        config: "french",
      });
      documents = res.data;
      error = res.error;
      if (error) {
        // Fallback ilike si la colonne search_vector n'existe pas encore (migration 078)
        const safe = search.replace(/[%_,().]/g, "");
        const res2 = await baseQuery().or(
          `title.ilike.%${safe}%,notes.ilike.%${safe}%,file_name.ilike.%${safe}%`
        );
        documents = res2.data;
        error = res2.error;
      }
    } else {
      const res = await baseQuery();
      documents = res.data;
      error = res.error;
    }

    if (error) {
      console.error("[Hub] Documents list error:", error);
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
    const access = await requireHubAccess();
    if (!access.ok) return access.response;
    const { admin, userId } = access;

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
    const expiryDateRaw = String(formData.get("expiry_date") || "").trim();
    const expiryDate = /^\d{4}-\d{2}-\d{2}$/.test(expiryDateRaw) ? expiryDateRaw : null;
    const reminderDaysRaw = parseInt(String(formData.get("reminder_days") || "30"), 10);
    const reminderDays = Number.isFinite(reminderDaysRaw)
      ? Math.min(Math.max(reminderDaysRaw, 1), 365)
      : 30;

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/${category}/${Date.now()}_${sanitizedName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

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

    const extractedText = await extractText(buffer, file.type);

    const insertPayload: Record<string, unknown> = {
      user_id: userId,
      category,
      title: title.slice(0, 300),
      notes,
      document_date: documentDate,
      storage_bucket: BUCKET,
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
    };
    // Colonnes migration 078 — ajoutées seulement si non vides pour rester
    // compatible avec une DB en migration 077 uniquement
    if (extractedText) insertPayload.extracted_text = extractedText;
    if (expiryDate) {
      insertPayload.expiry_date = expiryDate;
      insertPayload.reminder_days = reminderDays;
    }

    let { data: document, error: insertError } = await (admin as any)
      .from("personal_documents")
      .insert(insertPayload)
      .select()
      .single();

    // Retry sans les colonnes 078 si la migration n'est pas appliquée
    if (insertError && (insertPayload.extracted_text || insertPayload.expiry_date)) {
      delete insertPayload.extracted_text;
      delete insertPayload.expiry_date;
      delete insertPayload.reminder_days;
      const retry = await (admin as any)
        .from("personal_documents")
        .insert(insertPayload)
        .select()
        .single();
      document = retry.data;
      insertError = retry.error;
    }

    if (insertError || !document) {
      console.error("[Hub] Document insert error:", insertError);
      await admin.storage.from(BUCKET).remove([path]);
      return NextResponse.json(
        { error: "Échec de l'enregistrement (migration 077/078 appliquée ?)" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, document }, { status: 201 });
  } catch (error) {
    console.error("[Hub] Document upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
