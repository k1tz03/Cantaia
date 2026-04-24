/**
 * RightPanel — 360px side panel. Shows the Inspector when an element is
 * selected, otherwise an empty-state asking the user to pick one.
 */

"use client";

import { useTranslations } from "next-intl";
import { MousePointerClick } from "lucide-react";
import type { SceneElement } from "./types";
import { Inspector } from "./Inspector";

interface RightPanelProps {
  selected: SceneElement | null;
  onCorrect: (elementId: string) => void;
}

export function RightPanel({ selected, onCorrect }: RightPanelProps) {
  const t = useTranslations("scene3d");

  return (
    <aside
      className="w-[360px] flex-shrink-0 border-l border-[#27272A] bg-[#111113] flex flex-col overflow-hidden"
      aria-label={t("rightPanel.aria")}
      aria-live="polite"
    >
      {selected ? (
        <Inspector element={selected} onCorrect={onCorrect} />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-[#27272A] flex items-center justify-center">
            <MousePointerClick className="w-8 h-8 text-[#71717A]" aria-hidden="true" />
          </div>
          <h3 className="mt-4 font-display text-lg font-semibold text-[#FAFAFA]">
            {t("rightPanel.emptyTitle")}
          </h3>
          <p className="mt-2 text-sm text-[#A1A1AA] max-w-xs">
            {t("rightPanel.emptyDesc")}
          </p>
          <ul className="mt-5 space-y-1.5 text-xs text-[#71717A] text-left">
            <li className="flex items-center gap-2">
              <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#27272A] border border-[#3F3F46] text-[#A1A1AA]">
                {t("rightPanel.keyClick")}
              </kbd>
              <span>{t("rightPanel.hintSelect")}</span>
            </li>
            <li className="flex items-center gap-2">
              <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#27272A] border border-[#3F3F46] text-[#A1A1AA]">
                Esc
              </kbd>
              <span>{t("rightPanel.hintDeselect")}</span>
            </li>
          </ul>
        </div>
      )}
    </aside>
  );
}
