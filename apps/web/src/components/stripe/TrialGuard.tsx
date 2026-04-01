"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { UsageLimitBanner } from "./UsageLimitBanner";
import { createClient } from "@/lib/supabase/client";
import { Clock, ArrowRight } from "lucide-react";
import Link from "next/link";

/**
 * AI call limits per subscription plan (monthly).
 * -1 means unlimited.
 */
const AI_CALL_LIMITS: Record<string, number> = {
  trial: 50,
  starter: 500,
  pro: 2000,
  enterprise: -1,
};

interface OrgData {
  id: string;
  subscription_plan: string;
  trial_ends_at: string | null;
}

/**
 * TrialGuard — client component that:
 * 1. Checks if the org's trial has expired and shows a blocking overlay
 * 2. Fetches monthly AI usage and shows a warning banner at 80%+ usage
 *
 * Mounted inside the app layout, within AuthProvider.
 */
export function TrialGuard() {
  const { user, loading: authLoading } = useAuth();
  const [orgData, setOrgData] = useState<OrgData | null>(null);
  const [aiCallsThisMonth, setAiCallsThisMonth] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (authLoading || !user || fetched.current) return;
    fetched.current = true;

    const supabase = createClient();

    // 1. Get user profile to find organization_id
    async function fetchData() {
      try {
        // Cast to any to avoid type issues with Supabase generated types
        // that may not include all columns (see CLAUDE.md: @supabase/ssr v0.5.2 type bug)
        const { data: profile } = await (supabase as any)
          .from("users")
          .select("organization_id")
          .eq("id", user!.id)
          .maybeSingle();

        if (!profile?.organization_id) {
          setLoaded(true);
          return;
        }

        const orgId = profile.organization_id as string;

        // 2. Fetch organization data (subscription_plan, trial_ends_at)
        const { data: org } = await (supabase as any)
          .from("organizations")
          .select("id, subscription_plan, trial_ends_at")
          .eq("id", orgId)
          .maybeSingle();

        if (org) {
          setOrgData({
            id: org.id,
            subscription_plan: org.subscription_plan || "trial",
            trial_ends_at: org.trial_ends_at || null,
          });
        }

        // 3. Count AI calls this month for the org
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

        try {
          const { count } = await (supabase as any)
            .from("api_usage_logs")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .gte("created_at", monthStart);

          setAiCallsThisMonth(count || 0);
        } catch {
          // Table may not exist yet (migrations not applied) - ignore
        }
      } catch {
        // Silently fail - guard should never block the app on fetch errors
      } finally {
        setLoaded(true);
      }
    }

    fetchData();
  }, [authLoading, user]);

  if (!loaded || !orgData) return null;

  const plan = orgData.subscription_plan;
  const isTrialExpired =
    plan === "trial" &&
    orgData.trial_ends_at &&
    new Date(orgData.trial_ends_at) < new Date();

  const aiLimit = AI_CALL_LIMITS[plan] ?? AI_CALL_LIMITS.trial;

  // Trial expired overlay — blocking, full-screen
  if (isTrialExpired) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0F0F11] flex items-center justify-center">
        <div className="max-w-2xl text-center p-8">
          <div className="mx-auto mb-6 w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
            <Clock className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-bold mb-4 text-[#FAFAFA]">
            Votre essai gratuit est termin&eacute;
          </h1>
          <p className="text-[#71717A] mb-8 text-lg">
            Choisissez un plan pour continuer &agrave; utiliser Cantaia et
            acc&eacute;der &agrave; tous vos projets.
          </p>
          <Link
            href="/admin?tab=subscription"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            Voir les plans
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-6 text-sm text-[#71717A]">
            Vos donn&eacute;es sont conserv&eacute;es et seront accessibles
            d&egrave;s l&apos;activation d&apos;un plan.
          </p>
        </div>
      </div>
    );
  }

  // Usage limit banner — shown at 80%+ AI usage
  if (aiLimit > 0) {
    return (
      <UsageLimitBanner
        current={aiCallsThisMonth}
        limit={aiLimit}
        plan={plan}
      />
    );
  }

  return null;
}
