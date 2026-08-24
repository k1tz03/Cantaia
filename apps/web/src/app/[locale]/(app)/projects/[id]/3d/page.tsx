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
import { Link } from "@/i18n/navigation";
import { Box, Loader2, AlertTriangle, Lock, FileText } from "lucide-react";
import { SceneViewer } from "@/components/scene3d";
import { buildingSceneToViewModel } from "@/components/scene3d/adapter";
import { MOCK_BUILDING_SCENE } from "@/components/scene3d/mock-scene";
import type {
  BuildingScene as UiScene,
  ExtractionProgressState,
} from "@/components/scene3d/types";
import { handleInsufficientCredits } from "@/components/credits/PaywallDialog";
import { notifyCreditsChanged } from "@/lib/hooks/use-credits";

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
  | { kind: "error"; message: string; retryable: boolean };

interface CorrectionTarget {
  elementId: string;
  label: string;
  ir: unknown;
}

const CORRECTION_TYPES = [
  { value: "geometry", label: "Géométrie / dimensions" },
  { value: "material", label: "Matériau" },
  { value: "opening_type", label: "Type d'ouverture" },
  { value: "level_assignment", label: "Niveau d'appartenance" },
  { value: "delete", label: "Élément inexistant (à supprimer)" },
  { value: "add", label: "Élément manquant (à ajouter)" },
] as const;

