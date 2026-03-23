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
  "message/rfc822", // .eml
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

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

    // Check MIME type (allow .msg which has application/octet-stream or application/vnd.ms-outlook)
    const isAllowed =
      ALLOWED_TYPES.includes(file.type) ||
      file.name.endsWith(".msg") ||
      file.name.endsWith(".eml");
    if (!isAllowed) {
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

    const { data: urlData } = admin.storage
      .from("chat-attachments")
      .getPublicUrl(path);

    // Extract text for PDF/Excel/CSV
    let extractedText = "";
    const isImage = file.type.startsWith("image/");

    if (file.type === "application/pdf") {
      // Polyfill browser globals for pdfjs-dist in serverless
      if (typeof globalThis.DOMMatrix === "undefined") {
        (globalThis as any).DOMMatrix = class DOMMatrix {
          m11 = 1; m12 = 0; m13 = 0; m14 = 0;
          m21 = 0; m22 = 1; m23 = 0; m24 = 0;
          m31 = 0; m32 = 0; m33 = 1; m34 = 0;
          m41 = 0; m42 = 0; m43 = 0; m44 = 1;
          a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
          is2D = true; isIdentity = true;
          inverse() { return new (globalThis as any).DOMMatrix(); }
          multiply() { return new (globalThis as any).DOMMatrix(); }
          translate() { return new (globalThis as any).DOMMatrix(); }
          scale() { return new (globalThis as any).DOMMatrix(); }
          rotate() { return new (globalThis as any).DOMMatrix(); }
          transformPoint() { return { x: 0, y: 0, z: 0, w: 1 }; }
        };
      }
      if (typeof globalThis.Path2D === "undefined") {
        (globalThis as any).Path2D = class Path2D { };
      }
      try {
        const pdfModule = await import("pdf-parse");
        const pdfParse = (pdfModule as any).default || pdfModule;
        const result = await pdfParse(buffer);
        extractedText = result.text.slice(0, 50000); // max 50K chars
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
      file_url: urlData.publicUrl,
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
