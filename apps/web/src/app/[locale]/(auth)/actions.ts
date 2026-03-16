"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { TRIAL_DURATION_DAYS } from "@cantaia/config/constants";

/**
 * Get the app URL from the current request headers (works on any domain).
 * Falls back to NEXT_PUBLIC_APP_URL or localhost.
 */
async function getAppUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") || "https";
      return `${proto}://${host}`;
    }
  } catch {
    // headers() not available in some contexts
  }
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

interface AuthResult {
  error?: string;
  success?: boolean;
  redirectTo?: string;
}

export async function loginAction(formData: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.email,
    password: formData.password,
  });

  if (error) {
    return { error: error.message };
  }

  const locale = await getLocale();

  // Check onboarding status
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const adminClient = createAdminClient();
    const { data: profile } = await (adminClient as any)
      .from("users")
      .select("onboarding_completed")
      .eq("id", user.id)
      .maybeSingle();
    if (profile && (profile as any).onboarding_completed === false) {
      return { success: true, redirectTo: `/${locale}/onboarding` };
    }
  }

  return { success: true, redirectTo: `/${locale}/dashboard` };
}

export async function registerAction(formData: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  company_name: string;
  role: "project_manager" | "site_manager" | "foreman";
}): Promise<AuthResult> {
  const supabase = await createClient();
  const locale = await getLocale();

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: formData.email,
    password: formData.password,
    options: {
      data: {
        first_name: formData.first_name,
        last_name: formData.last_name,
      },
    },
  });

  if (authError) {
    return { error: authError.message };
  }

  if (authData.user) {
    const adminClient = createAdminClient();

    // Create organization
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DURATION_DAYS);

    const { data: org, error: orgError } = await adminClient
      .from("organizations")
      .insert({
        name: formData.company_name,
        subscription_plan: "trial",
        trial_ends_at: trialEndsAt.toISOString(),
        max_users: 3,
        max_projects: 5,
      })
      .select()
      .single();

    if (orgError) {
      return { error: orgError.message };
    }

    // Create user row (upsert to handle race conditions with auth callback)
    const { error: userError } = await adminClient.from("users").upsert({
      id: authData.user.id,
      organization_id: org.id,
      email: formData.email,
      first_name: formData.first_name,
      last_name: formData.last_name,
      role: formData.role,
      preferred_language: locale as "fr" | "en" | "de",
    }, { onConflict: "id" });

    if (userError) {
      return { error: userError.message };
    }
  }

  return { success: true };
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const locale = await getLocale();
  redirect({ href: "/", locale });
}

export async function forgotPasswordAction(formData: {
  email: string;
}): Promise<AuthResult> {
  const supabase = await createClient();
  const appUrl = await getAppUrl();
  const locale = await getLocale();

  await supabase.auth.resetPasswordForEmail(formData.email, {
    redirectTo: `${appUrl}/${locale}/reset-password`,
  });

  // Always return success to prevent email enumeration
  return { success: true };
}

