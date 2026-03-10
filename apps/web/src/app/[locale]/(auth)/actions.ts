"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { TRIAL_DURATION_DAYS } from "@cantaia/config/constants";

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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const scopes = "openid email profile offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read";

  // When linking from Settings/Onboarding, use linkIdentity to attach Azure
  // to the CURRENT user (prevents creating a second auth user with a different ID)
  if (options?.linkToOrg) {
    // Get current user ID so the callback knows who initiated the connection
    // (critical when OAuth email differs from login email)
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const linkUserId = currentUser?.id || "";
    const callbackUrl = `${appUrl}/api/auth/callback?link_org=${options.linkToOrg}&link_user=${linkUserId}&next=${options.next || "/settings"}`;

    const { data, error } = await supabase.auth.linkIdentity({
      provider: "azure",
      options: {
        scopes,
        redirectTo: callbackUrl,
      },
    });

    if (error) {
      // Fallback to signInWithOAuth if linking fails (e.g. identity already exists elsewhere)
      console.warn("[auth] linkIdentity failed, falling back to signInWithOAuth:", error.message);
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const scopes = "openid profile email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify";

  // When linking from Settings, use linkIdentity to attach Google to the CURRENT user
  if (options?.linkToOrg) {
    // Pass current user ID so the callback can save tokens under the correct user
    // even when the OAuth email differs from the login email
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const linkUserId = currentUser?.id || "";
    const callbackUrl = `${appUrl}/api/auth/callback?link_org=${options.linkToOrg}&link_user=${linkUserId}&next=${options.next || "/settings"}`;

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
