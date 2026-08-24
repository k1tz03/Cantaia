"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Upload, Send, Download, Box, Lock } from "lucide-react";
import { cn } from "@cantaia/ui";
import { canAccess, requiredPlanFor } from "@cantaia/config/plan-features";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/AuthProvider";
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
  const statusCfg = STATUS_CONFIG[plan.status];
  const StatusIcon = statusCfg.icon;
  const project = plan.projects;

  const { plan: orgPlan, loaded: orgPlanLoaded } = useOrgPlan();
  const can3d = orgPlan ? canAccess(orgPlan, "visualization3d") : false;
  const required3dPlan = requiredPlanFor("visualization3d");

  const view3dLabel = t("viewIn3d");

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
              <Link
                href={`/projects/${project.id}/3d?plan=${plan.id}`}
                className="flex items-center gap-1.5 rounded-md border border-[#F97316]/30 bg-[#F97316]/10 px-3 py-1.5 text-xs font-medium text-[#F97316] hover:bg-[#F97316]/20"
              >
                <Box className="h-3.5 w-3.5" />
                {view3dLabel}
              </Link>
            ) : (
              <span
                title={`Disponible à partir du plan ${required3dPlan}`}
                className="flex cursor-not-allowed items-center gap-1.5 rounded-md border border-[#27272A] bg-[#18181B] px-3 py-1.5 text-xs font-medium text-[#52525B]"
              >
                <Lock className="h-3.5 w-3.5" />
                {view3dLabel}
              </span>
            )
          )}
          <button className="flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-xs font-medium text-[#71717A] hover:bg-[#27272A]">
            <Upload className="h-3.5 w-3.5" />
            {t("uploadNewVersion")}
          </button>
          <button className="flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-xs font-medium text-[#71717A] hover:bg-[#27272A]">
            <Send className="h-3.5 w-3.5" />
            {t("distribute")}
          </button>
        </div>
      </div>

      <h1 className="text-xl font-semibold text-[#FAFAFA] mb-2">{plan.plan_title}</h1>

      <div className="flex flex-wrap items-center gap-2 text-xs text-[#71717A]">
        {project && (
          <Link href={`/projects/${project.id}`} className="flex items-center gap-1.5 hover:text-brand transition-colors">
            <span className="h-2 w-2 rounded-full shrink-0 bg-brand" />
            {project.name}
          </Link>
        )}
        {plan.discipline && (
          <>
            <span className="text-[#71717A]">&middot;</span>
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", DISCIPLINE_COLORS[plan.discipline])}>
              {t(DISCIPLINE_KEYS[plan.discipline])}
            </span>
          </>
        )}
        {plan.lot_name && <><span className="text-[#71717A]">&middot;</span><span>{plan.lot_name}</span></>}
        {plan.zone && <><span className="text-[#71717A]">&middot;</span><span>{plan.zone}</span></>}
        {plan.scale && <><span className="text-[#71717A]">&middot;</span><span>{plan.scale}</span></>}
      </div>

      {plan.author_company && (
        <p className="mt-2 text-xs text-[#71717A]">
          {t("author")}: <span className="font-medium text-[#FAFAFA]">{plan.author_name || plan.author_company}</span>
          {plan.author_name && plan.author_company && ` — ${plan.author_company}`}
        </p>
      )}

      {currentVersion && (
        <div className="mt-3 flex items-center gap-3 rounded-md bg-[#F97316]/10 border border-[#F97316]/20 px-3 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-brand text-white text-sm font-bold">
            {currentVersion.version_code}
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-[#FAFAFA]">
              {t("versionCurrent")} — {currentVersion.file_name}
            </p>
            <p className="text-[11px] text-[#71717A]">
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
