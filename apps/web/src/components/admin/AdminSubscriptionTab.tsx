"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  CreditCard,
  Loader2,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import PlanSelector from "@/components/stripe/PlanSelector";
import InvoicesList from "@/components/stripe/InvoicesList";

const PLAN_LABELS: Record<string, string> = {
  trial: "Essai gratuit",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

const PLAN_PRICES: Record<string, number> = {
  trial: 0,
  starter: 149,
  pro: 349,
  enterprise: 790,
};

interface OrgData {
  subscription_plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  name: string;
}

export default function AdminSubscriptionTab() {
  const t = useTranslations("admin");
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
      const profileRes = await fetch("/api/user/profile");
      const profileData = await profileRes.json();
      const orgId = profileData?.profile?.organization_id;
      if (!orgId) {
        setLoading(false);
        return;
      }

      // Fetch org details via organization branding route which returns org data
      const brandingRes = await fetch("/api/organization/branding");
      const brandingData = await brandingRes.json();

      setOrg({
        subscription_plan:
          brandingData?.organization?.subscription_plan || "trial",
        stripe_customer_id:
          brandingData?.organization?.stripe_customer_id || null,
        stripe_subscription_id:
          brandingData?.organization?.stripe_subscription_id || null,
        trial_ends_at: brandingData?.organization?.trial_ends_at || null,
        name: brandingData?.organization?.name || "",
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
  const planPrice = PLAN_PRICES[plan] || 0;
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

      {/* Current Plan Card */}
      <div className="rounded-lg border border-border bg-background p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <CreditCard className="h-5 w-5 text-primary" />
              {t("currentPlan")}
            </h2>
            <div className="mt-3">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                  isTrial
                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : plan === "pro"
                      ? "bg-primary/10 text-primary"
                      : plan === "enterprise"
                        ? "bg-purple-500/10 text-purple-700 dark:text-purple-400"
                        : "bg-muted text-foreground"
                }`}
              >
                {planLabel}
              </span>
              {planPrice > 0 && (
                <span className="ml-3 text-2xl font-bold text-foreground">
                  {planPrice} CHF
                  <span className="text-sm font-normal text-muted-foreground">
                    {t("perMonth")}
                  </span>
                </span>
              )}
            </div>

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
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                {t("cancelSubscription")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Payment Method */}
      {hasSubscription && (
        <div className="rounded-lg border border-border bg-background p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {t("paymentMethod")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Gerez votre moyen de paiement via le portail Stripe.
              </p>
            </div>
            <button
              onClick={handleManagePayment}
              disabled={portalLoading}
              className="flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
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
        <h3 className="mb-3 text-sm font-semibold text-foreground">
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
          <div className="w-full max-w-sm rounded-lg bg-background p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground">
              {t("confirmCancel")}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("cancelConfirm")}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
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
