/**
 * /projects/[id]/3d — visualiseur de scène 2.5D (Phase 1, ADR-001).
 *
 * ── Ce qui a changé ────────────────────────────────────────────────────────
 *
 * Cette page rendait `MOCK_BUILDING_SCENE` en dur et n'appelait AUCUNE des
 * trois routes backend pourtant livrées (GET /api/plans/[id]/scene,
 * POST /api/scenes/extract, POST /api/scenes/[id]/corrections) : front et
 * back ne se parlaient pas. Elle est maintenant branchée sur le flux réel.
 *
 * ── Décalage de portée : page projet, API plan ─────────────────────────────
 *
 * L'URL est project-scoped mais une scène est TOUJOURS plan-scoped
 * (`plan_scenes.plan_id`). Le plan visé arrive donc par `?plan=<planId>`
 * (lien posé par PlanDetailHeader). Sans ce paramètre, on affiche un écran
 * explicite plutôt qu'une scène arbitraire.
 *
 * ── Cycle de vie ───────────────────────────────────────────────────────────
 *
 *   GET scene → 404                    → écran « aucune scène » + Extraire
 *             → 200 processing/pending → ExtractionProgress + polling
 *             → 200 completed          → adapter → SceneViewer
 *             → 200 failed             → erreur + relance possible
 *   POST /api/scenes/extract → 202 { scene_id } → polling
 *   Corrections → POST /api/scenes/[sceneId]/corrections
 *
 * `?demo=1` conserve l'ancien comportement (scène mock, aucune requête).
 *
 * ── Piège layout (à conserver) ─────────────────────────────────────────────
 *
 * Le layout (app) rend `<main className="flex-1 overflow-auto">`, qui n'est
 * PAS un conteneur flex. SceneViewer est `flex-1 flex flex-col`. Sans le
 * wrapper `h-full flex flex-col` ci-dessous, son `flex-1` ne résout contre
 * rien et le canvas 3D se rend en 0×0, sans erreur.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { Box, Loader2, AlertTriangle, Lock, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { SceneViewer } from "@/components/scene3d";
import { buildingSceneToViewModel } from "@/components/scene3d/adapter";
import {
  exportSceneToGltf,
  exportViewerToPdf,
  exportViewerToPng,
} from "@/components/scene3d/scene-export";
import { MOCK_BUILDING_SCENE } from "@/components/scene3d/mock-scene";
import type {
  BuildingScene as UiScene,
  ExtractionProgressState,
} from "@/components/scene3d/types";
import { handleInsufficientCredits } from "@/components/credits/PaywallDialog";
import { notifyCreditsChanged } from "@/lib/hooks/use-credits";
import { creditCostFor } from "@cantaia/config/credit-costs";
import { PLAN_3D_EXTRACT_ACTION } from "@cantaia/config/plan-features";

/** Coût affiché sur les boutons d'extraction — jamais découvert au débit. */
const EXTRACT_COST = creditCostFor(PLAN_3D_EXTRACT_ACTION);

/** Intervalle de polling pendant l'extraction (Passe 5 ≈ 15-90 s). */
const POLL_INTERVAL_MS = 4000;
/** Garde-fou : au-delà, on cesse de poller et on invite à recharger. */
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
/** Durée typique d'une extraction, pour l'ETA affichée. */
const EXPECTED_EXTRACTION_S = 120;

type ViewState =
  | { kind: "loading" }
  | { kind: "no-plan" }
  | { kind: "no-scene" }
  | { kind: "extracting" }
  | { kind: "ready" }
  | {
      kind: "error";
      message: string;
      retryable: boolean;
      /**
       * `reload` : re-charger la scène (erreur de GET/réseau) — un re-fetch
       * suffit, NE PAS refacturer 40 crédits. `extract` : relancer une
       * extraction (scène en échec/illisible). `plan_gate` : gate Pro+.
       */
      reason?: "reload" | "extract" | "plan_gate";
    };

