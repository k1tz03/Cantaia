import { createAdminClient } from "@/lib/supabase/admin";
import { encryptToken, decryptToken, isEncrypted } from "@/lib/crypto/token-encryption";

interface TokenResult {
  accessToken: string;
  error?: never;
}

interface TokenError {
  accessToken?: never;
  error: string;
}

/** Safely decrypt a token — returns plaintext if not encrypted */
function safeDecrypt(token: string): string {
  if (!token) return token;
  if (!process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY) return token;
  try {
    return isEncrypted(token) ? decryptToken(token) : token;
  } catch {
    return token; // Fallback to plaintext during migration
  }
}

/** Encrypt a token if encryption key is configured */
function safeEncrypt(token: string): string {
  if (!token) return token;
  if (!process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY) return token;
  try {
    return encryptToken(token);
  } catch {
    return token;
  }
}

/**
 * Get a valid Microsoft access token for a user.
 *
 * Reads from email_connections first (canonical source after sync),
 * falls back to users table (legacy). Auto-refreshes expired tokens.
 * NEVER wipes tokens on refresh failure — just returns an error.
 */
export async function getValidMicrosoftToken(
  userId: string
): Promise<TokenResult | TokenError> {
  const adminClient = createAdminClient();

  // ── 1. Try email_connections first (canonical, kept fresh by sync) ──
  const { data: conn } = await adminClient
    .from("email_connections")
    .select("id, oauth_access_token, oauth_refresh_token, oauth_token_expires_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (conn?.oauth_access_token) {
    const connExpiresAt = conn.oauth_token_expires_at
      ? new Date(conn.oauth_token_expires_at)
      : new Date(0);
    const bufferMs = 5 * 60 * 1000;

    if (connExpiresAt.getTime() - bufferMs > Date.now()) {
      // Token from email_connections is still valid
      return { accessToken: safeDecrypt(conn.oauth_access_token) };
    }

    // Token expired — try refresh via email_connections refresh_token
    if (conn.oauth_refresh_token) {
      // B9 / OUTLOOK.1: another concurrent request (sync, contacts, thread…)
      // may already have refreshed this token while we were reading. Re-read
      // right before refreshing — Microsoft rotates the refresh token, so a
      // redundant refresh invalidates the one the other process just stored.
      const { data: freshConn } = await adminClient
        .from("email_connections")
        .select("oauth_access_token, oauth_refresh_token, oauth_token_expires_at")
        .eq("id", conn.id)
        .maybeSingle();

      const freshExpiryMs = freshConn?.oauth_token_expires_at
        ? new Date(freshConn.oauth_token_expires_at).getTime()
        : 0;
      if (freshConn?.oauth_access_token && freshExpiryMs - bufferMs > Date.now()) {
        return { accessToken: safeDecrypt(freshConn.oauth_access_token) };
      }

      const refreshToken = safeDecrypt(
        freshConn?.oauth_refresh_token || conn.oauth_refresh_token
      );
      const refreshed = await refreshMicrosoftToken(refreshToken);

      if (!refreshed.error) {
        const newExpiresAt = new Date();
        newExpiresAt.setSeconds(newExpiresAt.getSeconds() + (refreshed.expires_in || 3600));

        // Update BOTH email_connections AND users table.
        // supabase-js ne throw pas : on inspecte {error} et on LOGGE une
        // persistance ratée (le prochain appel re-refreshera). On ne WIPE
        // JAMAIS les tokens sur échec — contrat de ce module.
        const [connUpdate, userUpdate] = await Promise.all([
          adminClient
            .from("email_connections")
            .update({
              oauth_access_token: safeEncrypt(refreshed.access_token),
              oauth_refresh_token: safeEncrypt(refreshed.refresh_token || refreshToken),
              oauth_token_expires_at: newExpiresAt.toISOString(),
            })
            .eq("id", conn.id),
          adminClient
            .from("users")
            .update({
              microsoft_access_token: safeEncrypt(refreshed.access_token),
              microsoft_refresh_token: safeEncrypt(refreshed.refresh_token || refreshToken),
              microsoft_token_expires_at: newExpiresAt.toISOString(),
            })
            .eq("id", userId),
        ]);
        if (connUpdate.error) {
          console.error(`[tokens] Failed to persist refreshed token to email_connections for user ${userId}: ${connUpdate.error.message}`);
        }
        if (userUpdate.error) {
          console.error(`[tokens] Failed to persist refreshed token to users for user ${userId}: ${userUpdate.error.message}`);
        }

        return { accessToken: refreshed.access_token };
      }
      // Refresh failed — do NOT wipe tokens, fall through to users table
      console.warn(`[tokens] email_connections refresh failed for user ${userId}: ${refreshed.error}`);
    }
  }

  // ── 2. Fallback: users table (legacy) ──
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

  const rawAccessToken = user.microsoft_access_token;
  if (!rawAccessToken) {
    return { error: "Microsoft account not connected" };
  }

  const accessToken = safeDecrypt(rawAccessToken);

  // Check if token is still valid (with 5-minute buffer)
  const expiresAt = user.microsoft_token_expires_at
    ? new Date(user.microsoft_token_expires_at)
    : new Date(0);
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt.getTime() - bufferMs > Date.now()) {
    return { accessToken };
  }

  // Token expired — refresh it
  const rawRefreshToken = user.microsoft_refresh_token;
  if (!rawRefreshToken) {
    return { error: "No refresh token available. Please reconnect Outlook." };
  }

  // B9 / OUTLOOK.1: re-read immediately before refreshing — the email_connections
  // branch above can take seconds, during which a concurrent request may already
  // have rotated the tokens.
  const { data: freshUser } = await adminClient
    .from("users")
    .select(
      "microsoft_access_token, microsoft_refresh_token, microsoft_token_expires_at"
    )
    .eq("id", userId)
    .maybeSingle();

  const freshUserExpiryMs = freshUser?.microsoft_token_expires_at
    ? new Date(freshUser.microsoft_token_expires_at).getTime()
    : 0;
  if (freshUser?.microsoft_access_token && freshUserExpiryMs - bufferMs > Date.now()) {
    return { accessToken: safeDecrypt(freshUser.microsoft_access_token) };
  }

  const refreshToken = safeDecrypt(
    freshUser?.microsoft_refresh_token || rawRefreshToken
  );
  let refreshed = await refreshMicrosoftToken(refreshToken);

  // Retry once after a short delay before giving up
  if (refreshed.error) {
    await new Promise((r) => setTimeout(r, 1500));

    // Another process may have won the race during the delay (B9)
    const { data: retryUser } = await adminClient
      .from("users")
      .select("microsoft_access_token, microsoft_token_expires_at")
      .eq("id", userId)
      .maybeSingle();
    const retryExpiryMs = retryUser?.microsoft_token_expires_at
      ? new Date(retryUser.microsoft_token_expires_at).getTime()
      : 0;
    if (retryUser?.microsoft_access_token && retryExpiryMs - bufferMs > Date.now()) {
      return { accessToken: safeDecrypt(retryUser.microsoft_access_token) };
    }

    refreshed = await refreshMicrosoftToken(refreshToken);
  }

  if (refreshed.error) {
    // Do NOT wipe tokens — the user can still reconnect manually.
    // Wiping tokens causes permanent disconnection visible in the UI.
    console.error(`[tokens] All refresh attempts failed for user ${userId}: ${refreshed.error}`);
    return { error: refreshed.error };
  }

  // Store new tokens in BOTH tables
  const newExpiresAt = new Date();
  newExpiresAt.setSeconds(
    newExpiresAt.getSeconds() + (refreshed.expires_in || 3600)
  );

  const encryptedAccess = safeEncrypt(refreshed.access_token);
  const encryptedRefresh = safeEncrypt(refreshed.refresh_token || refreshToken);

  // supabase-js ne throw pas : on vérifie {error} et on LOGGE toute persistance
  // ratée (jamais de wipe — le token en mémoire reste retourné, le prochain
  // appel re-refreshera).
  const [userUpdate, connUpdate] = await Promise.all([
    adminClient
      .from("users")
      .update({
        microsoft_access_token: encryptedAccess,
        microsoft_refresh_token: encryptedRefresh,
        microsoft_token_expires_at: newExpiresAt.toISOString(),
      })
      .eq("id", userId),
    // Also update email_connections if it exists
    conn?.id
      ? adminClient
          .from("email_connections")
          .update({
            oauth_access_token: encryptedAccess,
            oauth_refresh_token: encryptedRefresh,
            oauth_token_expires_at: newExpiresAt.toISOString(),
          })
          .eq("id", conn.id)
      : Promise.resolve({ error: null }),
  ]);
  if (userUpdate?.error) {
    console.error(`[tokens] Failed to persist refreshed token to users for user ${userId}: ${userUpdate.error.message}`);
  }
  if (connUpdate?.error) {
    console.error(`[tokens] Failed to persist refreshed token to email_connections for user ${userId}: ${connUpdate.error.message}`);
  }

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
    // B4: must stay in sync with the initial consent scopes
    // (apps/web/src/app/api/auth/microsoft-connect/route.ts and
    // packages/core/src/emails/providers/microsoft-provider.ts). Dropping
    // People.Read / Contacts.Read here silently broke contact autocomplete
    // ~1h after login, once the first refresh happened.
    scope: "openid email profile offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read People.Read Contacts.Read",
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