export async function signInWithMicrosoftAction(options?: {
  linkToOrg?: string;
  next?: string;
}): Promise<{
  url?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const appUrl = await getAppUrl();

  const scopes = "openid email profile offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read";

  // When linking from Settings/Onboarding, use linkIdentity to attach Azure
  // to the CURRENT user (prevents creating a second auth user with a different ID)
  if (options?.linkToOrg) {
    // Get current user ID so the callback knows who initiated the connection
    // (critical when OAuth email differs from login email)
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const linkUserId = currentUser?.id || "";
    const callbackUrl = `${appUrl}/api/auth/callback?link_org=${options.linkToOrg}&link_user=${linkUserId}&next=${options.next || "/settings"}`;

    // If the user already has Azure identity linked (e.g., they logged in with Microsoft),
    // skip linkIdentity and go straight to signInWithOAuth. linkIdentity for an already-
    // linked identity can fail or not return provider_token properly. signInWithOAuth is
    // safe here because the same Azure identity maps to the same auth user (no split).
    const hasAzureIdentity = currentUser?.identities?.some(i => i.provider === "azure");

    if (hasAzureIdentity) {
      console.log("[auth] Azure identity already linked, using signInWithOAuth directly");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: { scopes, redirectTo: callbackUrl },
      });
      if (error) return { error: error.message };
      return { url: data.url };
    }

    // Azure not linked yet — use linkIdentity to attach it to the current user
    const { data, error } = await supabase.auth.linkIdentity({
      provider: "azure",
      options: {
        scopes,
        redirectTo: callbackUrl,
      },
    });

    if (error) {
      // linkIdentity failed — likely because the Azure identity already belongs to another auth user.
      // Try to find and delete the orphan auth user, then retry linkIdentity.
      console.warn("[auth] linkIdentity failed:", error.message, "— attempting orphan cleanup");

      try {
        const adminClient = createAdminClient();

        // Find the orphan auth user that owns the Azure identity
        const { data: authUserList } = await adminClient.auth.admin.listUsers({ perPage: 500 });
        const orphanAzureUser = authUserList?.users?.find(u =>
          u.id !== linkUserId &&
          u.identities?.some(i => i.provider === "azure")
        );

        if (orphanAzureUser) {
          console.log("[auth] Found orphan Azure auth user:", orphanAzureUser.id, orphanAzureUser.email);

          // Migrate ALL FK references from orphan to current user before deletion.
          // Each table wrapped in try/catch (table may not exist or row may not exist).
          const fkMigrations: Array<{ table: string; column: string }> = [
            { table: "project_members", column: "user_id" },
            { table: "tasks", column: "assigned_to" },
            { table: "tasks", column: "created_by" },
            { table: "email_records", column: "user_id" },
            { table: "meetings", column: "created_by" },
            { table: "email_connections", column: "user_id" },
            { table: "plan_registry", column: "created_by" },
            { table: "plan_analyses", column: "analyzed_by" },
            { table: "plan_estimates", column: "estimated_by" },
            { table: "suppliers", column: "created_by" },
            { table: "daily_briefings", column: "user_id" },
            { table: "client_visits", column: "created_by" },
            { table: "visit_photos", column: "created_by" },
          ];
          for (const { table, column } of fkMigrations) {
            try {
              await (adminClient as any).from(table).update({ [column]: linkUserId }).eq(column, orphanAzureUser.id);
            } catch { /* table may not exist */ }
          }
          // Delete non-critical references (logs) instead of migrating
          for (const logTable of ["app_logs", "admin_activity_logs", "api_usage_logs"]) {
            try {
              await (adminClient as any).from(logTable).delete().eq("user_id", orphanAzureUser.id);
            } catch { /* table may not exist */ }
          }

          // Now delete the orphan user row + auth user
          try { await adminClient.from("users").delete().eq("id", orphanAzureUser.id); } catch { /* may already be gone */ }
          await adminClient.auth.admin.deleteUser(orphanAzureUser.id);
          console.log("[auth] Orphan Azure auth user deleted, retrying linkIdentity");

          // Retry linkIdentity — should succeed now that the identity is freed
          const retry = await supabase.auth.linkIdentity({
            provider: "azure",
            options: { scopes, redirectTo: callbackUrl },
          });

          if (!retry.error && retry.data?.url) {
            return { url: retry.data.url };
          }
          console.warn("[auth] linkIdentity retry also failed:", retry.error?.message);
        }
      } catch (cleanupErr) {
        console.warn("[auth] Orphan cleanup failed:", cleanupErr);
      }

      // Final fallback: signInWithOAuth (will create split identity, handled by callback)
      console.warn("[auth] Falling back to signInWithOAuth");
      const fallback = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: { scopes, redirectTo: callbackUrl },
      });
      if (fallback.error) return { error: fallback.error.message };
      return { url: fallback.data.url };
    }

    return { url: data.url };
  }

  // Login page: full OAuth sign-in (creates or reuses Azure auth user)
  const callbackUrl = `${appUrl}/api/auth/callback`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: { scopes, redirectTo: callbackUrl },
  });

  if (error) {
    return { error: error.message };
  }

  return { url: data.url };
}

export async function signInWithGoogleAction(options?: {
  linkToOrg?: string;
  next?: string;
}): Promise<{
  url?: string;
  error?: string;
}> {
  const supabase = await createClient();
  const appUrl = await getAppUrl();

  const scopes = "openid profile email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify";

  // When linking from Settings, use linkIdentity to attach Google to the CURRENT user
  if (options?.linkToOrg) {
    // Pass current user ID so the callback can save tokens under the correct user
    // even when the OAuth email differs from the login email
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const linkUserId = currentUser?.id || "";
    const callbackUrl = `${appUrl}/api/auth/callback?link_org=${options.linkToOrg}&link_user=${linkUserId}&next=${options.next || "/settings"}`;

    // If user already has Google identity linked, skip linkIdentity and go straight
    // to signInWithOAuth. Same logic as Azure — avoids linkIdentity issues.
    const hasGoogleIdentity = currentUser?.identities?.some(i => i.provider === "google");

    if (hasGoogleIdentity) {
      console.log("[auth] Google identity already linked, using signInWithOAuth directly");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes,
          redirectTo: callbackUrl,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (error) return { error: error.message };
      return { url: data.url };
    }

    const { data, error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: {
        scopes,
        redirectTo: callbackUrl,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });

    if (error) {
      console.warn("[auth] linkIdentity failed, falling back to signInWithOAuth:", error.message);
      const fallback = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          scopes,
          redirectTo: callbackUrl,
          queryParams: { access_type: "offline", prompt: "consent" },
        },
      });
      if (fallback.error) return { error: fallback.error.message };
      return { url: fallback.data.url };
    }

    return { url: data.url };
  }

  // Login page: full OAuth sign-in
  const callbackUrl = `${appUrl}/api/auth/callback`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes,
      redirectTo: callbackUrl,
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { url: data.url };
}
