import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { listFolders, withRetry } from "@cantaia/core/outlook";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokenResult = await getValidMicrosoftToken(user.id);
  if (tokenResult.error || !tokenResult.accessToken) {
    return NextResponse.json(
      { error: tokenResult.error || "Microsoft not connected" },
      { status: 401 }
    );
  }

  try {
    const folders = await withRetry(() =>
      listFolders(tokenResult.accessToken!)
    );

    return NextResponse.json({
      success: true,
      folders: folders.map((f) => ({
        id: f.id,
        name: f.displayName,
        total: f.totalItemCount,
        unread: f.unreadItemCount,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list folders" },
      { status: 500 }
    );
  }
}
