import { NextResponse } from "next/server";
import { requireHubAccess } from "@/lib/hub/access";
import { generateEml, type EmlEmailData } from "@/lib/emails/eml-generator";

// GET /api/hub/export — export ZIP complet du Hub Perso :
// tous les documents du coffre-fort + les emails conservés en .eml + un index JSON.

export const maxDuration = 300;

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120);
}

export async function GET() {
  try {
    const access = await requireHubAccess();
    if (!access.ok) return access.response;
    const { admin, userId } = access;

    const archiver = (await import("archiver")).default;
    const archive = archiver("zip", { zlib: { level: 6 } });

    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<void>((resolve, reject) => {
      archive.on("end", () => resolve());
      archive.on("error", (err: Error) => reject(err));
    });

    const manifest: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      documents: [] as unknown[],
      saved_emails: [] as unknown[],
      errors: [] as string[],
    };

    // ── Documents du coffre-fort ──
    const { data: documents } = await (admin as any)
      .from("personal_documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    const usedNames = new Set<string>();
    for (const doc of documents || []) {
      try {
        const { data: blob, error } = await admin.storage
          .from(doc.storage_bucket || "personal-vault")
          .download(doc.storage_path);
        if (error || !blob) {
          (manifest.errors as string[]).push(`Document introuvable: ${doc.title}`);
          continue;
        }
        const buffer = Buffer.from(await blob.arrayBuffer());
        let name = `documents/${doc.category}/${sanitize(doc.file_name || doc.title)}`;
        while (usedNames.has(name)) name = name.replace(/(\.[^.]*)?$/, `_${Date.now()}$1`);
        usedNames.add(name);
        archive.append(buffer, { name });
        (manifest.documents as unknown[]).push({
          title: doc.title,
          category: doc.category,
          file: name,
          document_date: doc.document_date,
          expiry_date: doc.expiry_date ?? null,
          notes: doc.notes,
          created_at: doc.created_at,
        });
      } catch (e) {
        (manifest.errors as string[]).push(`Échec download: ${doc.title}`);
        console.warn("[Hub Export] Document failed:", doc.id, e);
      }
    }

    // ── Emails conservés → fichiers .eml (RFC 2822) ──
    try {
      const { data: saved } = await (admin as any)
        .from("personal_saved_emails")
        .select("email_record_id, note, created_at")
        .eq("user_id", userId);

      const emailIds = (saved || []).map((s: any) => s.email_record_id);
      if (emailIds.length > 0) {
        const { data: records } = await (admin as any)
          .from("email_records")
          .select("id, subject, sender_name, sender_email, recipients, received_at, body_text, body_html")
          .in("id", emailIds);

        for (const rec of records || []) {
          try {
            const emlData: EmlEmailData = {
              subject: rec.subject || "(Sans objet)",
              from: { name: rec.sender_name || undefined, email: rec.sender_email || "inconnu@inconnu" },
              to: Array.isArray(rec.recipients)
                ? rec.recipients.filter(Boolean).map((r: string) => ({ email: r }))
                : [],
              date: rec.received_at || new Date().toISOString(),
              bodyText: rec.body_text || undefined,
              bodyHtml: rec.body_html || undefined,
            };
            const eml = generateEml(emlData);
            const datePart = (rec.received_at || "").slice(0, 10) || "sans-date";
            let name = `emails/${datePart}_${sanitize(rec.subject || "sans-objet")}.eml`;
            while (usedNames.has(name)) name = name.replace(/\.eml$/, `_${Math.random().toString(36).slice(2, 6)}.eml`);
            usedNames.add(name);
            archive.append(eml, { name });
            (manifest.saved_emails as unknown[]).push({
              subject: rec.subject,
              from: rec.sender_email,
              received_at: rec.received_at,
              file: name,
            });
          } catch (e) {
            (manifest.errors as string[]).push(`Échec .eml: ${rec.subject}`);
            console.warn("[Hub Export] Eml failed:", rec.id, e);
          }
        }
      }
    } catch {
      // personal_saved_emails absente — export documents uniquement
    }

    archive.append(JSON.stringify(manifest, null, 2), { name: "index.json" });
    await archive.finalize();
    await done;

    const zipBuffer = Buffer.concat(chunks);
    const filename = `hub-perso-export-${new Date().toISOString().slice(0, 10)}.zip`;

    return new NextResponse(zipBuffer as any, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(zipBuffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[Hub Export] Error:", error);
    return NextResponse.json({ error: "Échec de l'export" }, { status: 500 });
  }
}
