"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Mail, Check, Sparkles, AlertTriangle, Loader2, ExternalLink } from "lucide-react";

const PLANS = [
  {
    id: "starter",
    pricePerUser: 49,
    minUsers: 1,
    maxUsers: 5,
    featuresKeys: [
      "users",
      "projects",
      "mail",
      "chat",
      "briefing",
      "tasks",
      "suppliers",
      "emailSupport",
    ],
    highlight: false,
  },
  {
    id: "pro",
    pricePerUser: 89,
    minUsers: 5,
    maxUsers: 30,
    popular: true,
    featuresKeys: [
      "allStarter",
      "submissions",
      "pv",
      "planning",
      "portal",
      "plans",
      "visits",
      "reports",
      "chat1000",
      "prioritySupport",
    ],
    highlight: true,
  },
  {
    id: "enterprise",
    pricePerUser: 119,
    minUsers: 15,
    maxUsers: Infinity,
    featuresKeys: [
      "allPro",
      "direction",
      "dataIntel",
      "branding",
      "api",
      "chatUnlimited",
      "multiOrg",
      "dedicatedSupport",
    ],
    highlight: false,
  },
];

interface OrgData {
  subscription_plan: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  name: string;
}

export function SubscriptionTab() {
  const t = useTranslations("settings");
  const tp = useTranslations("landing.pricing");
  const [org, setOrg] = useState<OrgData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectingPlan, setSelectingPlan] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchOrg();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function fetchOrg() {
    try {
      const brandingRes = await fetch("/api/organization/branding");
      const brandingData = await brandingRes.json();
      setOrg({
        subscription_plan: brandingData?.organization?.subscription_plan || "trial",
        stripe_customer_id: brandingData?.organization?.stripe_customer_id || null,
        stripe_subscription_id: brandingData?.organization?.stripe_subscription_id || null,
        trial_ends_at: brandingData?.organization?.trial_ends_at || null,
        name: brandingData?.organization?.name || "",
      });
    } catch (err) {
      console.error("Failed to fetch org:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectPlan(planId: string) {
    if (planId === "enterprise") {
      window.open("mailto:contact@cantaia.io?subject=Cantaia Enterprise", "_blank");
      return;
    }

    setSelectingPlan(planId);
    try {
      const hasSubscription = !!org?.stripe_subscription_id;
      const endpoint = hasSubscription
        ? "/api/stripe/update-subscription"
        : "/api/stripe/create-checkout";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (data.success) {
        setToast({ type: "success", text: "Plan mis à jour avec succès." });
        fetchOrg();
      }
    } catch (err) {
      console.error("Failed to select plan:", err);
      setToast({ type: "error", text: "Erreur lors de la sélection du plan." });
    } finally {
      setSelectingPlan(null);
    }
  }

  async function handleCancelSubscription() {
    setCancelling(true);
    try {
      const res = await fetch("/api/stripe/cancel-subscription", { method: "POST" });
      if (res.ok) {
        setToast({ type: "success", text: "Abonnement annulé en fin de période." });
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
      const res = await fetch("/api/stripe/create-portal-session", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setToast({ type: "error", text: "Erreur. Réessayez." });
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

  const plan = org?.subscription_plan || "trial";
  const isTrial = plan === "trial";
  const hasSubscription = !!org?.stripe_subscription_id;
  const trialDaysLeft = org?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0;
  const trialProgress = org?.trial_ends_at
    ? Math.min(100, ((14 - trialDaysLeft) / 14) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            toast.type === "success"
              ? "border border-green-500/20 bg-green-500/10 text-green-400"
              : "border border-red-500/20 bg-red-500/10 text-red-400"
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Trial banner */}
      {isTrial && (
        <div className="flex items-center gap-3 rounded-[10px] border border-[#F9731630] bg-gradient-to-r from-[#1C1209] to-[#18130A] px-[18px] py-[14px]">
          <Sparkles className="h-6 w-6 shrink-0 text-[#F97316]" />
          <div className="flex-1 min-w-0">
            <div className="font-display text-[14px] font-bold text-[#FAFAFA]">
              {t("currentPlan")} : {t("trialPlan")}
            </div>
            <div className="text-[11px] text-[#A1A1AA] mt-[2px]">
              {t("trialFullAccess")}
            </div>
            <div className="h-1 w-[200px] bg-[#27272A] rounded-sm mt-[6px] overflow-hidden">
              <div
                className="h-full rounded-sm bg-gradient-to-r from-[#F97316] to-[#FB923C]"
                style={{ width: `${trialProgress}%` }}
              />
            </div>
          </div>
          <div className="text-[12px] font-semibold text-[#FB923C] shrink-0">
            {trialDaysLeft} {t("daysLeft")}
          </div>
        </div>
      )}

      {/* Current plan (non-trial) */}
      {!isTrial && (
        <div className="flex items-center justify-between rounded-[10px] border border-[#27272A] bg-[#0F0F11] px-5 py-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-[#F97316]" />
            <div>
              <div className="text-sm font-semibold text-[#FAFAFA]">
                {t("currentPlan")} : {plan.charAt(0).toUpperCase() + plan.slice(1)}
              </div>
              <div className="text-xs text-[#71717A]">
                {PLANS.find((p) => p.id === plan)?.pricePerUser || 0} CHF / {tp("perUser")}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {hasSubscription && (
              <>
                <button
                  onClick={handleManagePayment}
                  disabled={portalLoading}
                  className="flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-xs text-[#71717A] hover:bg-[#27272A] disabled:opacity-50"
                >
                  {portalLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                  {t("paymentMethod") || "Paiement"}
                </button>
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="rounded-md border border-[#27272A] px-3 py-1.5 text-xs text-[#71717A] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20"
                >
                  {t("cancelPlan") || "Annuler"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 3-column plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PLANS.map((p) => {
          const isCurrent = plan === p.id;
          const isEnterprise = p.id === "enterprise";
          const nameKey = `${p.id}Name` as const;

          return (
            <div
              key={p.id}
              className={`relative rounded-[10px] border p-5 transition-all ${
                isCurrent
                  ? "border-green-500/40 bg-green-500/5"
                  : p.highlight
                    ? "border-[#F97316]/50 bg-[#18181B] shadow-md shadow-[#F97316]/5"
                    : "border-[#27272A] bg-[#18181B] hover:border-[#3F3F46]"
              }`}
            >
              {/* Popular badge */}
              {p.highlight && !isCurrent && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-3 py-0.5 text-[10px] font-semibold text-white shadow-lg shadow-[#F97316]/25">
                  {tp("popular")}
                </div>
              )}

              {/* Current badge */}
              {isCurrent && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-green-500/20 border border-green-500/30 px-3 py-0.5 text-[10px] font-semibold text-green-400">
                  {t("currentPlan")}
                </div>
              )}

              <div className="text-center mb-4 mt-1">
                <div className="font-display text-[15px] font-bold text-[#FAFAFA]">
                  {tp(nameKey)}
                </div>
                <div className="mt-2">
                  <span className="font-display text-[32px] font-extrabold text-[#FAFAFA]">
                    {p.pricePerUser}
                  </span>
                  <span className="text-[12px] text-[#71717A] ml-1">
                    CHF / {tp("perUser")}
                  </span>
                </div>
                <div className="text-[10px] text-[#52525B] mt-0.5">
                  {p.minUsers === 1
                    ? tp(`${p.id}Min`)
                    : tp(`${p.id}Min`)}
                </div>
              </div>

              <ul className="space-y-1.5">
                {p.featuresKeys.map((fk) => (
                  <li
                    key={fk}
                    className="flex items-center gap-2 text-[11px] text-[#A1A1AA]"
                  >
                    <Check className="h-3 w-3 shrink-0 text-[#22C55E]" />
                    {tp(`${p.id}Features.${fk}`)}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleSelectPlan(p.id)}
                disabled={isCurrent || selectingPlan !== null}
                className={`mt-4 w-full rounded-lg py-2.5 text-[12px] font-medium transition-all ${
                  isCurrent
                    ? "cursor-default border border-green-500/30 bg-green-500/10 text-green-400"
                    : isEnterprise
                      ? "border border-[#27272A] bg-[#0F0F11] text-[#FAFAFA] hover:bg-[#27272A]"
                      : p.highlight
                        ? "bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white shadow-lg shadow-[#F97316]/25 hover:shadow-xl"
                        : "bg-[#FAFAFA] text-[#0F0F11] hover:bg-[#A1A1AA]"
                } disabled:opacity-50`}
              >
                {selectingPlan === p.id ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : isCurrent ? (
                  t("currentPlan")
                ) : isEnterprise ? (
                  tp("contactUs")
                ) : (
                  tp("startTrial")
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Support line */}
      <div className="flex items-center gap-2 rounded-[10px] border border-[#27272A] bg-[#18181B] px-4 py-3">
        <Mail className="h-4 w-4 text-[#71717A]" />
        <p className="text-[11px] text-[#71717A]">
          {t("needHelp")} &mdash;{" "}
          <span className="font-medium text-[#F97316]">support@cantaia.io</span>
        </p>
      </div>

      {/* Cancel confirmation modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-[#18181B] border border-[#27272A] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#FAFAFA]">
              <AlertTriangle className="mr-2 inline h-5 w-5 text-red-400" />
              Confirmer l&apos;annulation
            </h3>
            <p className="mt-2 text-sm text-[#71717A]">
              Votre abonnement restera actif jusqu&apos;à la fin de la période de facturation en cours.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="rounded-md px-4 py-2 text-sm text-[#71717A] hover:bg-[#27272A]"
              >
                Retour
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmer l&apos;annulation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
