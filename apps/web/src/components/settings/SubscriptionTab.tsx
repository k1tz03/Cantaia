"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Mail,
  Sparkles,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Gift,
} from "lucide-react";
import InvoicesList from "@/components/stripe/InvoicesList";
import { CreditBalanceCard } from "@/components/credits/CreditBalanceCard";
import { CreditPacks } from "@/components/credits/CreditPacks";
import { CreditPlans } from "@/components/credits/CreditPlans";
import { CreditHistory } from "@/components/credits/CreditHistory";
import { CreditCheckoutResume } from "@/components/credits/CreditCheckoutResume";
import { SIGNUP_BONUS_CREDITS } from "@/components/credits/credit-config";
import { useCredits } from "@/lib/hooks/use-credits";

interface OrgData {
  subscription_plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  name: string;
}

const PLAN_LABEL_KEYS: Record<string, string> = {
  starter: "planStarter",
  pro: "planPro",
  enterprise: "planEnterprise",
};

/**
 * Settings > Abonnement — credits edition.
 *
 * Sections: balance → packs → subscriptions → history/invoices.
 * `?section=packs|plans` scrolls straight to the matching block (used by the
 * paywall dialog CTAs).
 */
export function SubscriptionTab() {
  const t = useTranslations("settings");
  const tc = useTranslations("credits");
  const searchParams = useSearchParams();
  const { balance } = useCredits();

  const [org, setOrg] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  useEffect(() => {
    fetchOrg();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Deep link from the paywall: ?section=packs | ?section=plans
  const section = searchParams.get("section");
  useEffect(() => {
    if (loading || !section) return;
    const id = section === "plans" ? "credits-plans" : "credits-packs";
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, section]);

  async function fetchOrg() {
    try {
      // Dedicated billing snapshot: GET /api/organization/branding did NOT even
      // select the Stripe columns (so stripe_subscription_id was always
      // undefined and the portal/cancel buttons never showed). This route
      // returns exactly the billing fields under a stable `organization` key.
      const res = await fetch("/api/stripe/subscription-status");
      if (!res.ok) {
        console.error("Failed to fetch subscription status:", res.status);
        return;
      }
      const data = await res.json();
      setOrg({
        subscription_plan: data?.organization?.subscription_plan || "trial",
        stripe_customer_id: data?.organization?.stripe_customer_id || null,
        stripe_subscription_id: data?.organization?.stripe_subscription_id || null,
        trial_ends_at: data?.organization?.trial_ends_at || null,
        name: data?.organization?.name || "",
      });
    } catch (err) {
      console.error("Failed to fetch org:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelSubscription() {
    setCancelling(true);
    try {
      const res = await fetch("/api/stripe/cancel-subscription", { method: "POST" });
      if (res.ok) {
        setToast({ type: "success", text: tc("cancelSuccess") });
        setShowCancelConfirm(false);
        fetchOrg();
      } else {
        setToast({ type: "error", text: tc("cancelError") });
      }
    } catch {
      setToast({ type: "error", text: tc("cancelError") });
    } finally {
      setCancelling(false);
    }
  }

  async function handleManagePayment() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/create-portal-session", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setToast({ type: "error", text: tc("checkoutError") });
    } catch {
      setToast({ type: "error", text: tc("checkoutError") });
    } finally {
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" />
      </div>
    );
  }

  // `plan` from the org row stays authoritative for the "current plan" chip;
  // GET /api/credits also returns it once the org is on the credits model.
  const plan = balance?.plan || org?.subscription_plan || "trial";
  const planKey = PLAN_LABEL_KEYS[plan.toLowerCase()];
  const planLabel = planKey ? tc(planKey) : tc("noPlan");
  const hasSubscription = !!org?.stripe_subscription_id;
  const showSignupBonusHint =
    !hasSubscription &&
    balance !== null &&
    balance.subscription_credits === 0 &&
    balance.purchased_credits <= SIGNUP_BONUS_CREDITS;

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            toast.type === "success"
              ? "border border-[#10B981]/20 bg-[#10B981]/10 text-[#10B981]"
              : "border border-[#EF4444]/20 bg-[#EF4444]/10 text-[#EF4444]"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Post-checkout banner + "Reprendre" back to the interrupted page */}
      <CreditCheckoutResume />

      {/* (a) Balance */}
      <section>
        <h3 className="mb-3 font-display text-[15px] font-bold text-[#FAFAFA]">
          {tc("balance")}
        </h3>
        <CreditBalanceCard />

        {showSignupBonusHint && (
          <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-[#F97316]/25 bg-[#F97316]/5 px-4 py-3 text-[11px] text-[#A1A1AA]">
            <Gift className="h-4 w-4 shrink-0 text-[#F97316]" />
            {tc("signupBonus", { count: SIGNUP_BONUS_CREDITS })}
          </div>
        )}

        {/* Current plan strip + Stripe portal / cancel (unchanged behaviour) */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#27272A] bg-[#0F0F11] px-5 py-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-[#F97316]" />
            <div>
              <div className="text-sm font-semibold text-[#FAFAFA]">
                {tc("currentPlan")} : {planLabel}
              </div>
              {balance && balance.monthly_allocation > 0 && (
                <div className="text-xs text-[#A1A1AA]">
                  {tc("creditsPerMonth", { credits: balance.monthly_allocation })}
                </div>
              )}
            </div>
          </div>

          {hasSubscription && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleManagePayment}
                disabled={portalLoading}
                className="flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-xs text-[#A1A1AA] hover:bg-[#27272A] disabled:opacity-50"
              >
                {portalLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ExternalLink className="h-3 w-3" />
                )}
                {tc("paymentMethod")}
              </button>
              <button
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                className="rounded-md border border-[#27272A] px-3 py-1.5 text-xs text-[#A1A1AA] hover:border-[#EF4444]/20 hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
              >
                {tc("cancelPlan")}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* (b) One-shot credit packs */}
      <CreditPacks />

      {/* (c) Subscriptions */}
      <CreditPlans currentPlan={plan} />

      {/* (d) History + invoices */}
      <CreditHistory />

      <section>
        <h3 className="mb-3 font-display text-[15px] font-bold text-[#FAFAFA]">
          {tc("invoicesTitle")}
        </h3>
        <InvoicesList />
      </section>

      {/* Support line */}
      <div className="flex items-center gap-2 rounded-[10px] border border-[#27272A] bg-[#18181B] px-4 py-3">
        <Mail className="h-4 w-4 text-[#A1A1AA]" />
        <p className="text-[11px] text-[#A1A1AA]">
          {t("needHelp")} &mdash;{" "}
          <span className="font-medium text-[#F97316]">support@cantaia.io</span>
        </p>
      </div>

      {/* Cancel confirmation modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-lg border border-[#27272A] bg-[#18181B] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#FAFAFA]">
              <AlertTriangle className="mr-2 inline h-5 w-5 text-[#EF4444]" />
              {tc("cancelConfirmTitle")}
            </h3>
            <p className="mt-2 text-sm text-[#A1A1AA]">{tc("cancelConfirmText")}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCancelConfirm(false)}
                className="rounded-md px-4 py-2 text-sm text-[#A1A1AA] hover:bg-[#27272A]"
              >
                {tc("back")}
              </button>
              <button
                type="button"
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="flex items-center gap-1.5 rounded-md bg-[#EF4444] px-4 py-2 text-sm font-medium text-white hover:bg-[#DC2626] disabled:opacity-50"
              >
                {cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
                {tc("cancelConfirmCta")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
