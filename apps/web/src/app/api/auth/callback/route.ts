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
  const next = searchParams.get("next") ?? "/dashboard";
  // link_org is set when connecting email from Settings (preserves current org)
  const linkOrgId = searchParams.get("link_org");

  if (process.env.NODE_ENV === "development") console.log("[auth/callback] Received callback:", {
    hasCode: !!code,
    error: errorParam,
    errorDesc,
    origin,
    next,
    linkOrgId,
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
        if (process.env.NODE_ENV === "development") console.log("[auth/callback] Session established for:", data.user.email);
        const adminClient = createAdminClient();

        // Determine auth provider from Supabase identity
        const identity = data.user.identities?.[0];
        const authProvider = identity?.provider === "azure"
          ? "microsoft"
          : identity?.provider === "google"
            ? "google"
            : "email";

        if (process.env.NODE_ENV === "development") console.log("[auth/callback] Auth provider:", authProvider);

        // ────────────────────────────────────────────────────────────────
        // ORGANIZATION RESOLUTION: Find the right org for this user
        // Priority:
        //   1. Existing user row with same auth ID → reuse org
        //   2. link_org parameter (from Settings connection flow) → reuse specified org
        //   3. Existing user row with same email → reuse org + migrate data
        //   4. email_connections with same email → reuse org (user connecting with provider email)
        //   5. Create new org (truly first-time user)
        // ────────────────────────────────────────────────────────────────

        // Check 1: User exists by auth ID
        const { data: existingUser } = await adminClient
          .from("users")
          .select("id, organization_id")
          .eq("id", data.user.id)
          .maybeSingle();

        if (existingUser) {
          // Known user, just update auth provider columns
          if (process.env.NODE_ENV === "development") console.log("[auth/callback] Existing user found, org:", existingUser.organization_id);
          await adminClient
            .from("users")
            .update({ auth_provider: authProvider, auth_provider_id: identity?.id || null } as any)
            .eq("id", data.user.id);

        } else if (linkOrgId) {
          // Check 2: Settings flow — user connected email from within the app
          // Validate the org exists
          const { data: linkedOrg } = await adminClient
            .from("organizations")
            .select("id")
            .eq("id", linkOrgId)
            .maybeSingle();

          if (linkedOrg) {
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
              if (process.env.NODE_ENV === "development") console.log("[auth/callback] First-time user, creating org + profile...");
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
                } as any, { onConflict: "id" });
                if (userError) {
                  console.error("[auth/callback] User creation error:", userError.message);
                }
              }
            }
          }
        }

        // ────────────────────────────────────────────────────────────────
        // OAUTH TOKENS: Store provider tokens for email sync
        // ────────────────────────────────────────────────────────────────
        const providerToken = data.session.provider_token;
        const providerRefreshToken = data.session.provider_refresh_token;
        if (process.env.NODE_ENV === "development") console.log("[auth/callback] Provider tokens:", {
          hasAccessToken: !!providerToken,
          hasRefreshToken: !!providerRefreshToken,
          provider: authProvider,
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

        // ────────────────────────────────────────────────────────────────
        // REDIRECT: Use preferred language, redirect to target page
        // ────────────────────────────────────────────────────────────────
        let userLocale = locale;
        const { data: profile } = await adminClient
          .from("users")
          .select("preferred_language")
          .eq("id", data.user.id)
          .maybeSingle();
        if (profile?.preferred_language) {
          userLocale = profile.preferred_language;
        }

        const redirectUrl = `${origin}/${userLocale}${next}`;
        if (process.env.NODE_ENV === "development") console.log("[auth/callback] Redirecting to:", redirectUrl);
        return NextResponse.redirect(redirectUrl);
      }
    } catch (err) {
      console.error("[auth/callback] Unexpected error:", err);
      return NextResponse.redirect(
        `${origin}/${locale}/login?error=callback_exception`
      );
    }
  }

  console.error("[auth/callback] No code provided, redirecting to login");
  return NextResponse.redirect(`${origin}/${locale}/login?error=auth_callback_failed`);
}
