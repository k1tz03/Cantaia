import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { TRIAL_DURATION_DAYS } from "@cantaia/config/constants";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");
  const errorDesc = searchParams.get("error_description");
  const next = searchParams.get("next") ?? "/submissions";

  console.log("[auth/callback] Received callback:", {
    hasCode: !!code,
    error: errorParam,
    errorDesc,
    origin,
    next,
  });

  // Default locale for redirects
  const locale = "fr";

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
      console.log("[auth/callback] Exchanging code for session...");
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("[auth/callback] Exchange error:", error.message);
        return NextResponse.redirect(
          `${origin}/${locale}/login?error=${encodeURIComponent(error.message)}`
        );
      }

      if (data.user && data.session) {
        console.log("[auth/callback] Session established for:", data.user.email);
        const adminClient = createAdminClient();

        // Determine auth provider from Supabase identity
        const identity = data.user.identities?.[0];
        const authProvider = identity?.provider === "azure"
          ? "microsoft"
          : identity?.provider === "google"
            ? "google"
            : "email";

        console.log("[auth/callback] Auth provider:", authProvider);

        // Check if user row already exists
        const { data: existingUser } = await adminClient
          .from("users")
          .select("id")
          .eq("id", data.user.id)
          .maybeSingle();

        if (!existingUser) {
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
              preferred_language: "fr",
            } as any, { onConflict: "id" });
            if (userError) {
              console.error("[auth/callback] User creation error:", userError.message);
            }
          }
        } else {
          // Try updating auth_provider columns (may not exist if migration 018 not applied)
          const { error: updateErr } = await adminClient
            .from("users")
            .update({ auth_provider: authProvider, auth_provider_id: identity?.id || null } as any)
            .eq("id", data.user.id);
          if (updateErr) {
            console.warn("[auth/callback] Could not update auth_provider:", updateErr.message);
          }
        }

        // Store OAuth tokens based on provider
        const providerToken = data.session.provider_token;
        const providerRefreshToken = data.session.provider_refresh_token;
        console.log("[auth/callback] Provider tokens:", {
          hasAccessToken: !!providerToken,
          hasRefreshToken: !!providerRefreshToken,
          provider: authProvider,
        });

        if (providerToken) {
          const tokenExpiresAt = new Date();
          tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + 3600);

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

              console.log("[auth/callback] Email connection created for:", authProvider);
            }
          }
        }

        // Use preferred language from user profile if available
        let userLocale = locale;
        if (existingUser) {
          const { data: profile } = await adminClient
            .from("users")
            .select("preferred_language")
            .eq("id", data.user.id)
            .maybeSingle();
          if (profile?.preferred_language) {
            userLocale = profile.preferred_language;
          }
        }

        const redirectUrl = `${origin}/${userLocale}${next}`;
        console.log("[auth/callback] Redirecting to:", redirectUrl);
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
