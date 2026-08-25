"use client";

import { useEffect, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { Upload, Send, Download, Box, Lock, Loader2, Sparkles } from "lucide-react";
import { cn } from "@cantaia/ui";
import { canAccess, requiredPlanFor } from "@cantaia/config/plan-features";
import { creditCostFor } from "@cantaia/config/credit-costs";
import { PLAN_3D_EXTRACT_ACTION } from "@cantaia/config/plan-features";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { handleInsufficientCredits } from "@/components/credits/PaywallDialog";
import { notifyCreditsChanged } from "@/lib/hooks/use-credits";
import {
  STATUS_CONFIG,
  DISCIPLINE_KEYS,
  DISCIPLINE_COLORS,
  formatDate,
  formatFileSize,
} from "./plan-detail-types";
import type { PlanDetail, PlanVersion } from "./plan-detail-types";

/**
 * Plan d'abonnement de l'organisation courante.
 *
 * B17 — Le lien « Voir en 3D » était affiché pour tout le monde alors que
 * `visualization3d` est réservé à Pro/Enterprise : les comptes trial/starter
 * arrivaient sur le viewer puis se prenaient un 403 `feature_not_in_plan` de
 * `/api/scenes/extract`. On gate côté client (la route reste évidemment la
 * frontière de sécurité — cf. `canAccess` + `check3dExtractionLimit`).
 *
 * Même stratégie de lecture que `TrialGuard` : profil → organisation.
 */
function useOrgPlan(): { plan: string | null; loaded: boolean } {
  const { user, loading: authLoading } = useAuth();
  const [plan, setPlan] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoaded(true);
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    (async () => {
      try {
        const { data: profile } = await (supabase as any)
          .from("users")
          .select("organization_id")
          .eq("id", user.id)
          .maybeSingle();

        if (!profile?.organization_id) {
          if (!cancelled) setLoaded(true);
          return;
        }

        const { data: org } = await (supabase as any)
          .from("organizations")
          .select("subscription_plan")
          .eq("id", profile.organization_id)
          .maybeSingle();

        if (!cancelled) {
          setPlan(org?.subscription_plan || "trial");
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return { plan, loaded };
}

export function PlanDetailHeader({
  plan,
  currentVersion,
  t,
}: {
  plan: PlanDetail;
  currentVersion: PlanVersion | undefined;
  t: (key: string, values?: any) => string;
}) {
  const router = useRouter();
  const statusCfg = STATUS_CONFIG[plan.status];
  const StatusIcon = statusCfg.icon;
  const project = plan.projects;

  const { plan: orgPlan, loaded: orgPlanLoaded } = useOrgPlan();
  const can3d = orgPlan ? canAccess(orgPlan, "visualization3d") : false;
  const required3dPlan = requiredPlanFor("visualization3d");

  const view3dLabel = t("viewIn3d");

  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  /** Coût affiché AVANT le clic — jamais découvert au débit. */
  const extractionCost = creditCostFor(PLAN_3D_EXTRACT_ACTION);

  /**
   * Lance l'extraction 3D depuis la fiche du plan, puis ouvre le visualiseur.
   *
   * L'extraction est facturée : le 402 doit ouvrir la modale de paywall (et
   * non un message d'erreur générique), et un lancement réussi doit
   * rafraîchir le solde affiché dans l'interface — sans quoi le compteur de
   * crédits ment jusqu'au prochain rechargement de page.
   */
  const handleExtract3d = async () => {
    if (!project || extracting) return;

    setExtracting(true);
    setExtractError(null);

    try {
      const res = await fetch("/api/scenes/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: plan.id, project_id: project.id }),
      });

      // Testé AVANT res.json() : le helper a besoin de cloner le corps.
      if (await handleInsufficientCredits(res)) {
        setExtracting(false);
        return;
      }

      const payload = await res.json().catch(() => ({}));

      if (res.status === 202) {
        notifyCreditsChanged();
        // Le visualiseur prend le relais du suivi (polling du statut).
        router.push(`/projects/${project.id}/3d?plan=${plan.id}`);
        return;
      }

      if (res.status === 409 && payload?.error === "estimation_required") {
        setExtractError(payload?.message ?? t("scene3dEstimationRequired"));
      } else if (res.status === 429) {
        setExtractError(t("scene3dQuotaReached"));
      } else {
        setExtractError(payload?.message || payload?.error || t("scene3dExtractFailed"));
      }
      setExtracting(false);
    } catch (err) {
      console.error("[plan-detail] lancement de l'extraction 3D échoué:", err);
      setExtractError(t("scene3dExtractFailed"));
      setExtracting(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-[#27272A] bg-[#0F0F11] p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-bold text-brand">{plan.plan_number}</span>
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
            statusCfg.bg, statusCfg.color
          )}>
            <StatusIcon className="h-3.5 w-3.5" />
            {t(statusCfg.labelKey)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Voir en 3D — ouvre le viewer de scène du projet SUR CE PLAN
              (`?plan=` : la scène est plan-scoped côté API, cf.
              GET /api/plans/[id]/scene). Masqué si le plan n'est rattaché à
              aucun projet (import legacy). Verrouillé hors Pro/Enterprise. */}
          {project && orgPlanLoaded && (
            can3d ? (
              <>
                <Link
                  href={`/projects/${project.id}/3d?plan=${plan.id}`}
                  className="flex items-center gap-1.5 rounded-md border border-[#F97316]/30 bg-[#F97316]/10 px-3 py-1.5 text-xs font-medium text-[#F97316] hover:bg-[#F97316]/20"
                >
                  <Box className="h-3.5 w-3.5" />
                  {view3dLabel}
                </Link>
                <button
                  type="button"
                  onClick={handleExtract3d}
                  disabled={extracting}
                  title={t("scene3dExtractCost", { credits: extractionCost })}
                  className="flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-xs font-medium text-[#A1A1AA] hover:bg-[#27272A] disabled:opacity-50"
                >
                  {extracting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {t("scene3dExtract")}
                  <span className="font-mono text-[10px] text-[#A1A1AA]">
                    {extractionCost}
                  </span>
                </button>
              </>
            ) : (
              <span
                title={t("scene3dLockedHint", { plan: required3dPlan })}
                className="flex cursor-not-allowed items-center gap-1.5 rounded-md border border-[#27272A] bg-[#18181B] px-3 py-1.5 text-xs font-medium text-[#A1A1AA]"
              >
                <Lock className="h-3.5 w-3.5" />
                {view3dLabel}
              </span>
            )
          )}
          {/* Nouvelle version → l'upload rattache automatiquement une version au
              plan existant (même project + plan_number). */}
          <Link
            href="/plans/upload"
            className="flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-xs font-medium text-[#A1A1AA] hover:bg-[#27272A]"
          >
            <Upload className="h-3.5 w-3.5" />
            {t("uploadNewVersion")}
          </Link>
          {/* Distribution par email pas encore implémentée (pas de flux Graph) :
              bouton désactivé plutôt que décoratif-cliquable. */}
          <button
            type="button"
            disabled
            title={t("comingSoon")}
            className="flex cursor-not-allowed items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-xs font-medium text-[#A1A1AA] opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            {t("distribute")}
          </button>
        </div>
      </div>

      {extractError && (
        <p
          role="alert"
          className="mb-3 rounded-md border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#EF4444]"
        >
          {extractError}
        </p>
      )}

      <h1 className="text-xl font-semibold text-[#FAFAFA] mb-2">{plan.plan_title}</h1>

      <div className="flex flex-wrap items-center gap-2 text-xs text-[#A1A1AA]">
        {project && (
          <Link href={`/projects/${project.id}`} className="flex items-center gap-1.5 hover:text-brand transition-colors">
            <span className="h-2 w-2 rounded-full shrink-0 bg-brand" />
            {project.name}
          </Link>
        )}
        {plan.discipline && (
          <>
            <span className="text-[#A1A1AA]">&middot;</span>
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", DISCIPLINE_COLORS[plan.discipline])}>
              {t(DISCIPLINE_KEYS[plan.discipline])}
            </span>
          </>
        )}
        {plan.lot_name && <><span className="text-[#A1A1AA]">&middot;</span><span>{plan.lot_name}</span></>}
        {plan.zone && <><span className="text-[#A1A1AA]">&middot;</span><span>{plan.zone}</span></>}
        {plan.scale && <><span className="text-[#A1A1AA]">&middot;</span><span>{plan.scale}</span></>}
      </div>

      {plan.author_company && (
        <p className="mt-2 text-xs text-[#A1A1AA]">
          {t("author")}: <span className="font-medium text-[#FAFAFA]">{plan.author_name || plan.author_company}</span>
          {plan.author_name && plan.author_company && ` — ${plan.author_company}`}
        </p>
      )}

      {currentVersion && (
        <div className="mt-3 flex items-center gap-3 rounded-md bg-[#F97316]/10 border border-[#F97316]/20 px-3 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-brand text-[#0F0F11] text-sm font-bold">
            {currentVersion.version_code}
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-[#FAFAFA]">
              {t("versionCurrent")} — {currentVersion.file_name}
            </p>
            <p className="text-[11px] text-[#A1A1AA]">
              {formatDate(currentVersion.version_date)} · {formatFileSize(currentVersion.file_size)}
            </p>
          </div>
          {currentVersion.file_url && (
            <a
              href={currentVersion.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-md bg-[#0F0F11] border border-[#F97316]/20 px-2.5 py-1.5 text-xs font-medium text-[#F97316] hover:bg-[#F97316]/10"
            >
              <Download className="h-3.5 w-3.5" />
              {t("download")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
