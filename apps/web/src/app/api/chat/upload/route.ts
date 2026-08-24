import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
/** Signed URL lifetime — long enough for the chat history, short enough to expire. */
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const conversationId =
      (formData.get("conversation_id") as string) || "temp";

    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 10 MB)" },
        { status: 400 },
      );
    }

    // .msg / .eml were accepted but never parsed, so Claude received an empty
    // attachment. Reject them explicitly until extraction is implemented.
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".msg") || lowerName.endsWith(".eml")) {
      return NextResponse.json(
        {
          error:
            "Les fichiers e-mail (.msg / .eml) ne sont pas encore pris en charge dans le chat. Copiez le contenu du message ou joignez le PDF correspondant.",
        },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "File type not allowed" },
        { status: 400 },
      );
    }

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${profile.organization_id}/${conversationId}/${Date.now()}_${sanitizedName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from("chat-attachments")
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error("[Chat Upload] Storage error:", uploadError);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    // The chat-attachments bucket is private: a public URL would either 404
    // (private bucket) or leak the file (public bucket). Use a signed URL.
    const { data: urlData, error: signedUrlError } = await admin.storage
      .from("chat-attachments")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (signedUrlError || !urlData?.signedUrl) {
      console.error("[Chat Upload] Signed URL error:", signedUrlError);
      return NextResponse.json(
        { error: "Failed to create file URL" },
        { status: 500 },
      );
    }

    // Extract text for PDF/Excel/CSV
    let extractedText = "";
    const isImage = file.type.startsWith("image/");

    if (file.type === "application/pdf") {
      try {
        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
        const textParts: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          textParts.push(content.items.map((item: any) => item.str).join(" "));
        }
        extractedText = textParts.join("\n").slice(0, 50000);
      } catch (e) {
        console.warn("[Chat Upload] PDF parse failed:", e);
      }
    } else if (
      file.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.type === "text/csv"
    ) {
      try {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buffer, { type: "buffer" });
        const texts: string[] = [];
        for (const sheetName of workbook.SheetNames.slice(0, 5)) {
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
          texts.push(`[Sheet: ${sheetName}]\n${csv}`);
        }
        extractedText = texts.join("\n\n").slice(0, 50000);
      } catch (e) {
        console.warn("[Chat Upload] Excel parse failed:", e);
      }
    }

    return NextResponse.json({
      file_url: urlData.signedUrl,
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      extracted_text: extractedText || undefined,
      is_image: isImage,
    });
  } catch (error) {
    console.error("[Chat Upload] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