interface CorrectionTarget {
  elementId: string;
  label: string;
  ir: unknown;
}

const CORRECTION_TYPES = [
  { value: "geometry", labelKey: "correction.typeGeometry" },
  { value: "material", labelKey: "correction.typeMaterial" },
  { value: "opening_type", labelKey: "correction.typeOpening" },
  { value: "level_assignment", labelKey: "correction.typeLevel" },
  { value: "delete", labelKey: "correction.typeDelete" },
  { value: "add", labelKey: "correction.typeAdd" },
] as const;

/**
 * Dimensions ré-applicables automatiquement.
 *
 * `GET /api/plans/[id]/scene` rejoue les corrections dont le
 * `corrected_value` porte `{ dimension, value }` ou `{ remove: true }`. Une
 * correction en texte libre reste un signalement : consignée, affichée, sans
 * effet géométrique. Le formulaire dit lequel des deux il est en train de
 * produire, plutôt que de laisser croire à une boucle qui n'existerait pas.
 */
const CORRECTABLE_DIMENSIONS = [
  { value: "", labelKey: "correction.dimensionNone" },
  { value: "thickness", labelKey: "correction.dimensionThickness" },
  { value: "height", labelKey: "correction.dimensionHeight" },
] as const;

export default function Scene3dPage() {
  const t = useTranslations("scene3d");
  const router = useRouter();
  const params = useParams<{ locale: string; id: string }>();
  const searchParams = useSearchParams();
  const projectId = params.id;
  const planId = searchParams.get("plan");
  const isDemo = searchParams.get("demo") === "1";

  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [scene, setScene] = useState<UiScene | null>(null);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionProgressState | null>(null);
  const [starting, setStarting] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<CorrectionTarget | null>(null);
  /**
   * Acceptation du disclaimer déjà consignée au registre pour cet utilisateur
   * et cette scène. Sans cette information, le gate SIA se ré-affichait à
   * chaque rafraîchissement alors que l'acceptation était bien enregistrée.
   */
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  /** Message d'export (échec silencieux → message visible). */
  const [exportError, setExportError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const pollStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** IR → view model, avec garde : l'IR vient d'un LLM, il peut être malformé. */
  const adapt = useCallback((sceneData: any): UiScene | null => {
    try {
      if (!sceneData || !Array.isArray(sceneData.levels)) return null;
      return buildingSceneToViewModel(sceneData);
    } catch (err) {
      console.error("[scene3d] Adaptation de la scène échouée:", err);
      return null;
    }
  }, []);

  // ── Mode démo : aucune requête, scène de référence ───────────────────────
  const demoScene = useMemo(
    () => (isDemo ? buildingSceneToViewModel(MOCK_BUILDING_SCENE) : null),
    [isDemo],
  );

  /**
   * Charge la scène courante du plan. Retourne `true` si un polling doit
   * continuer (extraction en cours).
   */
  const loadScene = useCallback(async (): Promise<boolean> => {
    if (!planId) {
      setView({ kind: "no-plan" });
      return false;
    }

    try {
      const res = await fetch(`/api/plans/${planId}/scene`);

      if (!mountedRef.current) return false;

      if (res.status === 404) {
        setScene(null);
        setSceneId(null);
        setExtraction(null);
        setView({ kind: "no-scene" });
        return false;
      }

      if (res.status === 401) {
        // Convention : 401 → redirection login (pas de message statique).
        router.replace("/login");
        return false;
      }

      if (!res.ok) {
        setView({
          kind: "error",
          message: t("error.loadFailed", { status: res.status }),
          retryable: true,
          reason: "reload",
        });
        return false;
      }

      const payload = await res.json();
      const row = payload?.scene;
      if (!row) {
        setView({ kind: "no-scene" });
        return false;
      }

      setSceneId(row.id ?? null);
      setDisclaimerAccepted(row.disclaimer_accepted === true);

      if (row.extraction_status === "completed") {
        const adapted = adapt(row.scene_data);
        if (!adapted) {
          setExtraction(null);
          setView({
            kind: "error",
            message: t("error.unreadableScene"),
            retryable: true,
            reason: "extract",
          });
          return false;
        }
        setScene(adapted);
        setExtraction(null);
        setView({ kind: "ready" });
        return false;
      }

      if (row.extraction_status === "failed") {
        setExtraction(null);
        setView({
          kind: "error",
          message: row.error_message || t("error.extractionFailed"),
          retryable: true,
          reason: "extract",
        });
        return false;
      }

      // pending | processing
      const startedAt = pollStartedAtRef.current ?? Date.now();
      pollStartedAtRef.current = startedAt;
      const elapsedS = (Date.now() - startedAt) / 1000;
      setExtraction({
        // Les passes 1-4 sont relues depuis l'estimation en cache : seule la
        // Passe 5 (topologie) tourne réellement ici.
        currentPass: "topology",
        passIndex: 4,
        totalPasses: 5,
        etaSeconds: Math.max(0, EXPECTED_EXTRACTION_S - elapsedS),
        startedAt: new Date(startedAt).toISOString(),
      });
      setView({ kind: "extracting" });
      return true;
    } catch (err) {
      console.error("[scene3d] Chargement de la scène échoué:", err);
      if (mountedRef.current) {
        setView({ kind: "error", message: t("error.network"), retryable: true, reason: "reload" });
      }
      return false;
    }
  }, [planId, adapt, router, t]);

  // Chargement initial
  useEffect(() => {
    if (isDemo) return;
    pollStartedAtRef.current = null;
    setView({ kind: "loading" });
    loadScene();
  }, [isDemo, loadScene]);

  // Polling pendant l'extraction
  useEffect(() => {
    if (isDemo || view.kind !== "extracting") return;

    const timer = setInterval(async () => {
      if (!mountedRef.current) return;

      const startedAt = pollStartedAtRef.current;
      if (startedAt && Date.now() - startedAt > POLL_TIMEOUT_MS) {
        clearInterval(timer);
        setExtraction(null);
        setView({
          kind: "error",
          message: t("error.pollTimeout"),
          retryable: true,
          reason: "reload",
        });
        return;
      }

      await loadScene();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isDemo, view.kind, loadScene]);

  /** Lance une extraction Passe 5 (202 → polling). */
  const startExtraction = useCallback(async () => {
    if (!planId || starting) return;
    setStarting(true);

    try {
      const res = await fetch("/api/scenes/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, project_id: projectId }),
      });

      // Crédits insuffisants (402) : la modale paywall remplace le message d'erreur.
      // Testé AVANT res.json() pour que le helper puisse cloner le corps.
      if (await handleInsufficientCredits(res)) {
        return;
      }

      const payload = await res.json().catch(() => ({}));

      if (res.status === 202) {
        notifyCreditsChanged();
        pollStartedAtRef.current = Date.now();
        setSceneId(payload?.scene_id ?? null);
        setExtraction({
          currentPass: "topology",
          passIndex: 4,
          totalPasses: 5,
          etaSeconds: EXPECTED_EXTRACTION_S,
          startedAt: new Date().toISOString(),
        });
        setView({ kind: "extracting" });
        return;
      }

      // Messages actionnables plutôt qu'un code HTTP brut.
      if (res.status === 409 && payload?.error === "estimation_required") {
        setView({
          kind: "error",
          message: payload?.message ?? t("error.estimationRequired"),
          retryable: false,
        });
        return;
      }

      // Une extraction est déjà en cours (concurrence) : on reprend le polling
      // sur celle-là plutôt que d'afficher une erreur.
      if (res.status === 409 && payload?.error === "extraction_in_progress") {
        notifyCreditsChanged();
        pollStartedAtRef.current = Date.now();
        setSceneId(payload?.scene_id ?? null);
        setExtraction({
          currentPass: "topology",
          passIndex: 4,
          totalPasses: 5,
          etaSeconds: EXPECTED_EXTRACTION_S,
          startedAt: new Date().toISOString(),
        });
        setView({ kind: "extracting" });
        return;
      }

      if (res.status === 403) {
        setView({
          kind: "error",
          message:
            payload?.error === "feature_not_in_plan"
              ? t("error.planGate", { plan: payload?.required_plan ?? "Pro" })
              : t("error.accessDenied"),
          retryable: false,
          reason: "plan_gate",
        });
        return;
      }

      if (res.status === 429) {
        setView({
          kind: "error",
          message: t("error.quotaReached", { current: payload?.current ?? "?", limit: payload?.limit ?? "?" }),
          retryable: false,
        });
        return;
      }

      if (res.status === 503) {
        setView({
          kind: "error",
          message: t("error.extractionDisabled"),
          retryable: false,
        });
        return;
      }

      setView({
        kind: "error",
        message: payload?.message || payload?.error || t("error.extractGeneric", { status: res.status }),
        retryable: true,
        reason: "extract",
      });
    } catch (err) {
      console.error("[scene3d] Lancement de l'extraction échoué:", err);
      setView({ kind: "error", message: t("error.extractNetwork"), retryable: true, reason: "extract" });
    } finally {
      if (mountedRef.current) setStarting(false);
    }
  }, [planId, projectId, starting, t]);

  /** Ouvre la modale de correction sur l'élément sélectionné. */
  const handleCorrectElement = useCallback(
    (elementId: string) => {
      const el = scene?.elements.find((e) => e.id === elementId);
      setCorrectionTarget({
        elementId,
        label: el?.label ?? elementId,
        // `metadata.ir` porte l'élément IR d'origine (cf. adapter.ts) — il sert
        // de `original_value` dans le journal de corrections.
        ir: (el?.metadata as any)?.ir ?? null,
      });
    },
    [scene],
  );

  /**
   * Exports réels — les trois formats du menu fonctionnent.
   *
   * glTF et PDF se contentaient d'un `console.log("pas encore implémenté")` :
   * l'utilisateur cliquait, il ne se passait rien, aucun message. Les échecs
   * remontent désormais à l'écran plutôt que dans la console.
   */
  const handleExport = useCallback(
    async (format: "png" | "gltf" | "pdf") => {
      const filename = `scene-${planId ?? projectId}-${new Date().toISOString().slice(0, 10)}`;
      setExportError(null);

      try {
        if (format === "gltf") {
          const ok = await exportSceneToGltf(filename);
          if (!ok) setExportError(t("export.sceneNotReady"));
          return;
        }

        if (format === "pdf") {
          const ok = await exportViewerToPdf("scene3d-export-root", filename, {
            planLabel: planId ?? projectId,
            confidencePct:
              scene && Number.isFinite(scene.overall_confidence)
                ? Math.round(scene.overall_confidence * 100)
                : null,
            generatedAt: new Date().toLocaleDateString("fr-CH"),
          });
          if (!ok) setExportError(t("export.captureFailed"));
          return;
        }

        const ok = await exportViewerToPng("scene3d-export-root", filename);
        if (!ok) setExportError(t("export.captureFailed"));
      } catch (err) {
        console.error(`[scene3d export] export ${format} a échoué:`, err);
        setExportError(t("export.failed"));
      }
    },
    [planId, projectId, scene, t],
  );

  // ── Rendu ────────────────────────────────────────────────────────────────

  if (isDemo && demoScene) {
    return (
      <div id="scene3d-export-root" className="h-full flex flex-col overflow-hidden">
        <div className="border-b border-[#27272A] bg-[#18181B] px-4 py-2 text-xs text-[#A1A1AA]">
          {t("demo.banner")}
        </div>
        <SceneViewer
          projectId={projectId}
          planId={null}
          sceneId={null}
          scene={demoScene}
          extraction={null}
          error={null}
          // Pas de scène persistée en démo : une correction n'aurait rien à
          // cibler. On loggue plutôt que d'ouvrir une modale sans effet.
          onCorrectElement={(id) => console.log("[scene3d demo] correction sur", id)}
          onExport={handleExport}
        />
      </div>
    );
  }

  if (view.kind === "no-plan") {
    return (
      <EmptyScreen
        icon={<FileText className="w-6 h-6 text-[#A1A1AA]" />}
        title={t("noPlan.title")}
        description={t("noPlan.description")}
        action={
          <Link
            href={`/projects/${projectId}`}
            className="rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-[#0F0F11] hover:bg-[#EA580C]"
          >
            {t("noPlan.choosePlan")}
          </Link>
        }
      />
    );
  }

  if (view.kind === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0F0F11]">
        <div className="inline-flex items-center gap-3 text-[#A1A1AA]">
          <Loader2 className="w-4 h-4 animate-spin text-[#F97316]" aria-hidden="true" />
          <span className="text-sm">{t("loadingScene")}</span>
        </div>
      </div>
    );
  }

  if (view.kind === "no-scene") {
    return (
      <EmptyScreen
        icon={<Box className="w-6 h-6 text-[#F97316]" />}
        title={t("noScene.title")}
        description={t("noScene.description")}
        action={
          <button
            type="button"
            onClick={startExtraction}
            disabled={starting}
            className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-[#0F0F11] hover:bg-[#EA580C] disabled:opacity-50"
          >
            {starting ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Box className="w-4 h-4" aria-hidden="true" />
            )}
            {t("noScene.extractCta", { credits: EXTRACT_COST })}
          </button>
        }
        secondary={
          planId ? (
            <Link href={`/plans/${planId}`} className="text-xs text-[#A1A1AA] hover:text-[#FAFAFA]">
              {t("backToPlan")}
            </Link>
          ) : null
        }
      />
    );
  }

  if (view.kind === "error") {
    // Champ structuré plutôt qu'un match de sous-chaîne (traduction-dépendant).
    const isPlanGate = view.reason === "plan_gate";
    // Deux natures de retry très différentes :
    //   - `reload` : simple erreur de lecture (GET/réseau/timeout) → re-fetch,
    //     GRATUIT. Ne JAMAIS proposer une ré-extraction facturée ici.
    //   - `extract` : la scène est en échec/illisible → ré-extraction (40 c),
    //     coût affiché sur le bouton.
    const isReloadRetry = view.reason === "reload";
    return (
      <EmptyScreen
        icon={
          isPlanGate ? (
            <Lock className="w-6 h-6 text-[#F97316]" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-[#EF4444]" />
          )
        }
        title={isPlanGate ? t("error.planGateTitle") : t("error.title")}
        description={view.message}
        action={
          view.retryable && isReloadRetry ? (
            <button
              type="button"
              onClick={() => {
                setView({ kind: "loading" });
                loadScene();
              }}
              className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-[#0F0F11] hover:bg-[#EA580C]"
            >
              {t("error.reloadCta")}
            </button>
          ) : view.retryable ? (
            <button
              type="button"
              onClick={startExtraction}
              disabled={starting}
              className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-[#0F0F11] hover:bg-[#EA580C] disabled:opacity-50"
            >
              {starting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {t("error.extractRetryCta", { credits: EXTRACT_COST })}
            </button>
          ) : planId ? (
            <Link
              href={`/plans/${planId}`}
              className="rounded-md bg-[#27272A] px-4 py-2 text-sm font-medium text-[#FAFAFA] hover:bg-[#3F3F46]"
            >
              {t("backToPlan")}
            </Link>
          ) : null
        }
      />
    );
  }

  return (
    <>
      {/* L'id est lu par handleExport() : l'arbre SceneViewer est profond, on
          évite de faire descendre une ref à travers chaque couche. */}
      <div id="scene3d-export-root" className="h-full flex flex-col overflow-hidden">
        <SceneViewer
          projectId={projectId}
          planId={planId}
          sceneId={sceneId}
          scene={view.kind === "ready" ? scene : null}
          extraction={view.kind === "extracting" ? extraction : null}
          error={null}
          disclaimerAccepted={disclaimerAccepted}
          onCorrectElement={handleCorrectElement}
          onExport={handleExport}
        />
      </div>

      {exportError && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-md border border-[#EF4444]/30 bg-[#18181B] px-4 py-2 text-sm text-[#EF4444] shadow-lg shadow-black/40"
        >
          <span>{exportError}</span>
          <button
            type="button"
            onClick={() => setExportError(null)}
            className="ml-3 text-xs text-[#A1A1AA] hover:text-[#FAFAFA]"
          >
            {t("export.dismiss")}
          </button>
        </div>
      )}

      {correctionTarget && (
        <CorrectionModal
          sceneId={sceneId}
          target={correctionTarget}
          onClose={() => setCorrectionTarget(null)}
          // Une correction qualifiée est rejouée par le GET : on recharge pour
          // que l'utilisateur VOIE sa correction appliquée. Sans ce rechargement
          // la boucle reste invisible et l'utilisateur croit qu'il ne s'est
          // rien passé — c'est exactement ce qui tuait la boucle précédente.
          onSaved={() => {
            setCorrectionTarget(null);
            loadScene();
          }}
        />
      )}
    </>
  );
}

/** Écran vide/erreur partagé. */
function EmptyScreen({
  icon,
  title,
  description,
  action,
  secondary,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#0F0F11] p-6">
      <div className="max-w-md text-center">
        <div className="inline-flex w-12 h-12 rounded-full bg-[#18181B] border border-[#27272A] items-center justify-center">
          {icon}
        </div>
        <h2 className="mt-4 font-display text-lg font-semibold text-[#FAFAFA]">{title}</h2>
        <p className="mt-2 text-sm text-[#A1A1AA]">{description}</p>
        {action && <div className="mt-5 flex justify-center">{action}</div>}
        {secondary && <div className="mt-3">{secondary}</div>}
      </div>
    </div>
  );
}

/**
 * Modale de correction d'un élément de scène.
 *
 * ── Ce qui change ─────────────────────────────────────────────────────────
 * La version précédente n'envoyait qu'un `correction_type` et un texte libre.
 * Le journal `plan_scene_corrections` n'étant jamais relu, la correction ne
 * modifiait rien, `human_corrected` ne passait jamais à `true`, et aucune
 * convergence n'était possible : une boîte à idées, pas une boucle.
 *
 * Le formulaire produit désormais une correction STRUCTURÉE quand
 * l'utilisateur peut en donner une — une dimension et sa valeur en mètres, ou
 * une suppression. `GET /api/plans/[id]/scene` rejoue ces corrections sur la
 * scène servie. Le texte libre reste possible et reste consigné, mais la
 * modale dit clairement lequel des deux effets elle va produire, plutôt que
 * de laisser espérer une correction qui n'arriverait jamais.
 */
function CorrectionModal({
  sceneId,
  target,
  onClose,
  onSaved,
}: {
  sceneId: string | null;
  target: CorrectionTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("scene3d");
  const [correctionType, setCorrectionType] =
    useState<(typeof CORRECTION_TYPES)[number]["value"]>("geometry");
  const [dimension, setDimension] = useState<"" | "thickness" | "height">("");
  const [dimensionValue, setDimensionValue] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isDelete = correctionType === "delete";
  const parsedValue = Number(dimensionValue.replace(",", "."));
  const hasStructuredValue =
    dimension !== "" && Number.isFinite(parsedValue) && parsedValue > 0;
  /** La correction sera-t-elle appliquée à la scène, ou seulement consignée ? */
  const willApply = isDelete || hasStructuredValue;

  const handleSubmit = async () => {
    if (!sceneId) {
      setError(t("correction.errorNoScene"));
      return;
    }
    if (dimension !== "" && !hasStructuredValue) {
      setError(t("correction.errorValue"));
      return;
    }
    if (!willApply && notes.trim().length < 3) {
      setError(t("correction.errorNotes"));
      return;
    }

    setSaving(true);
    setError("");

    try {
      // `corrected_value` est la charge utile relue par le GET. Les clés
      // `dimension`/`value`/`remove` sont son contrat — les renommer ici sans
      // adapter `qualifyCorrection()` désarmerait silencieusement la boucle.
      const correctedValue: Record<string, unknown> = {
        reported_from: "scene3d_viewer",
        element_label: target.label,
        correction_type: correctionType,
        notes: notes.trim(),
      };
      if (isDelete) correctedValue.remove = true;
      if (hasStructuredValue) {
        correctedValue.dimension = dimension;
        correctedValue.value = parsedValue;
      }

      const res = await fetch(`/api/scenes/${sceneId}/corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          element_id: target.elementId,
          correction_type: correctionType,
          original_value: target.ir ?? null,
          corrected_value: correctedValue,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload?.message || payload?.error || `Erreur ${res.status}`);
        setSaving(false);
        return;
      }

      onSaved();
    } catch (err) {
      console.error("[scene3d] Enregistrement de la correction échoué:", err);
      setError(t("correction.errorNetwork"));
      setSaving(false);
    }
  };

  const inputClass =
    "mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="scene-correction-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-[#27272A] bg-[#18181B] p-6 shadow-lg shadow-black/40">
        <h2 id="scene-correction-title" className="font-display text-lg font-semibold text-[#FAFAFA]">
          {t("correction.title")}
        </h2>
        <p className="mt-1 text-sm text-[#A1A1AA]">
          {t("correction.element")} <span className="text-[#FAFAFA]">{target.label}</span>
        </p>

        <label htmlFor="correction-type" className="mt-5 block text-xs font-medium text-[#A1A1AA]">
          {t("correction.type")}
        </label>
        <select
          id="correction-type"
          value={correctionType}
          onChange={(e) => setCorrectionType(e.target.value as typeof correctionType)}
          className={inputClass}
        >
          {CORRECTION_TYPES.map((c) => (
            <option key={c.value} value={c.value}>
              {t(c.labelKey)}
            </option>
          ))}
        </select>

        {!isDelete && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="correction-dimension" className="block text-xs font-medium text-[#A1A1AA]">
                {t("correction.dimension")}
              </label>
              <select
                id="correction-dimension"
                value={dimension}
                onChange={(e) => setDimension(e.target.value as typeof dimension)}
                className={inputClass}
              >
                {CORRECTABLE_DIMENSIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {t(d.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="correction-value" className="block text-xs font-medium text-[#A1A1AA]">
                {t("correction.value")}
              </label>
              <input
                id="correction-value"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                disabled={dimension === ""}
                value={dimensionValue}
                onChange={(e) => setDimensionValue(e.target.value)}
                placeholder="0.25"
                className={`${inputClass} disabled:opacity-40`}
              />
            </div>
          </div>
        )}

        <label htmlFor="correction-notes" className="mt-4 block text-xs font-medium text-[#A1A1AA]">
          {t("correction.notes")}
        </label>
        <textarea
          id="correction-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={t("correction.notesPlaceholder")}
          className={`${inputClass} resize-none`}
        />

        {/* Dire ce qui va se passer, avant de cliquer. */}
        <p
          className={`mt-3 rounded-md border px-3 py-2 text-[11px] leading-relaxed ${
            willApply
              ? "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]"
              : "border-[#27272A] bg-[#1C1C1F] text-[#A1A1AA]"
          }`}
        >
          {willApply ? t("correction.willApply") : t("correction.willLogOnly")}
        </p>

        {error && (
          <p className="mt-3 rounded-md border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-xs text-[#EF4444]">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-[#27272A] px-4 py-2 text-sm font-medium text-[#FAFAFA] hover:bg-[#3F3F46]"
          >
            {t("correction.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-[#0F0F11] hover:bg-[#EA580C] disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {t("correction.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
