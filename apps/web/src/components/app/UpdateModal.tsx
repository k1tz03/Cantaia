"use client";

import { CheckCircle, Download, RefreshCw, X, Zap, Bug, Gauge } from "lucide-react";
import type { UpdateState } from "@/hooks/useUpdateChecker";
import { isTauriDesktop } from "@cantaia/core/platform";

interface Props {
  open: boolean;
  onClose: () => void;
  updateState: UpdateState;
  onUpdate: () => void;
  onDismiss: () => void;
}

// Changelog hardcodé — à remplacer par /api/changelog quand on aura un vrai système
const CHANGELOG = [
  { type: "new" as const, text: "Notifications email en temps réel (web + desktop)" },
  { type: "new" as const, text: "Mise à jour automatique avec progression" },
  { type: "fix" as const, text: "Synchronisation Outlook après 2h d'inactivité" },
  { type: "perf" as const, text: "Chargement de la liste des projets 3× plus rapide" },
];

const BADGE_STYLES = {
  new: { bg: "bg-[#F97316]/15 border-[#F97316]/20 text-[#F97316]", label: "Nouveau" },
  fix: { bg: "bg-emerald-500/12 border-emerald-500/20 text-emerald-400", label: "Corrigé" },
  perf: { bg: "bg-blue-500/12 border-blue-500/20 text-blue-400", label: "Perf" },
};

const BADGE_ICONS = { new: Zap, fix: Bug, perf: Gauge };

export function UpdateModal({ open, onClose, updateState, onUpdate, onDismiss }: Props) {
  if (!open) return null;

  const isDesktop = isTauriDesktop();
  const { status, newVersion, progress } = updateState;

  const isDownloading = status === "downloading";
  const isReady = status === "ready";

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-[480px] bg-[#18181B] border border-[#27272A] rounded-2xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.8)]">

        {/* Header */}
        <div className="flex items-start gap-4 p-6 pb-5 border-b border-[#27272A]">
          <div className={[
            "w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0",
            isReady
              ? "bg-emerald-500/15 border border-emerald-500/25"
              : isDownloading
              ? "bg-[#F97316]/15 border border-[#F97316]/25"
              : "bg-gradient-to-br from-[#F97316] to-[#EA580C]",
          ].join(" ")}>
            {isReady ? "✅" : isDownloading ? "⬇️" : "🚀"}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-[#FAFAFA]">
              {isReady
                ? "Mise à jour prête"
                : isDownloading
                ? "Téléchargement en cours…"
                : "Mise à jour disponible"}
            </h2>
            <p className="text-[13px] text-[#71717A] mt-0.5">
              {newVersion && (
                <>
                  Cantaia{" "}
                  <code className="text-[#F97316] font-mono text-[11px]">
                    v{newVersion}
                  </code>
                </>
              )}
              {!isDesktop && " — web"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-[#27272A] hover:bg-[#3F3F46] flex items-center justify-center transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-[#71717A]" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 pb-4">
          {isReady ? (
            /* État : prêt à redémarrer */
            <div className="flex items-start gap-3 bg-emerald-500/6 border border-emerald-500/15 rounded-xl p-4">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-[#FAFAFA] mb-1">Tout est prêt !</p>
                <p className="text-[12px] text-[#71717A] leading-relaxed">
                  {isDesktop
                    ? "La mise à jour est installée. Redémarrez l'application pour commencer à utiliser les nouvelles fonctionnalités."
                    : "La nouvelle version est déployée. Rechargez la page pour en bénéficier."}
                </p>
              </div>
            </div>
          ) : isDownloading ? (
            /* État : téléchargement */
            <div className="space-y-3">
              {[
                { done: true, active: false, text: "Vérification de la signature" },
                { done: false, active: true, text: "Téléchargement en cours…" },
                { done: false, active: false, text: "Installation" },
                { done: false, active: false, text: "Redémarrage" },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3 text-[12px]">
                  <span className={step.done ? "text-emerald-400" : step.active ? "text-[#F97316]" : "text-[#3F3F46]"}>
                    {step.done ? "✓" : step.active ? "⟳" : "○"}
                  </span>
                  <span className={step.done ? "text-[#71717A]" : step.active ? "text-[#FAFAFA]" : "text-[#3F3F46]"}>
                    {step.text}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            /* État : nouveautés */
            <>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#52525B] mb-3">
                Nouveautés
              </p>
              <div className="space-y-2.5">
                {CHANGELOG.map((item, i) => {
                  const style = BADGE_STYLES[item.type];
                  const Icon = BADGE_ICONS[item.type];
                  return (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border flex-shrink-0 ${style.bg}`}>
                        <Icon className="w-2.5 h-2.5" />
                        {style.label}
                      </span>
                      <p className="text-[12px] text-[#A1A1AA] leading-relaxed">{item.text}</p>
                    </div>
                  );
                })}
              </div>

              {!isDesktop && (
                <p className="mt-4 text-[12px] text-[#52525B] bg-[#111113] rounded-lg px-3 py-2 border border-[#1C1C1F]">
                  La mise à jour se fait en rechargeant la page. Vos données sont sauvegardées.
                </p>
              )}
            </>
          )}
        </div>

        {/* Barre de progression (desktop, téléchargement) */}
        {isDownloading && (
          <div className="px-6 pb-4">
            <div className="flex justify-between text-[11px] mb-1.5">
              <span className="text-[#71717A]">Téléchargement…</span>
              <span className="text-[#F97316] font-mono">{progress}%</span>
            </div>
            <div className="h-1 bg-[#27272A] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#F97316] to-[#EA580C] rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className={[
          "flex items-center justify-end gap-3 px-6 py-4 border-t",
          isReady
            ? "bg-emerald-500/5 border-emerald-500/15"
            : "bg-[#111113] border-[#27272A]",
        ].join(" ")}>
          {!isDownloading && !isReady && (
            <button
              onClick={onDismiss}
              className="text-[13px] text-[#71717A] hover:text-[#A1A1AA] transition-colors px-3 py-2"
            >
              Ignorer (7 jours)
            </button>
          )}

          {isDownloading && (
            <span className="text-[12px] text-[#52525B] mr-auto">
              L'app continue de fonctionner…
            </span>
          )}

          {!isDownloading && (
            <button
              onClick={onUpdate}
              className={[
                "flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-lg text-white transition-colors",
                isReady
                  ? "bg-emerald-500 hover:bg-emerald-600"
                  : "bg-[#F97316] hover:bg-[#EA580C]",
              ].join(" ")}
            >
              {isReady ? (
                <>
                  <RefreshCw className="w-4 h-4" />
                  {isDesktop ? "Redémarrer Cantaia" : "Recharger la page"}
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  {isDesktop ? "Mettre à jour maintenant" : "Recharger la page"}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
