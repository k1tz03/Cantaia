import { NextRequest, NextResponse } from "next/server";
import { requireHubAccess } from "@/lib/hub/access";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { getAttachments, getAttachment } from "@/lib/outlook/graph-client";

// POST /api/hub/auto-archive — scanne les emails récents du propriétaire,
// détecte les documents personnels importants (fiches de paie, factures,
// impôts, contrats...) en pièce jointe PDF et les archive automatiquement
// dans le coffre-fort (bucket personal-vault, auto_archived=true).

export const maxDuration = 300;

const BUCKET = "personal-vault";
const SCAN_DAYS = 90;
const MAX_IMPORTS_PER_SCAN = 20;

// Mots-clés (minuscules, sans accents obligatoires) → catégorie
const CATEGORY_KEYWORDS: { category: string; keywords: string[] }[] = [
  {
    category: "fiche_paie",
    keywords: [
      "fiche de paie", "fiches de paie", "bulletin de salaire", "bulletin de paie",
      "decompte de salaire", "décompte de salaire", "payslip", "lohnabrechnung", "salaire",
    ],
  },
  {
    category: "impots",
    keywords: ["impot", "impôt", "taxation", "declaration fiscale", "déclaration fiscale", "steuer", "fisc"],
  },
  {
    category: "contrat",
    keywords: ["contrat", "contract", "vertrag", "avenant", "bail"],
  },
  {
    category: "sante",
    keywords: ["assurance maladie", "lamal", "caisse maladie", "krankenkasse", "decompte de prestations", "franchise"],
  },
  {
    category: "facture",
    keywords: ["facture", "invoice", "rechnung"],
  },
];

function detectCategory(text: string): string | null {
  const lower = text.toLowerCase();
  for (const entry of CATEGORY_KEYWORDS) {
    if (entry.keywords.some((k) => lower.includes(k))) return entry.category;
  }
  return null;
}

export async function POST(_request: NextRequest) {
  try {
    const access = await requireHubAccess();
    if (!access.ok) return access.response;
    const { admin, userId } = access;

    // Token Microsoft requis pour télécharger les pièces jointes via Graph
    const tokenResult = await getValidMicrosoftToken(userId);
    if ("error" in tokenResult || !tokenResult.accessToken) {
      return NextResponse.json(
        { error: "Connexion Microsoft requise pour scanner les pièces jointes", code: "NO_MICROSOFT_TOKEN" },
        { status: 400 }
      );
    }
    const accessToken = tokenResult.accessToken;

    // Emails récents avec pièces jointes
    const since = new Date(Date.now() - SCAN_DAYS * 86400000).toISOString();
    const { data: emails, error: emailsError } = await (admin as any)
      .from("email_records")
      .select("id, subject, sender_name, sender_email, received_at, body_preview, outlook_message_id, has_attachments")
      .eq("user_id", userId)
      .eq("has_attachments", true)
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(200);

    if (emailsError) {
      console.error("[Hub AutoArchive] Emails fetch error:", emailsError);
      return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 });
    }

    // Emails déjà archivés (dédoublonnage par source_email_id)
    const { data: existing } = await (admin as any)
      .from("personal_documents")
      .select("source_email_id")
      .eq("user_id", userId)
      .not("source_email_id", "is", null);
    const alreadyArchived = new Set((existing || []).map((d: any) => d.source_email_id));

    const results: any[] = [];
    let matched = 0;
    let imported = 0;

    for (const email of emails || []) {
      if (imported >= MAX_IMPORTS_PER_SCAN) break;
      if (alreadyArchived.has(email.id)) continue;
      if (!email.outlook_message_id) continue;

      const haystack = `${email.subject || ""} ${email.sender_name || ""} ${email.sender_email || ""} ${email.body_preview || ""}`;
      const category = detectCategory(haystack);
      if (!category) continue;
      matched++;

      try {
        const attachments = await getAttachments(accessToken, email.outlook_message_id);
        const docs = (attachments || []).filter(
          (a: any) =>
            !a.isInline &&
            (a.contentType === "application/pdf" || (a.name || "").toLowerCase().endsWith(".pdf")) &&
            (a.size || 0) < 25 * 1024 * 1024
        );

        for (const att of docs) {
          if (imported >= MAX_IMPORTS_PER_SCAN) break;
          const full = await getAttachment(accessToken, email.outlook_message_id, att.id);
          if (!full?.contentBytes) continue;

          const buffer = Buffer.from(full.contentBytes, "base64");
          const sanitizedName = (att.name || "document.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${userId}/${category}/auto_${Date.now()}_${sanitizedName}`;

          const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, buffer, {
            contentType: full.contentType || "application/pdf",
            upsert: false,
          });
          if (uploadError) {
            console.warn("[Hub AutoArchive] Upload failed:", uploadError);
            continue;
          }

          const insertPayload: Record<string, unknown> = {
            user_id: userId,
            category,
            title: `${att.name || "Document"} — ${email.subject || "email"}`.slice(0, 300),
            notes: `Archivé automatiquement depuis l'email de ${email.sender_name || email.sender_email}`,
            document_date: (email.received_at || "").slice(0, 10) || null,
            storage_bucket: BUCKET,
            storage_path: path,
            file_name: att.name || "document.pdf",
            file_size: buffer.length,
            file_type: full.contentType || "application/pdf",
            source_email_id: email.id,
            auto_archived: true,
          };

          let { data: doc, error: insertError } = await (admin as any)
            .from("personal_documents")
            .insert(insertPayload)
            .select("id, title, category")
            .single();

          // Fallback sans auto_archived si migration 078 pas appliquée
          if (insertError) {
            delete insertPayload.auto_archived;
            const retry = await (admin as any)
              .from("personal_documents")
              .insert(insertPayload)
              .select("id, title, category")
              .single();
            doc = retry.data;
            insertError = retry.error;
          }

          if (insertError || !doc) {
            await admin.storage.from(BUCKET).remove([path]);
            console.warn("[Hub AutoArchive] Insert failed:", insertError);
            continue;
          }

          imported++;
          alreadyArchived.add(email.id);
          results.push({
            document_id: doc.id,
            title: doc.title,
            category: doc.category,
            from: email.sender_email,
            subject: email.subject,
          });
        }
      } catch (e) {
        console.warn("[Hub AutoArchive] Email scan failed:", email.id, e);
      }
    }

    // Timestamp du dernier scan (best effort)
    try {
      await (admin as any)
        .from("personal_hub_settings")
        .upsert(
          { user_id: userId, last_auto_archive_scan: new Date().toISOString() },
          { onConflict: "user_id" }
        );
    } catch {
      // table absente — non bloquant
    }

    return NextResponse.json({
      success: true,
      scanned: (emails || []).length,
      matched,
      imported,
      documents: results,
    });
  } catch (error) {
    console.error("[Hub AutoArchive] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
