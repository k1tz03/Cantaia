import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { TRIAL_DURATION_DAYS } from "@cantaia/config/constants";

/**
 * Migrate all data references from one user ID to another.
 * Used when a user re-authenticates with a different OAuth provider,
 * resulting in a new Supabase auth UID.
 */
async function migrateUserData(
  adminClient: ReturnType<typeof createAdminClient>,
  fromUserId: string,
  toUserId: string
) {
  if (process.env.NODE_ENV === "development") console.log("[auth/callback] Migrating data from", fromUserId, "to", toUserId);
  await adminClient.from("project_members").update({ user_id: toUserId } as any).eq("user_id", fromUserId);
  await adminClient.from("tasks").update({ assigned_to: toUserId } as any).eq("assigned_to", fromUserId);
  await adminClient.from("tasks").update({ created_by: toUserId } as any).eq("created_by", fromUserId);
  await adminClient.from("email_records").update({ user_id: toUserId } as any).eq("user_id", fromUserId);
  await adminClient.from("meetings").update({ created_by: toUserId } as any).eq("created_by", fromUserId);
  await adminClient.from("email_connections").update({ user_id: toUserId } as any).eq("user_id", fromUserId);
  // Delete old user row
  await adminClient.from("users").delete().eq("id", fromUserId).neq("id", toUserId);
  if (process.env.NODE_ENV === "development") console.log("[auth/callback] Data migration complete");
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");
  // Validate next parameter to prevent open redirect attacks
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next = (rawNext.startsWith("/") && !rawNext.startsWith("//")) ? rawNext : "/dashboard";
  // link_org is set when connecting email from Settings (preserves current org)
  const linkOrgId = searchParams.get("link_org");
  // link_user is the ID of the user who initiated the connection (may differ from OAuth user)
  const linkUserId = searchParams.get("link_user");

  // Always log in production to diagnose split-identity issues
  console.log("[auth/callback] Received callback:", {
    hasCode: !!code,
    error: errorParam,
    next,
    linkOrgId: linkOrgId || "NONE",
    linkUserId: linkUserId || "NONE",
    fullUrl: request.url.replace(/code=[^&]+/, "code=REDACTED"),
  });

  // Detect locale from the URL path or referrer (defaults to "fr")
  const pathLocaleMatch = new URL(request.url).pathname.match(/^\/(fr|en|de)\//);
  const nextLocaleMatch = next?.match(/^\/(fr|en|de)(\/|$)/);
  const refererLocaleMatch = request.headers.get("referer")?.match(/\/(fr|en|de)(\/|$)/);
  const locale = pathLocaleMatch?.[1] || nextLocaleMatch?.[1] || refererLocaleMatch?.[1] || "fr";

  // Handle OAuth errors from Supabase/Microsoft/Google
  if (errorParam) {
    console.error("[auth/callback] OAuth error:", errorParam, errorDesc);
    return NextResponse.redirect(
      `${origin}/${locale}/login?error=${encodeURIComponent(errorParam)}`
    );
  }

  if (code) {
    try {
      const supabase = await createClient();
      if (process.env.NODE_ENV === "development") console.log("[auth/callback] Exchanging code for session...");
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("[auth/callback] Exchange error:", error.message);
        return NextResponse.redirect(
          `${origin}/${locale}/login?error=${encodeURIComponent(error.message)}`
        );
      }

      if (data.user && data.session) {
        console.log("[auth/callback] Session established for:", data.user.email, "id:", data.user.id);
        const adminClient = createAdminClient();

        // Determine auth provider from Supabase identity
        const identity = data.user.identities?.[0];
        const authProvider = identity?.provider === "azure"
          ? "microsoft"
          : identity?.provider === "google"
            ? "google"
            : "email";

        console.log("[auth/callback] Auth provider:", authProvider);

        // ────────────────────────────────────────────────────────────────
        // ORGANIZATION RESOLUTION: Find the right org for this user
        // Priority:
        //   1. link_org parameter (from Settings connection flow) → highest priority
        //   2. Existing user row with same auth ID → reuse org
        //   3. Existing user row with same email → reuse org + migrate data
        //   4. email_connections with same email → reuse org (user connecting with provider email)
        //   5. Create new org (truly first-time user)
        //
        // IMPORTANT: Session is already established at this point.
        // If org resolution fails, redirect to /mail anyway (never to /login).
        // ────────────────────────────────────────────────────────────────
        try {

        // Check 1: User exists by auth ID (needed by multiple branches)
        const { data: existingUser } = await adminClient
          .from("users")
          .select("id, organization_id")
          .eq("id", data.user.id)
          .maybeSingle();

        if (linkOrgId) {
          // PRIORITY CHECK: Settings flow — user connected email provider from within the app.
          console.log("[auth/callback] Settings flow detected:", {
            linkOrgId,
            linkUserId: linkUserId || "NONE",
            oauthUserId: data.user.id,
            oauthEmail: data.user.email,
            isSplit: linkUserId && linkUserId !== data.user.id,
          });

          const { data: linkedOrg } = await adminClient
            .from("organizations")
            .select("id")
            .eq("id", linkOrgId)
            .maybeSingle();

          if (linkedOrg) {
            // Find the ORIGINAL user who initiated the connection.
            // Priority: link_user param (explicit ID) > email match in org (fallback)
            let originalUser: { id: string; organization_id: string | null } | null = null;

            if (linkUserId && linkUserId !== data.user.id) {
              // Explicit user ID passed — use it directly (handles different emails)
              const { data: userById } = await adminClient
                .from("users")
                .select("id, organization_id")
                .eq("id", linkUserId)
                .eq("organization_id", linkOrgId)
                .maybeSingle();
              originalUser = userById;
              if (process.env.NODE_ENV === "development") console.log("[auth/callback] link_user lookup:", linkUserId, "found:", !!userById);
            }

            if (!originalUser && data.user.email) {
              // Fallback: match by email in the same org
              const { data: userByEmail } = await adminClient
                .from("users")
                .select("id, organization_id")
                .eq("email", data.user.email)
                .eq("organization_id", linkOrgId)
                .maybeSingle();
              if (userByEmail && userByEmail.id !== data.user.id) {
                originalUser = userByEmail;
              }
            }

            console.log("[auth/callback] originalUser resolution:", {
              found: !!originalUser,
              originalId: originalUser?.id || "NONE",
              oauthId: data.user.id,
              willMigrate: !!(originalUser && originalUser.id !== data.user.id),
            });

            if (originalUser && originalUser.id !== data.user.id) {
              // Identity was NOT linked (fallback signInWithOAuth created a new auth user).
              // The browser session is now for data.user.id (the OAuth user).
              // We keep BOTH users functional and save connection under BOTH.
              console.log("[auth/callback] SPLIT IDENTITY DETECTED — keeping both users functional");
              console.log("[auth/callback] Original user:", originalUser.id, "| OAuth user:", data.user.id);

              // Wrap entire handler in try/catch — NEVER redirect to login on error
              try {
                const providerToken = data.session?.provider_token;
                const providerRefreshToken = data.session?.provider_refresh_token;
                if (providerToken && (authProvider === "microsoft" || authProvider === "google")) {
                  let expiresIn = 3600;
                  try {
                    const parts = providerToken.split(".");
                    if (parts.length === 3) {
                      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
                      if (payload.exp && payload.iat) expiresIn = payload.exp - payload.iat;
                      else if (payload.exp) expiresIn = payload.exp - Math.floor(Date.now() / 1000);
                    }
                  } catch { /* fallback 3600s */ }
                  const expiresAt = new Date();
                  expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

                  const tokenFields: Record<string, unknown> = { auth_provider: authProvider };
                  if (authProvider === "microsoft") {
                    tokenFields.microsoft_access_token = providerToken;
                    tokenFields.microsoft_refresh_token = providerRefreshToken || null;
                    tokenFields.microsoft_token_expires_at = expiresAt.toISOString();
                    tokenFields.outlook_sync_enabled = true;
                  }

                  // Get original user's profile data
                  const { data: origProfile } = await adminClient
                    .from("users")
                    .select("first_name, last_name, role, preferred_language, email, phone")
                    .eq("id", originalUser.id)
                    .maybeSingle();

                  // 1. Update tokens on ORIGINAL user (for future email/password logins)
                  await adminClient.from("users").update(tokenFields as any).eq("id", originalUser.id);

                  // 2. Ensure OAuth user has a valid row in the same org with the same profile
                  //    Include onboarding_completed: true to prevent OnboardingGuard redirect
                  await adminClient.from("users").upsert({
                    id: data.user.id,
                    organization_id: linkOrgId,
                    email: data.user.email || origProfile?.email || "",
                    first_name: origProfile?.first_name || data.user.user_metadata?.full_name?.split(" ")[0] || "",
                    last_name: origProfile?.last_name || data.user.user_metadata?.full_name?.split(" ").slice(1).join(" ") || "",
                    role: origProfile?.role || "project_manager",
                    preferred_language: origProfile?.preferred_language || locale,
                    onboarding_completed: true,
                    ...tokenFields,
                  } as any, { onConflict: "id" });

                  // 3. Sync user_metadata so ProfileForm works for the OAuth user
                  try {
                    await adminClient.auth.admin.updateUserById(data.user.id, {
                      user_metadata: {
                        ...data.user.user_metadata,
                        first_name: origProfile?.first_name || data.user.user_metadata?.first_name || "",
                        last_name: origProfile?.last_name || data.user.user_metadata?.last_name || "",
                        phone: origProfile?.phone || "",
                        preferred_language: origProfile?.preferred_language || "fr",
                      },
                    });
                  } catch (metaErr) {
                    console.warn("[auth/callback] user_metadata sync failed:", metaErr);
                  }

                  // 4. Create email_connection under BOTH users (so it works regardless of which session)
                  const connectionScopes = authProvider === "microsoft"
                    ? "openid email profile offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read"
                    : "openid profile email gmail.readonly gmail.send gmail.modify";

                  const connectionBase = {
                    organization_id: linkOrgId,
                    provider: authProvider as "microsoft" | "google",
                    oauth_access_token: providerToken,
                    oauth_refresh_token: providerRefreshToken || null,
                    oauth_token_expires_at: expiresAt.toISOString(),
                    oauth_scopes: connectionScopes,
                    email_address: data.user.email!,
                    display_name: data.user.user_metadata?.full_name || null,
                    status: "active" as const,
                  };

                  // Connection for current session user (OAuth user)
                  try {
                    const { data: oauthConn } = await adminClient.from("email_connections")
                      .insert({ ...connectionBase, user_id: data.user.id })
                      .select("id").single();
                    if (oauthConn) {
                      await adminClient.from("email_connections").delete()
                        .eq("user_id", data.user.id).neq("id", oauthConn.id);
                    }
                  } catch (connErr) {
                    console.warn("[auth/callback] OAuth user connection insert failed:", connErr);
                  }

                  // Connection for original user (email/password login)
                  try {
                    const { data: origConn } = await adminClient.from("email_connections")
                      .insert({ ...connectionBase, user_id: originalUser.id })
                      .select("id").single();
                    if (origConn) {
                      await adminClient.from("email_connections").delete()
                        .eq("user_id", originalUser.id).neq("id", origConn.id);
                    }
                  } catch (connErr) {
                    console.warn("[auth/callback] Original user connection insert failed:", connErr);
                  }

                  console.log("[auth/callback] Tokens + connections saved under both users");
                }
              } catch (splitErr) {
                console.error("[auth/callback] Split identity handler error (non-fatal):", splitErr);
              }

              // ALWAYS redirect to settings — NEVER to login
              const { data: origProfile2 } = await adminClient
                .from("users")
                .select("preferred_language")
                .eq("id", originalUser.id)
                .maybeSingle();
              const origLocale = origProfile2?.preferred_language || locale;
              return NextResponse.redirect(`${origin}/${origLocale}/settings?tab=outlook&connected=email`);
            }

            // Normal case: identities are linked (same user ID) or truly new user
            if (process.env.NODE_ENV === "development") console.log("[auth/callback] Linking to existing org via link_org:", linkOrgId);
            const metadata = data.user.user_metadata || {};
            const { error: userError } = await adminClient.from("users").upsert({
              id: data.user.id,
              organization_id: linkOrgId,
              email: data.user.email!,
              first_name: metadata.first_name || metadata.full_name?.split(" ")[0] || "",
              last_name: metadata.last_name || metadata.full_name?.split(" ").slice(1).join(" ") || "",
              role: "project_manager",
              preferred_language: locale,
            } as any, { onConflict: "id" });
            if (userError) {
              console.error("[auth/callback] User upsert error:", userError.message);
            }
          } else {
            if (process.env.NODE_ENV === "development") console.warn("[auth/callback] link_org not found:", linkOrgId, "— falling through to creation");
          }

        } else if (existingUser) {
          // Check 2: Known user by auth ID — update auth provider + refresh tokens
          if (process.env.NODE_ENV === "development") console.log("[auth/callback] Existing user found, org:", existingUser.organization_id);
          const updatePayload: Record<string, unknown> = {
            auth_provider: authProvider,
            auth_provider_id: identity?.id || null,
          };

          // Ensure user_metadata has first_name/last_name (Microsoft only provides full_name)
          const metadata = data.user.user_metadata || {};
          if (!metadata.first_name || !metadata.last_name) {
            const { data: dbUser } = await adminClient
              .from("users")
              .select("first_name, last_name, phone, preferred_language")
              .eq("id", data.user.id)
              .maybeSingle();
            if (dbUser && (dbUser.first_name || dbUser.last_name)) {
              await adminClient.auth.admin.updateUserById(data.user.id, {
                user_metadata: {
                  ...metadata,
                  first_name: metadata.first_name || dbUser.first_name || "",
                  last_name: metadata.last_name || dbUser.last_name || "",
                  phone: metadata.phone || dbUser.phone || "",
                  preferred_language: metadata.preferred_language || dbUser.preferred_language || "fr",
                },
              });
            }
          }

          const providerTokenForExisting = data.session?.provider_token;
          const providerRefreshForExisting = data.session?.provider_refresh_token;
          if (providerTokenForExisting && authProvider === "microsoft") {
            let expiresIn = 3600;
            try {
              const parts = providerTokenForExisting.split(".");
              if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
                if (payload.exp && payload.iat) expiresIn = payload.exp - payload.iat;
                else if (payload.exp) expiresIn = payload.exp - Math.floor(Date.now() / 1000);
              }
            } catch { /* fallback 3600s */ }
            const expiresAt = new Date();
            expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

            updatePayload.microsoft_access_token = providerTokenForExisting;
            updatePayload.microsoft_token_expires_at = expiresAt.toISOString();
            updatePayload.outlook_sync_enabled = true;
            if (providerRefreshForExisting) {
              updatePayload.microsoft_refresh_token = providerRefreshForExisting;
            }
          }

          await adminClient
            .from("users")
            .update(updatePayload as any)
            .eq("id", data.user.id);

        } else {
          // Check 3: User with same email under different auth ID
          const { data: existingByEmail } = data.user.email
            ? await adminClient
                .from("users")
                .select("id, organization_id")
                .eq("email", data.user.email)
                .maybeSingle()
            : { data: null };

          if (existingByEmail) {
            if (process.env.NODE_ENV === "development") console.log("[auth/callback] Found existing user by email, reusing org:", existingByEmail.organization_id);
            const { data: oldUserRow } = await adminClient
              .from("users")
              .select("first_name, last_name, role, preferred_language")
              .eq("id", existingByEmail.id)
              .maybeSingle();

            await adminClient.from("users").upsert({
              id: data.user.id,
              organization_id: existingByEmail.organization_id,
              email: data.user.email!,
              first_name: oldUserRow?.first_name || data.user.user_metadata?.first_name || "",
              last_name: oldUserRow?.last_name || data.user.user_metadata?.last_name || "",
              role: oldUserRow?.role || "project_manager",
              preferred_language: oldUserRow?.preferred_language || "fr",
            } as any, { onConflict: "id" });

            if (existingByEmail.id !== data.user.id) {
              await migrateUserData(adminClient, existingByEmail.id, data.user.id);
            }

          } else {
            // Check 4: OAuth email exists as a connected email_connection
            // This handles: user signed up with email A, connected Microsoft (email B) from settings,
            // then later logs in directly with Microsoft (email B)
            const { data: existingConnection } = data.user.email
              ? await adminClient
                  .from("email_connections")
                  .select("user_id, organization_id")
                  .eq("email_address", data.user.email)
                  .eq("status", "active")
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .maybeSingle()
              : { data: null };

            if (existingConnection) {
              if (process.env.NODE_ENV === "development") console.log("[auth/callback] Found existing email_connection for this email, reusing org:", existingConnection.organization_id);

              // Get the original user's profile info
              const { data: connUser } = await adminClient
                .from("users")
                .select("first_name, last_name, role, preferred_language, organization_id")
                .eq("id", existingConnection.user_id)
                .maybeSingle();

              const targetOrgId = connUser?.organization_id || existingConnection.organization_id;

              await adminClient.from("users").upsert({
                id: data.user.id,
                organization_id: targetOrgId,
                email: data.user.email!,
                first_name: connUser?.first_name || data.user.user_metadata?.first_name || "",
                last_name: connUser?.last_name || data.user.user_metadata?.last_name || "",
                role: connUser?.role || "project_manager",
                preferred_language: connUser?.preferred_language || "fr",
              } as any, { onConflict: "id" });

              // Migrate data from old user to new auth user
              if (existingConnection.user_id !== data.user.id) {
                await migrateUserData(adminClient, existingConnection.user_id, data.user.id);
              }

            } else {
              // Check 5: Truly new user — create org + profile
              console.log("[auth/callback] First-time user, creating org + profile...");
              const metadata = data.user.user_metadata || {};
              const fullName = metadata.full_name || metadata.name || data.user.email || "";
              const nameParts = fullName.split(" ");
              const firstName = metadata.first_name || nameParts[0] || "";
              const lastName = metadata.last_name || nameParts.slice(1).join(" ") || "";

              const trialEndsAt = new Date();
              trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DURATION_DAYS);

              const { data: org, error: orgError } = await adminClient
                .from("organizations")
                .insert({
                  name: `${firstName} ${lastName}`.trim() || "My Company",
                  subscription_plan: "trial",
                  trial_ends_at: trialEndsAt.toISOString(),
                  max_users: 3,
                  max_projects: 5,
                })
                .select()
                .single();

              if (orgError) {
                console.error("[auth/callback] Org creation error:", orgError.message);
              }

              if (org) {
                const { error: userError } = await adminClient.from("users").upsert({
                  id: data.user.id,
                  organization_id: org.id,
                  email: data.user.email!,
                  first_name: firstName,
                  last_name: lastName,
                  role: "project_manager",
                  preferred_language: locale,
                  onboarding_completed: true,
                } as any, { onConflict: "id" });
                if (userError) {
                  console.error("[auth/callback] User creation error:", userError.message);
                }
                console.log("[auth/callback] Org + user created successfully, org:", org.id);
              }
            }
          }
        }
        } catch (orgResolutionErr) {
          // Org resolution failed, but session is valid — continue to redirect (never to /login)
          console.error("[auth/callback] Org resolution error (non-fatal):", orgResolutionErr);
        }

        // ────────────────────────────────────────────────────────────────
        // OAUTH TOKENS: Store provider tokens for email sync
        // ────────────────────────────────────────────────────────────────
        try {
        const providerToken = data.session.provider_token;
        const providerRefreshToken = data.session.provider_refresh_token;
        console.log("[auth/callback] Provider tokens:", {
          hasAccessToken: !!providerToken,
          hasRefreshToken: !!providerRefreshToken,
          provider: authProvider,
          sessionKeys: Object.keys(data.session),
        });

        if (providerToken) {
          // Extract real expires_in from JWT payload instead of hardcoding 3600s
          let expiresInSeconds = 3600;
          try {
            const parts = providerToken.split(".");
            if (parts.length === 3) {
              const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
              if (payload.exp && payload.iat) {
                expiresInSeconds = payload.exp - payload.iat;
              } else if (payload.exp) {
                expiresInSeconds = payload.exp - Math.floor(Date.now() / 1000);
              }
            }
          } catch {
            // Fallback to 3600s if JWT parsing fails
          }
          const tokenExpiresAt = new Date();
          tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + expiresInSeconds);

          // Store in legacy Microsoft columns (for backward compat)
          if (authProvider === "microsoft") {
            await adminClient
              .from("users")
              .update({
                microsoft_access_token: providerToken,
                microsoft_refresh_token: providerRefreshToken || null,
                microsoft_token_expires_at: tokenExpiresAt.toISOString(),
                outlook_sync_enabled: true,
              })
              .eq("id", data.user.id);
          }

          // Get user's organization
          const { data: userOrg } = await adminClient
            .from("users")
            .select("organization_id")
            .eq("id", data.user.id)
            .maybeSingle();

          // Upsert email_connection for this provider
          if (userOrg?.organization_id) {
            const scopes = authProvider === "microsoft"
              ? "openid email profile offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read"
              : authProvider === "google"
                ? "openid profile email gmail.readonly gmail.send gmail.modify"
                : null;

            // Insert new connection first, then clean up old ones
            const { data: newConn, error: connError } = await adminClient
              .from("email_connections")
              .insert({
                user_id: data.user.id,
                organization_id: userOrg.organization_id,
                provider: authProvider as "microsoft" | "google" | "imap",
                oauth_access_token: providerToken,
                oauth_refresh_token: providerRefreshToken || null,
                oauth_token_expires_at: tokenExpiresAt.toISOString(),
                oauth_scopes: scopes,
                email_address: data.user.email!,
                display_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || null,
                status: "active",
              })
              .select("id")
              .single();

            if (connError) {
              console.error("[auth/callback] Email connection insert error:", connError.message);
            } else if (newConn) {
              // Only delete old connections after successful insert
              await adminClient
                .from("email_connections")
                .delete()
                .eq("user_id", data.user.id)
                .neq("id", newConn.id);

              if (process.env.NODE_ENV === "development") console.log("[auth/callback] Email connection created for:", authProvider);
            }
          }
        }
        } catch (tokenErr) {
          // Token storage failed, but session is valid — continue to redirect
          console.error("[auth/callback] Token storage error (non-fatal):", tokenErr);
        }

        // ────────────────────────────────────────────────────────────────
        // REDIRECT: Use preferred language, redirect to target page
        // Session is valid — ALWAYS redirect to app, NEVER to login
        // ────────────────────────────────────────────────────────────────
        let userLocale = locale;
        try {
          const { data: profile } = await (adminClient as any)
            .from("users")
            .select("preferred_language, onboarding_completed")
            .eq("id", data.user.id)
            .maybeSingle();
          if (profile?.preferred_language) {
            userLocale = profile.preferred_language;
          }
        } catch {
          // Profile fetch failed — use default locale
        }

        // Default redirect: /mail (post-login destination)
        let finalNext = next === "/dashboard" ? "/mail" : next;

        // If this was an email connection flow, redirect to the integrations tab with refresh signal
        if (linkOrgId && finalNext.startsWith("/settings")) {
          finalNext = "/settings?tab=outlook&connected=email";
        }

        const redirectUrl = `${origin}/${userLocale}${finalNext}`;
        console.log("[auth/callback] Redirecting to:", redirectUrl);
        return NextResponse.redirect(redirectUrl);
      }
    } catch (err) {
      console.error("[auth/callback] Unexpected error:", err);
      // If we reach here, the session exchange itself failed — redirect to login
      return NextResponse.redirect(
        `${origin}/${locale}/login?error=callback_exception`
      );
    }
  }

  console.error("[auth/callback] No code provided, redirecting to login");
  return NextResponse.redirect(`${origin}/${locale}/login?error=auth_callback_failed`);
}
