import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { getAttachments } from "@cantaia/core/outlook";

/**
 * GET /api/outlook/attachments?messageId={outlookMessageId}
 * Lists all non-inline attachments for an email.
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
  if (!messageId) {
    return NextResponse.json(
      { error: "messageId query parameter is required" },
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
    const attachments = await getAttachments(tokenResult.accessToken, messageId);
    return NextResponse.json({ success: true, attachments });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
