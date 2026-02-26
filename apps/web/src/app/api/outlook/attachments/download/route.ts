import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { getAttachment } from "@cantaia/core/outlook";

/**
 * GET /api/outlook/attachments/download?messageId={id}&attachmentId={aid}
 * Downloads a specific attachment and returns it as a binary file.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messageId = request.nextUrl.searchParams.get("messageId");
  const attachmentId = request.nextUrl.searchParams.get("attachmentId");

  if (!messageId || !attachmentId) {
    return NextResponse.json(
      { error: "messageId and attachmentId are required" },
      { status: 400 }
    );
  }

  const tokenResult = await getValidMicrosoftToken(user.id);
  if (!tokenResult.accessToken) {
    return NextResponse.json(
      { error: "Microsoft token not available" },
      { status: 401 }
    );
  }

  try {
    const attachment = await getAttachment(
      tokenResult.accessToken,
      messageId,
      attachmentId
    );

    if (!attachment.contentBytes) {
      return NextResponse.json(
        { error: "No content in attachment" },
        { status: 404 }
      );
    }

    const buffer = Buffer.from(attachment.contentBytes, "base64");

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": attachment.contentType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.name)}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
