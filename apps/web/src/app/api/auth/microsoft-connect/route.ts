import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/auth/microsoft-connect
 *
 * Initiates a DIRECT Microsoft OAuth flow (bypassing Supabase's provider_token
 * which is unreliable in PKCE mode). This endpoint is used by Settings >
 * Integrations when the user clicks "Connect Microsoft 365".
 *
 * Flow:
 * 1. Generates Microsoft OAuth URL with authorization_code grant
 * 2. Redirects user to Microsoft login
 * 3. Microsoft redirects back to /api/auth/microsoft-connect?code=xxx
 * 4. We exchange the code for tokens directly with Microsoft
 * 5. Store tokens in email_connections + users table
 * 6. Redirect to /settings?tab=outlook&connected=email
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common";

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Microsoft OAuth not configured" },
      { status: 500 }
    );
  }

  // Build the redirect_uri from the actual request host so it matches
  // the domain the user is on (and thus the URI registered in Azure AD).
  // NEXT_PUBLIC_APP_URL may point to a different domain (e.g. cantaia.ch
  // vs cantaia.vercel.app), so we prefer headers.
  const reqHost =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host");
  const appUrl = reqHost
    ? `${request.headers.get("x-forwarded-proto")?.split(",")[0] || "https"}://${reqHost}`
    : process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const redirectUri = `${appUrl}/api/auth/microsoft-connect`;
  console.log("[microsoft-connect] redirectUri:", redirectUri, "host:", reqHost);
  const scopes =
    "openid email profile offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read";

  // ── Handle OAuth error from Microsoft ──
  if (error) {
    console.error("[microsoft-connect] OAuth error:", error);
    return NextResponse.redirect(
      `${appUrl}/fr/settings?tab=outlook&connect_error=${encodeURIComponent(error)}`
    );
  }

  // ── Step 4: Exchange code for tokens ──
  if (code) {
    try {
      // Verify user is authenticated
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.redirect(`${appUrl}/fr/login`);
      }

      // Exchange authorization code for tokens with Microsoft
      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      const tokenBody = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        scope: scopes,
      });

      const tokenRes = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenBody.toString(),
      });

      if (!tokenRes.ok) {
        const errData = await tokenRes.json().catch(() => ({}));
        console.error("[microsoft-connect] Token exchange failed:", errData);
        return NextResponse.redirect(
          `${appUrl}/fr/settings?tab=outlook&connect_error=${encodeURIComponent(errData.error_description || "token_exchange_failed")}`
        );
      }

      const tokens = await tokenRes.json();
      const accessToken = tokens.access_token;
      const refreshToken = tokens.refresh_token;
      const expiresIn = tokens.expires_in || 3600;

      console.log("[microsoft-connect] Got Microsoft tokens:", {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        expiresIn,
      });

      if (!accessToken) {
        return NextResponse.redirect(
          `${appUrl}/fr/settings?tab=outlook&connect_error=no_access_token`
        );
      }

      // Get user's email from Microsoft Graph
      let microsoftEmail = user.email || "";
      try {
        const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          microsoftEmail =
            meData.mail || meData.userPrincipalName || microsoftEmail;
        }
      } catch {
        // Use user.email as fallback
      }

      const adminClient = createAdminClient();

      // Get user's organization
      const { data: userProfile } = await adminClient
        .from("users")
        .select("organization_id, preferred_language")
        .eq("id", user.id)
        .maybeSingle();

      const orgId = userProfile?.organization_id;
      const userLocale = userProfile?.preferred_language || "fr";

      if (!orgId) {
        console.error("[microsoft-connect] User has no organization:", user.id);
        return NextResponse.redirect(
          `${appUrl}/${userLocale}/settings?tab=outlook&connect_error=no_organization`
        );
      }

      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

      // Store tokens in users table (legacy compatibility)
      await adminClient
        .from("users")
        .update({
          microsoft_access_token: accessToken,
          microsoft_refresh_token: refreshToken || null,
          microsoft_token_expires_at: expiresAt.toISOString(),
          outlook_sync_enabled: true,
        })
        .eq("id", user.id);

      // Upsert email_connection (handles re-connections without unique constraint errors)
      // First, delete any existing connections for this user to avoid conflicts
      await (adminClient as any)
        .from("email_connections")
        .delete()
        .eq("user_id", user.id);

      const { error: connError } = await (adminClient as any)
        .from("email_connections")
        .insert({
          user_id: user.id,
          organization_id: orgId,
          provider: "microsoft",
          oauth_access_token: accessToken,
          oauth_refresh_token: refreshToken || null,
          oauth_token_expires_at: expiresAt.toISOString(),
          oauth_scopes: scopes,
          email_address: microsoftEmail,
          display_name: user.user_metadata?.full_name || null,
          status: "active",
        })
        .select("id")
        .single();

      if (connError) {
        console.error(
          "[microsoft-connect] email_connection insert error:",
          connError
        );
      }

      console.log(
        "[microsoft-connect] Email connection created for:",
        microsoftEmail,
        "user:",
        user.id
      );

      return NextResponse.redirect(
        `${appUrl}/${userLocale}/settings?tab=outlook&connected=email`
      );
    } catch (err) {
      console.error("[microsoft-connect] Unexpected error:", err);
      return NextResponse.redirect(
        `${appUrl}/fr/settings?tab=outlook&connect_error=unexpected_error`
      );
    }
  }

  // ── Step 1: Verify user is authenticated ──
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${appUrl}/fr/login`);
  }

  // ── Step 2: Generate Microsoft OAuth URL ──
  const state = Buffer.from(
    JSON.stringify({ user_id: user.id, ts: Date.now() })
  ).toString("base64url");

  const authUrl = new URL(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`
  );
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "consent");

  return NextResponse.redirect(authUrl.toString());
}
