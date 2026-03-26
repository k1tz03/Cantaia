"use client";

import { useTranslations } from "next-intl";
import { signInWithMicrosoftAction } from "@/app/[locale]/(auth)/actions";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

interface MicrosoftButtonProps {
  label?: string;
}

export function MicrosoftButton({ label }: MicrosoftButtonProps) {
  const t = useTranslations("auth");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    startTransition(async () => {
      const result = await signInWithMicrosoftAction();
      if (result.error) {
        setError(result.error);
      } else if (result.url) {
        window.location.href = result.url;
      }
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#27272A] bg-[#18181B] text-sm font-medium text-[#FAFAFA] transition-all hover:border-[#F97316]/30 hover:bg-[#1C1C1F] hover:shadow-[0_0_0_1px_rgba(249,115,22,0.08)] disabled:opacity-50"
      >
        {isPending ? (
          <Loader2 className="h-5 w-5 animate-spin text-[#F97316]" />
        ) : (
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 21 21" fill="none">
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
          </svg>
        )}
        {label || t("loginWithMicrosoft")}
      </button>
      {error && (
        <p className="mt-2 text-center text-sm text-[#EF4444]">{error}</p>
      )}
    </div>
  );
}
