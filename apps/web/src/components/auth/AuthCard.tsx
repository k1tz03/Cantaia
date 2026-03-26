"use client";

import { type ReactNode } from "react";
import { useTranslations } from "next-intl";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  const t = useTranslations("auth");

  return (
    <div className="flex w-full max-w-[440px] flex-col items-center">
      {/* Card */}
      <div className="w-full rounded-[20px] border border-[#27272A] bg-[#18181B] px-9 py-10 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_4px_24px_rgba(0,0,0,0.4),0_12px_48px_rgba(0,0,0,0.25)]">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-[42px] w-[42px] items-center justify-center rounded-[10px] bg-gradient-to-br from-[#F97316] to-[#EA580C] font-display text-[22px] font-extrabold text-white shadow-[0_2px_12px_rgba(249,115,22,0.3)]">
            C
          </div>
          <span className="font-display text-[26px] font-bold tracking-[-0.5px] text-[#FAFAFA]">
            Cantaia
          </span>
        </div>

        {/* Title */}
        <h1 className="mb-2 text-center font-display text-2xl font-bold text-[#FAFAFA]">
          {title}
        </h1>

        {/* Subtitle */}
        {subtitle && (
          <p className="mb-7 text-center text-sm leading-relaxed text-[#A1A1AA]">
            {subtitle}
          </p>
        )}

        {children}

        {footer}
      </div>

      {/* Trust badges */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
        <span className="flex items-center gap-1 text-xs text-[#71717A]">
          🔒 {t("trustAes")}
        </span>
        <span className="mx-1 text-[10px] text-[#52525B]">&middot;</span>
        <span className="flex items-center gap-1 text-xs text-[#71717A]">
          🇨🇭 {t("trustSwiss")}
        </span>
        <span className="mx-1 text-[10px] text-[#52525B]">&middot;</span>
        <span className="flex items-center gap-1 text-xs text-[#71717A]">
          🇪🇺 {t("trustEurope")}
        </span>
      </div>
    </div>
  );
}
