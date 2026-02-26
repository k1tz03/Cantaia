import { NextRequest, NextResponse } from "next/server";
import { parseBody } from "@/lib/api/parse-body";

// Redirect to the new /api/outlook/move-email endpoint
// Kept for backwards compatibility

export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  // Forward to move-email with folder_name derived from project
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const moveResponse = await fetch(`${appUrl}/api/outlook/move-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: request.headers.get("cookie") || "",
    },
    body: JSON.stringify({
      outlook_message_id: body?.emailId,
      folder_name: body?.targetFolder || "Cantaia Archive",
    }),
  });

  const result = await moveResponse.json();
  return NextResponse.json(result, { status: moveResponse.status });
}
