"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { TRIAL_DURATION_DAYS } from "@cantaia/config/constants";
import { rateLimit } from "@/lib/rate-limit";

/** Roles a user may self-assign when creating a brand-new org (registerSchema). */
const SELF_SIGNUP_ROLES = ["project_manager", "site_manager", "foreman"] as const;

/** Best-effort client IP from the standard proxy headers (for auth throttling). */
async function getClientIp(): Promise<string> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
    return h.get("x-real-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

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
  const ip = await getClientIp();
  const rl = await rateLimit(`auth:ip:${ip}`, { limit: 15, windowSec: 900 });
  if (!rl.allowed) {
    return { error: "Trop de tentatives. Réessayez dans quelques minutes." };
  }

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

  // Single post-login destination across every entry point (password
  // login, OAuth callback, end of onboarding): /mail.
  return { success: true, redirectTo: `/${locale}/mail` };
}

export async function registerAction(formData: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  company_name: string;
  role: "project_manager" | "site_manager" | "foreman";
  invite_token?: string;
}): Promise<AuthResult> {
  const ip = await getClientIp();
  const rl = await rateLimit(`auth:ip:${ip}`, { limit: 15, windowSec: 900 });
  if (!rl.allowed) {
    return { error: "Trop de tentatives. Réessayez dans quelques minutes." };
  }

  const supabase = await createClient();
  const locale = await getLocale();
  const adminClient = createAdminClient();

  // registerAction is a directly-callable HTTP endpoint: the TS `role` type is
  // erased at runtime, so validate it server-side. Only the three self-signup
  // roles may be self-assigned; anything else falls back to project_manager.
  const safeSignupRole = (SELF_SIGNUP_ROLES as readonly string[]).includes(formData.role)
    ? formData.role
    : "project_manager";

  // If invite_token is provided, validate it before creating the auth user
  let validInvite: {
    id: string;
    organization_id: string;
    role: string;
    first_name?: string;
    last_name?: string;
  } | null = null;

  if (formData.invite_token) {
    const { data: invite } = await (adminClient as any)
      .from("organization_invites")
      .select("id, organization_id, role, first_name, last_name, status, expires_at")
      .eq("token", formData.invite_token)
      .eq("status", "pending")
      .maybeSingle();

    if (invite && new Date(invite.expires_at) > new Date()) {
      validInvite = invite;
    }
    // If invite is invalid/expired, proceed with normal registration (create new org)
  }

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
    if (validInvite) {
      // Invite flow: join existing organization, do NOT create a new org.
      // The role is ALWAYS the one baked into the server-side invite record
      // (created by an org admin through the guarded invite API) — never the
      // client-supplied formData.role, which would allow privilege escalation.
      // validInvite.role is a server-trusted ASSIGNABLE_ROLE string (may be
      // 'member'/'director'/'admin'); users.role is a free-text column, so cast
      // through the untyped client like the rest of the repo does.
      const inviteRole = validInvite.role;

      const { error: userError } = await (adminClient as any).from("users").upsert({
        id: authData.user.id,
        organization_id: validInvite.organization_id,
        email: formData.email,
        first_name: validInvite.first_name || formData.first_name,
        last_name: validInvite.last_name || formData.last_name,
        role: inviteRole,
        preferred_language: locale as "fr" | "en" | "de",
        onboarding_completed: true, // Invited users skip onboarding
      }, { onConflict: "id" });

      if (userError) {
        return { error: userError.message };
      }

      // Mark invite as accepted
      await (adminClient as any)
        .from("organization_invites")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
        })
        .eq("id", validInvite.id);
    } else {
      // Normal flow: create a new organization
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
        role: safeSignupRole,
        preferred_language: locale as "fr" | "en" | "de",
      }, { onConflict: "id" });

      if (userError) {
        return { error: userError.message };
      }
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
  const ip = await getClientIp();
  const rl = await rateLimit(`auth:ip:${ip}`, { limit: 15, windowSec: 900 });
  if (!rl.allowed) {
    // Still return success shape (no enumeration) but skip the send.
    return { success: true };
  }

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

  // TWO-PHASE PERMISSIONS:
  // - Login: minimal scopes that NEVER require admin consent → users can sign up immediately
  // - Email integration (Settings): full scopes with Mail.* → may require admin consent
  const LOGIN_SCOPES = "openid email profile User.Read";
  const EMAIL_SCOPES = "openid email profile offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read";

  // When linking from Settings/Onboarding, use linkIdentity to attach Azure
  // to the CURRENT user (prevents creating a second auth user with a different ID)
  // → Use FULL scopes (email integration flow)
  if (options?.linkToOrg) {
    const scopes = EMAIL_SCOPES;
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
      // linkIdentity failed. This can happen for benign, GLOBAL reasons (manual
      // linking disabled in Supabase, the Azure identity already attached to
      // another account, etc.). We must NEVER react by enumerating auth users and
      // deleting a stranger's Azure account — the previous heuristic picked "the
      // first other user with an azure identity" and deleted it, which could wipe
      // an arbitrary tenant's account and migrate its data to the caller.
      //
      // Safe path: fall back to signInWithOAuth. If a split identity results, the
      // callback's split-identity handler reconciles both users non-destructively.
      console.warn("[auth] linkIdentity failed:", error.message, "— falling back to signInWithOAuth (no destructive cleanup)");
      const fallback = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: { scopes, redirectTo: callbackUrl },
      });
      if (fallback.error) return { error: fallback.error.message };
      return { url: fallback.data.url };
    }

    return { url: data.url };
  }

  // Login page: minimal scopes (NO Mail.*) → never triggers admin consent
  const callbackUrl = `${appUrl}/api/auth/callback`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: { scopes: LOGIN_SCOPES, redirectTo: callbackUrl },
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

  // TWO-PHASE PERMISSIONS (same pattern as Microsoft):
  // - Login: minimal scopes → no special consent needed
  // - Email integration (Settings): full Gmail scopes
  const GOOGLE_LOGIN_SCOPES = "openid profile email";
  const GOOGLE_EMAIL_SCOPES = "openid profile email https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify";

  // When linking from Settings, use linkIdentity to attach Google to the CURRENT user
  // → Use FULL scopes (email integration flow)
  if (options?.linkToOrg) {
    const scopes = GOOGLE_EMAIL_SCOPES;
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

  // Login page: minimal scopes (NO Gmail API) → standard Google consent only
  const callbackUrl = `${appUrl}/api/auth/callback`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: GOOGLE_LOGIN_SCOPES,
      redirectTo: callbackUrl,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { url: data.url };
}