export default function Scene3dPage() {
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
        setView({ kind: "error", message: "Session expirée — reconnectez-vous.", retryable: false });
        return false;
      }

      if (!res.ok) {
        setView({
          kind: "error",
          message: `Impossible de charger la scène (erreur ${res.status}).`,
          retryable: true,
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

      if (row.extraction_status === "completed") {
        const adapted = adapt(row.scene_data);
        if (!adapted) {
          setExtraction(null);
          setView({
            kind: "error",
            message:
              "La scène extraite est illisible (structure inattendue). Relancez une extraction.",
            retryable: true,
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
          message: row.error_message || "L'extraction 3D a échoué.",
          retryable: true,
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
        setView({ kind: "error", message: "Erreur réseau lors du chargement de la scène.", retryable: true });
      }
      return false;
    }
  }, [planId, adapt]);

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
          message:
            "L'extraction dépasse la durée attendue. Rechargez la page pour vérifier son état.",
          retryable: true,
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
          message:
            payload?.message ??
            "Aucune estimation pour ce plan. Lancez d'abord l'estimation 4 passes depuis la fiche du plan.",
          retryable: false,
        });
        return;
      }

      if (res.status === 403) {
        setView({
          kind: "error",
          message:
            payload?.error === "feature_not_in_plan"
              ? `La visualisation 3D nécessite le plan ${payload?.required_plan ?? "Pro"}.`
              : "Accès refusé à ce plan.",
          retryable: false,
        });
        return;
      }

      if (res.status === 429) {
        setView({
          kind: "error",
          message: `Quota d'extractions 3D atteint (${payload?.current ?? "?"}/${payload?.limit ?? "?"} ce mois).`,
          retryable: false,
        });
        return;
      }

      setView({
        kind: "error",
        message: payload?.message || payload?.error || `Extraction impossible (erreur ${res.status}).`,
        retryable: true,
      });
    } catch (err) {
      console.error("[scene3d] Lancement de l'extraction échoué:", err);
      setView({ kind: "error", message: "Erreur réseau lors du lancement de l'extraction.", retryable: true });
    } finally {
      if (mountedRef.current) setStarting(false);
    }
  }, [planId, projectId, starting]);

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

  const handleExport = useCallback(
    async (format: "png" | "gltf" | "pdf") => {
      if (format !== "png") {
        // glTF (GLTFExporter) et PDF (jspdf autour du PNG) arrivent en Phase 2.
        console.log(`[scene3d] export "${format}" pas encore implémenté`);
        return;
      }

      const root = document.getElementById("scene3d-export-root");
      if (!root) {
        console.error("[scene3d export] #scene3d-export-root introuvable");
        return;
      }

      try {
        // html2canvas ne sait normalement pas lire un canvas WebGL — le
        // navigateur peut jeter le back buffer après compositing. SceneCanvas
        // est configuré avec `gl={{ preserveDrawingBuffer: true }}`, ce qui
        // garde le framebuffer lisible. Sans ce flag : PNG transparent.
        // Import dynamique : ~45 Ko qu'on ne charge qu'au clic.
        const html2canvas = (await import("html2canvas")).default;
        const canvas = await html2canvas(root, {
          backgroundColor: "#0F0F11",
          scale: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
          useCORS: true,
          allowTaint: false,
          logging: false,
        });

        canvas.toBlob((blob) => {
          if (!blob) {
            console.error("[scene3d export] toBlob a renvoyé null");
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `scene-${planId ?? projectId}-${new Date().toISOString().slice(0, 10)}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }, "image/png");
      } catch (err) {
        console.error("[scene3d export] html2canvas a échoué:", err);
      }
    },
    [planId, projectId],
  );

  // ── Rendu ────────────────────────────────────────────────────────────────

  if (isDemo && demoScene) {
    return (
      <div id="scene3d-export-root" className="h-full flex flex-col overflow-hidden">
        <div className="border-b border-[#27272A] bg-[#18181B] px-4 py-2 text-xs text-[#A1A1AA]">
          Mode démonstration (<code className="font-mono">?demo=1</code>) — scène fictive, aucune
          donnée réelle.
        </div>
        <SceneViewer
          projectId={projectId}
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
        title="Aucun plan sélectionné"
        description="La visualisation 3D s'ouvre depuis un plan : une scène est rattachée à un plan, pas à un projet entier."
        action={
          <Link
            href={`/projects/${projectId}`}
            className="rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#EA580C]"
          >
            Choisir un plan
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
          <span className="text-sm">Chargement de la scène…</span>
        </div>
      </div>
    );
  }

  if (view.kind === "no-scene") {
    return (
      <EmptyScreen
        icon={<Box className="w-6 h-6 text-[#F97316]" />}
        title="Aucune scène 3D pour ce plan"
        description="La scène est reconstruite à partir de l'estimation existante du plan (passe 5 — topologie). Comptez une à deux minutes."
        action={
          <button
            type="button"
            onClick={startExtraction}
            disabled={starting}
            className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#EA580C] disabled:opacity-50"
          >
            {starting ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Box className="w-4 h-4" aria-hidden="true" />
            )}
            Extraire la scène 3D
          </button>
        }
        secondary={
          planId ? (
            <Link href={`/plans/${planId}`} className="text-xs text-[#71717A] hover:text-[#A1A1AA]">
              Retour à la fiche du plan
            </Link>
          ) : null
        }
      />
    );
  }

  if (view.kind === "error") {
    const isPlanGate = view.message.includes("nécessite le plan");
    return (
      <EmptyScreen
        icon={
          isPlanGate ? (
            <Lock className="w-6 h-6 text-[#F97316]" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-[#EF4444]" />
          )
        }
        title={isPlanGate ? "Fonctionnalité non incluse" : "Extraction 3D indisponible"}
        description={view.message}
        action={
          view.retryable ? (
            <button
              type="button"
              onClick={startExtraction}
              disabled={starting}
              className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#EA580C] disabled:opacity-50"
            >
              {starting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              Relancer l&apos;extraction
            </button>
          ) : planId ? (
            <Link
              href={`/plans/${planId}`}
              className="rounded-md bg-[#27272A] px-4 py-2 text-sm font-medium text-[#FAFAFA] hover:bg-[#3F3F46]"
            >
              Retour à la fiche du plan
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
          sceneId={sceneId}
          scene={view.kind === "ready" ? scene : null}
          extraction={view.kind === "extracting" ? extraction : null}
          error={null}
          onCorrectElement={handleCorrectElement}
          onExport={handleExport}
        />
      </div>

      {correctionTarget && (
        <CorrectionModal
          sceneId={sceneId}
          target={correctionTarget}
          onClose={() => setCorrectionTarget(null)}
          onSaved={() => setCorrectionTarget(null)}
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
 * Phase 1 : signalement qualifié (type + note) écrit dans le journal
 * append-only `plan_scene_corrections`. L'édition géométrique structurée
 * (déplacer un mur, corriger une épaisseur) arrive en Phase 2 — `corrected_value`
 * accepte déjà n'importe quel JSON côté API.
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
  const [correctionType, setCorrectionType] =
    useState<(typeof CORRECTION_TYPES)[number]["value"]>("geometry");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!sceneId) {
      setError("Cette scène n'est pas enregistrée : correction impossible.");
      return;
    }
    if (notes.trim().length < 3) {
      setError("Décrivez brièvement le problème constaté.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/scenes/${sceneId}/corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          element_id: target.elementId,
          correction_type: correctionType,
          original_value: target.ir ?? null,
          corrected_value: {
            reported_from: "scene3d_viewer",
            element_label: target.label,
            correction_type: correctionType,
            notes: notes.trim(),
          },
          notes: notes.trim(),
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
      setError("Erreur réseau.");
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="scene-correction-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-[#27272A] bg-[#18181B] p-6 shadow-lg shadow-black/40">
        <h2 id="scene-correction-title" className="font-display text-lg font-semibold text-[#FAFAFA]">
          Signaler une correction
        </h2>
        <p className="mt-1 text-sm text-[#A1A1AA]">
          Élément : <span className="text-[#FAFAFA]">{target.label}</span>
        </p>

        <label className="mt-5 block text-xs font-medium text-[#A1A1AA]">Type de correction</label>
        <select
          value={correctionType}
          onChange={(e) => setCorrectionType(e.target.value as typeof correctionType)}
          className="mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]"
        >
          {CORRECTION_TYPES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        <label className="mt-4 block text-xs font-medium text-[#A1A1AA]">Description</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Ex : l'épaisseur du mur est de 25 cm sur le plan, pas 18 cm."
          className="mt-1 w-full resize-none rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]"
        />

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
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#EA580C] disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}
