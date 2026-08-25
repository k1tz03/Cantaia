"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ChevronDown, RotateCcw, ArrowLeft } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("nav");
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0F0F11] px-4">
      <div className="w-full max-w-md rounded-xl border border-[#27272A] bg-[#18181B] p-6 shadow-2xl shadow-black/40">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-[#EF4444]/10">
          <AlertTriangle className="h-5 w-5 text-[#EF4444]" />
        </div>

        <h2 className="font-display text-lg font-bold text-[#FAFAFA]">
          {t("errorOccurred")}
        </h2>

        {/* Generic, human-readable copy. The raw exception message used to
            be printed here in full — it was usually meaningless to the
            user and occasionally leaked internals. It now lives in the
            collapsible technical section below. */}
        <p className="mt-2 text-[13px] leading-relaxed text-[#A1A1AA]">
          Une erreur inattendue est survenue de notre côté. Vous pouvez
          réessayer&nbsp;; si le problème persiste, contactez le support.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-[#F97316] px-4 py-2 text-[13px] font-semibold text-[#0F0F11] transition-colors hover:bg-[#EA580C]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("retry")}
          </button>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 rounded-lg border border-[#27272A] px-4 py-2 text-[13px] font-medium text-[#D4D4D8] transition-colors hover:bg-[#27272A] hover:text-[#FAFAFA]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour
          </button>
        </div>

        <div className="mt-5 border-t border-[#27272A] pt-3">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            className="inline-flex items-center gap-1.5 text-[11px] text-[#A1A1AA] transition-colors hover:text-[#D4D4D8]"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${showDetails ? "rotate-180" : ""}`}
            />
            Détails techniques
          </button>
          {showDetails && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#0F0F11] p-3 font-mono text-[11px] leading-relaxed text-[#A1A1AA]">
              {error.message || "Erreur inconnue"}
              {error.digest ? `\n\nDigest : ${error.digest}` : ""}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
