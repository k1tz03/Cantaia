import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/admin-consent-url
 * Returns the Microsoft Azure AD admin consent URL.
 * This URL allows an IT admin to approve Cantaia for their entire organization.
 * No authentication required — this is a public helper endpoint.
 */
export async function GET(request: NextRequest) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: "Microsoft OAuth not configured" },
      { status: 503 },
    );
  }

  // Build redirect URI from request headers (same pattern as microsoft-connect)
  const reqHost =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") || "https";
  const appUrl = reqHost
    ? `${protocol}://${reqHost}`
    : process.env.NEXT_PUBLIC_APP_URL || "https://cantaia.io";

  const redirectUri = `${appUrl}/api/auth/callback`;

  const scopes = [
    "Mail.Read",
    "Mail.ReadWrite",
    "Mail.Send",
    "User.Read",
    "offline_access",
    "openid",
    "email",
    "profile",
  ].join(" ");

  const url = `https://login.microsoftonline.com/common/adminconsent?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;

  return NextResponse.json({ url });
}
