import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { sendReply, withRetry } from "@cantaia/core/outlook";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const requiredError = validateRequired(body, ["outlook_message_id", "reply_content"]);
  if (requiredError) {
    return NextResponse.json({ error: requiredError }, { status: 400 });
  }

  const tokenResult = await getValidMicrosoftToken(user.id);
  if (tokenResult.error || !tokenResult.accessToken) {
    return NextResponse.json(
      { error: tokenResult.error || "Microsoft not connected" },
      { status: 401 }
    );
  }

  try {
    await withRetry(() =>
      sendReply(tokenResult.accessToken!, body.outlook_message_id, body.reply_content)
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send reply" },
      { status: 500 }
    );
  }
}
