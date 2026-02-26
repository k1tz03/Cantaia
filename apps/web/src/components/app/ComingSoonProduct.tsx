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
      <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mb-6">
        <Icon className="h-10 w-10 text-muted-foreground/50" />
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-foreground mb-2">{t(titleKey)}</h1>

      {/* Description */}
      <p className="text-muted-foreground mb-6">{t(descriptionKey)}</p>

      {/* Estimated date */}
      {estimatedDate && (
        <div className="inline-flex items-center gap-2 bg-muted rounded-full px-4 py-1.5 mb-6">
          <span className="text-sm text-muted-foreground">
            {t("coming_soon.expected")}:{" "}
            <strong>{estimatedDate}</strong>
          </span>
        </div>
      )}

      {/* Planned features */}
      <div className="w-full bg-card border rounded-xl p-5 mb-6 text-left">
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
          {t("coming_soon.planned_features")}
        </h3>
        <ul className="space-y-2.5">
          {features.map((featureKey, i) => (
            <li
              key={i}
              className="flex items-start gap-3 text-sm text-muted-foreground"
            >
              <span className="mt-0.5 h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
              </span>
              {t(featureKey)}
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <button className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
        <Bell className="h-4 w-4" />
        {t("coming_soon.notify_me")}
      </button>
    </div>
  );
}
