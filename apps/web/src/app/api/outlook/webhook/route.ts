import { NextResponse, type NextRequest } from "next/server";

// Microsoft Graph webhook for real-time email notifications
// Placeholder for future implementation — currently sync is manual/polling

export async function POST(request: NextRequest) {
  // Microsoft Graph sends a validation token during subscription creation
  const validationToken = request.nextUrl.searchParams.get("validationToken");
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // TODO: Handle incoming change notifications
  // For now, return 202 Accepted to acknowledge receipt
  return NextResponse.json({ status: "accepted" }, { status: 202 });
}
