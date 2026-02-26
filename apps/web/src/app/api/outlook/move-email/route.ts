import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import {
  moveEmail,
  listFolders,
  createFolder,
  withRetry,
} from "@cantaia/core/outlook";
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

  const requiredError = validateRequired(body, ["outlook_message_id", "folder_name"]);
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

  const accessToken = tokenResult.accessToken;

  try {
    // Find or create the target folder
    const folders = await withRetry(() => listFolders(accessToken));
    let targetFolder = folders.find(
      (f) => f.displayName.toLowerCase() === body.folder_name.toLowerCase()
    );

    if (!targetFolder) {
      targetFolder = await withRetry(() =>
        createFolder(accessToken, body.folder_name)
      );
    }

    // Move the email
    await withRetry(() =>
      moveEmail(accessToken, body.outlook_message_id, targetFolder!.id)
    );

    return NextResponse.json({ success: true, folder_id: targetFolder.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to move email" },
      { status: 500 }
    );
  }
}
