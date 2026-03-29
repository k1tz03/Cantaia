"use client";

import { useState } from "react";
import { useUpdateChecker } from "@/hooks/useUpdateChecker";
import { UpdateModal } from "./UpdateModal";

/**
 * Bandeau orange discret sous l'AppHeader signalant une mise à jour disponible.
 * S'affiche automatiquement quand useUpdateChecker détecte une nouvelle version.
 */
export function UpdateBanner() {
  const { state, startUpdate, dismissUpdate } = useUpdateChecker();
  const [modalOpen, setModalOpen] = useState(false);

  if (state.status === "idle" || state.status === "error") return null;

  return (
    <>
      <div className="flex items-center gap-3 px-5 py-2 bg-[#F97316]/10 border-b border-[#F97316]/20">
        {/* Dot pulsant */}
        <span className="relative flex-shrink-0">
          <span className="absolute inline-flex h-2 w-2 rounded-full bg-[#F97316] opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#F97316]" />
        </span>

        <p className="flex-1 text-[13px] text-[#A1A1AA]">
          <span className="font-semibold text-[#FAFAFA]">Mise à jour disponible</span>
          {state.newVersion && (
            <>
              {" — version "}
              <code className="text-[11px] bg-[#F97316]/15 text-[#F97316] px-1.5 py-0.5 rounded border border-[#F97316]/25">
                v{state.newVersion}
              </code>
            </>
          )}
        </p>

        <button
          onClick={() => setModalOpen(true)}
          className="flex-shrink-0 text-[12px] font-semibold px-3 py-1 rounded-md bg-[#F97316] text-white hover:bg-[#EA580C] transition-colors"
        >
          Voir les nouveautés
        </button>
        <button
          onClick={dismissUpdate}
          className="flex-shrink-0 text-[12px] text-[#52525B] hover:text-[#71717A] transition-colors"
        >
          Plus tard
        </button>
      </div>

      <UpdateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        updateState={state}
        onUpdate={startUpdate}
        onDismiss={() => { dismissUpdate(); setModalOpen(false); }}
      />
    </>
  );
}
