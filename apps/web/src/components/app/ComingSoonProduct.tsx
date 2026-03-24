"use client";

import { useTranslations } from "next-intl";
import { type LucideIcon, Bell } from "lucide-react";

interface ComingSoonProductProps {
  icon: LucideIcon;
  titleKey: string;
  descriptionKey: string;
  features: string[];
  estimatedDate?: string;
}

export function ComingSoonProduct({
  icon: Icon,
  titleKey,
  descriptionKey,
  features,
  estimatedDate,
}: ComingSoonProductProps) {
  const t = useTranslations();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 max-w-lg mx-auto">
      {/* Icon */}
      <div className="w-20 h-20 rounded-2xl bg-[#27272A] flex items-center justify-center mb-6">
        <Icon className="h-10 w-10 text-[#71717A]/50" />
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-[#FAFAFA] mb-2">{t(titleKey)}</h1>

      {/* Description */}
      <p className="text-[#71717A] mb-6">{t(descriptionKey)}</p>

      {/* Estimated date */}
      {estimatedDate && (
        <div className="inline-flex items-center gap-2 bg-[#27272A] rounded-full px-4 py-1.5 mb-6">
          <span className="text-sm text-[#71717A]">
            {t("coming_soon.expected")}:{" "}
            <strong>{estimatedDate}</strong>
          </span>
        </div>
      )}

      {/* Planned features */}
      <div className="w-full bg-[#18181B] border rounded-xl p-5 mb-6 text-left">
        <h3 className="text-sm font-semibold mb-3 text-[#71717A] uppercase tracking-wide">
          {t("coming_soon.planned_features")}
        </h3>
        <ul className="space-y-2.5">
          {features.map((featureKey, i) => (
            <li
              key={i}
              className="flex items-start gap-3 text-sm text-[#71717A]"
            >
              <span className="mt-0.5 h-5 w-5 rounded-full bg-[#27272A] flex items-center justify-center shrink-0">
                <span className="h-2 w-2 rounded-full bg-[#27272A]-foreground/30" />
              </span>
              {t(featureKey)}
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <button className="inline-flex items-center gap-2 rounded-md border border-[#27272A] bg-[#0F0F11] px-4 py-2 text-sm font-medium text-[#FAFAFA] shadow-sm hover:bg-[#27272A] transition-colors">
        <Bell className="h-4 w-4" />
        {t("coming_soon.notify_me")}
      </button>
    </div>
  );
}
