"use client";

import { useState, useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowRight,
  Coins,
  CreditCard,
  Loader2,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { formatNumber } from "@/lib/format";
import PlanSelector from "@/components/stripe/PlanSelector";
import InvoicesList from "@/components/stripe/InvoicesList";
import { CreditBalanceCard } from "@/components/credits/CreditBalanceCard";
import { Link } from "@/i18n/navigation";
import { CREDIT_PLANS, isCreditPlanId } from "@cantaia/config/credit-costs";

const PLAN_LABELS: Record<string, string> = {
  trial: "Essai gratuit",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

/**
 * Flat price per ORGANIZATION per month + the monthly credit allocation, both
 * read from the single pricing source (`CREDIT_PLANS`). Cantaia does not bill
 * per user — never reintroduce a "CHF/utilisateur" figure here.
 */
function planPricing(plan: string): { priceCHF: number; credits: number } | null {
  if (!isCreditPlanId(plan)) return null;
  const config = CREDIT_PLANS[plan];
  return { priceCHF: config.price_chf, credits: config.monthly_credits };
}

interface OrgData {
  subscription_plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  name: string;
}

export default function AdminSubscriptionTab() {
  const t = useTranslations("admin");
  const tc = useTranslations("credits");
  const locale = useLocale();
  const [org, setOrg] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPlanSelector, setShowPlanSelector] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    fetchOrg();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function fetchOrg() {
    try {
      // Dedicated billing snapshot: the branding route did NOT return the
      // Stripe columns (so hasSubscription was always false and the payment/
      // cancel controls never showed). This route returns them under
      // `organization`.
      const res = await fetch("/api/stripe/subscription-status");
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = await res.json();
      const o = data?.organization;
      if (!o) {
        setLoading(false);
        return;
      }

      setOrg({
        subscription_plan: o.subscription_plan || "trial",
        stripe_customer_id: o.stripe_customer_id || null,
        stripe_subscription_id: o.stripe_subscription_id || null,
        trial_ends_at: o.trial_ends_at || null,
        name: o.name || "",
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
      const res = await fetch("/api/stripe/cancel-subscription", {
        method: "POST",
      });
      if (res.ok) {
        setToast({
          type: "success",
          text: "Abonnement annule en fin de periode.",
        });
        setShowCancelConfirm(false);
        fetchOrg();
      } else {
        setToast({ type: "error", text: "Erreur lors de l'annulation." });
      }
    } catch {
      setToast({ type: "error", text: "Erreur lors de l'annulation." });
    } finally {
      setCancelling(false);
    }
  }

  async function handleManagePayment() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/create-portal-session", {
        method: "POST",
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setToast({ type: "error", text: "Erreur. Reessayez." });
    } finally {
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const plan = org?.subscription_plan || "trial";
  const planLabel = PLAN_LABELS[plan] || plan;
  const pricing = planPricing(plan);
  const hasSubscription = !!org?.stripe_subscription_id;
  const isTrial = plan === "trial";

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            toast.type === "success"
              ? "border border-green-200 bg-green-500/10 text-green-700 dark:text-green-400"
              : "border border-red-200 bg-red-500/10 text-red-700 dark:text-red-400"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Org credit balance — read-only summary, actions live in Settings */}
      <section>
        <h2 className="mb-3 font-display text-[15px] font-bold text-[#FAFAFA]">
          {tc("adminOrgTitle")}
        </h2>
        <CreditBalanceCard
          footer={
            <Link
              href="/settings?tab=subscription"
              className="inline-flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-[11px] text-[#FAFAFA] transition-colors hover:bg-[#27272A]"
            >
              {tc("adminOrgCta")}
              <ArrowRight className="h-3 w-3" />
            </Link>
          }
        />
      </section>

      {/* Current Plan Card */}
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[#FAFAFA]">
              <CreditCard className="h-5 w-5 text-[#F97316]" />
              {t("currentPlan")}
            </h2>
            <div className="mt-3">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                  isTrial
                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : plan === "pro"
                      ? "bg-[#F97316]/10 text-[#F97316]"
                      : plan === "enterprise"
                        ? "bg-purple-500/10 text-purple-700 dark:text-purple-400"
                        : "bg-[#27272A] text-[#FAFAFA]"
                }`}
              >
                {planLabel}
              </span>
              {pricing && (
                <span className="ml-3 text-2xl font-bold text-[#FAFAFA]">
                  {pricing.priceCHF} CHF
                  <span className="text-sm font-normal text-[#A1A1AA]">
                    {" "}
                    {t("perMonth")}
                  </span>
                </span>
              )}
            </div>

            {/* Monthly credit allocation — what the price actually buys */}
            {pricing && (
              <p className="mt-1.5 flex items-center gap-1.5 text-sm text-[#F97316]">
                <Coins className="h-3.5 w-3.5" />
                {tc("creditsPerMonth", {
                  credits: formatNumber(pricing.credits, locale),
                })}
              </p>
            )}

            {/* Trial info */}
            {isTrial && org?.trial_ends_at && (
              <p className="mt-2 text-sm text-amber-600">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                Essai gratuit — expire le{" "}
                {new Date(org.trial_ends_at).toLocaleDateString("fr-CH")}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowPlanSelector(true)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t("changePlan")}
            </button>
            {hasSubscription && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="rounded-md border border-[#27272A] px-4 py-2 text-sm font-medium text-[#A1A1AA] hover:bg-[#27272A]"
              >
                {t("cancelSubscription")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Payment Method */}
      {hasSubscription && (
        <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#FAFAFA]">
                {t("paymentMethod")}
              </h3>
              <p className="mt-1 text-sm text-[#A1A1AA]">
                Gerez votre moyen de paiement via le portail Stripe.
              </p>
            </div>
            <button
              onClick={handleManagePayment}
              disabled={portalLoading}
              className="flex items-center gap-1.5 rounded-md border border-[#27272A] px-4 py-2 text-sm font-medium text-[#A1A1AA] hover:bg-[#27272A] disabled:opacity-50"
            >
              {portalLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              {t("modifyPayment")}
            </button>
          </div>
        </div>
      )}

      {/* Invoices */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-[#FAFAFA]">
          {t("invoices")}
        </h3>
        <InvoicesList />
      </div>

      {/* Plan selector modal */}
      {showPlanSelector && (
        <PlanSelector
          currentPlan={plan}
          hasSubscription={hasSubscription}
          onClose={() => setShowPlanSelector(false)}
          onSuccess={() => {
            setToast({ type: "success", text: "Plan mis a jour." });
            fetchOrg();
          }}
        />
      )}

      {/* Cancel confirmation modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-[#0F0F11] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#FAFAFA]">
              {t("confirmCancel")}
            </h3>
            <p className="mt-2 text-sm text-[#A1A1AA]">
              {t("cancelConfirm")}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="rounded-md px-4 py-2 text-sm text-[#A1A1AA] hover:bg-[#27272A]"
              >
                Annuler
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
