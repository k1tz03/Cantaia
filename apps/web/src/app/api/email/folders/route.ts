import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/email/folders
 * List Outlook folders for the connected user.
 *
 * POST /api/email/folders
 * Create a new folder in Outlook.
 * Body: { name: string, parent_folder_id?: string }
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get user's Microsoft token
  const { data: userRow } = await (admin as any)
    .from("users")
    .select("microsoft_access_token, microsoft_token_expires_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!userRow?.microsoft_access_token) {
    return NextResponse.json({ error: "No Microsoft connection" }, { status: 400 });
  }

  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/me/mailFolders?$top=100", {
      headers: { Authorization: `Bearer ${userRow.microsoft_access_token}` },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch folders" }, { status: res.status });
    }

    const data = await res.json();
    const folders = (data.value || []).map((f: any) => ({
      id: f.id,
      name: f.displayName,
      parent_folder_id: f.parentFolderId,
      total_count: f.totalItemCount,
      unread_count: f.unreadItemCount,
    }));

    return NextResponse.json({ folders });
  } catch (err) {
    return NextResponse.json(
      { error: `Folder fetch failed: ${err instanceof Error ? err.message : "Unknown"}` },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name: string; parent_folder_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: userRow } = await (admin as any)
    .from("users")
    .select("microsoft_access_token")
    .eq("id", user.id)
    .maybeSingle();

  if (!userRow?.microsoft_access_token) {
    return NextResponse.json({ error: "No Microsoft connection" }, { status: 400 });
  }

  try {
    const endpoint = body.parent_folder_id
      ? `https://graph.microsoft.com/v1.0/me/mailFolders/${body.parent_folder_id}/childFolders`
      : "https://graph.microsoft.com/v1.0/me/mailFolders";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userRow.microsoft_access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ displayName: body.name }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: (errData as any).error?.message || "Failed to create folder" },
        { status: res.status }
      );
    }

    const folder = await res.json();
    return NextResponse.json({
      success: true,
      folder: {
        id: folder.id,
        name: folder.displayName,
        parent_folder_id: folder.parentFolderId,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Folder creation failed: ${err instanceof Error ? err.message : "Unknown"}` },
      { status: 500 }
    );
  }
}
