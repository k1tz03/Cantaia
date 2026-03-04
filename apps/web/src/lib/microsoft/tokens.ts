import { createAdminClient } from "@/lib/supabase/admin";

interface TokenResult {
  accessToken: string;
  error?: never;
}

interface TokenError {
  accessToken?: never;
  error: string;
}

/**
 * Get a valid Microsoft access token for a user.
 * If the token is expired, automatically refreshes it using the refresh_token.
 * Returns the valid access token or an error.
 */
export async function getValidMicrosoftToken(
  userId: string
): Promise<TokenResult | TokenError> {
  const adminClient = createAdminClient();

  const { data: user, error } = await adminClient
    .from("users")
    .select(
      "microsoft_access_token, microsoft_refresh_token, microsoft_token_expires_at"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error || !user) {
    return { error: "User not found" };
  }

  if (!user.microsoft_access_token) {
    return { error: "Microsoft account not connected" };
  }

  // Check if token is still valid (with 5-minute buffer)
  const expiresAt = user.microsoft_token_expires_at
    ? new Date(user.microsoft_token_expires_at)
    : new Date(0);
  const now = new Date();
  const bufferMs = 5 * 60 * 1000; // 5 minutes

  if (expiresAt.getTime() - bufferMs > now.getTime()) {
    return { accessToken: user.microsoft_access_token };
  }

  // Token expired — refresh it
  if (!user.microsoft_refresh_token) {
    return { error: "No refresh token available. Please reconnect Outlook." };
  }

  let refreshed = await refreshMicrosoftToken(user.microsoft_refresh_token);

  // Retry once after a short delay before giving up
  if (refreshed.error) {
    await new Promise((r) => setTimeout(r, 1500));
    refreshed = await refreshMicrosoftToken(user.microsoft_refresh_token);
  }

  if (refreshed.error) {
    // Both attempts failed — clear invalid tokens
    await adminClient
      .from("users")
      .update({
        microsoft_access_token: null,
        microsoft_refresh_token: null,
        microsoft_token_expires_at: null,
        outlook_sync_enabled: false,
      })
      .eq("id", userId);

    return { error: refreshed.error };
  }

  // Store new tokens
  const newExpiresAt = new Date();
  newExpiresAt.setSeconds(
    newExpiresAt.getSeconds() + (refreshed.expires_in || 3600)
  );

  await adminClient
    .from("users")
    .update({
      microsoft_access_token: refreshed.access_token,
      microsoft_refresh_token:
        refreshed.refresh_token || user.microsoft_refresh_token,
      microsoft_token_expires_at: newExpiresAt.toISOString(),
    })
    .eq("id", userId);

  return { accessToken: refreshed.access_token };
}

async function refreshMicrosoftToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}> {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common";

  if (!clientId || !clientSecret) {
    return { access_token: "", error: "Microsoft OAuth not configured" };
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: "openid email profile offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read",
  });

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        access_token: "",
        error: `Token refresh failed: ${errorData.error_description || response.statusText}`,
      };
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    };
  } catch (err) {
    return {
      access_token: "",
      error: `Token refresh network error: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
}
