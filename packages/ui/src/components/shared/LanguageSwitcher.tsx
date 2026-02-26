"use client";

import { cn } from "../../lib/utils";

const languages = [
  { code: "fr", label: "FR" },
  { code: "en", label: "EN" },
  { code: "de", label: "DE" },
] as const;

interface LanguageSwitcherProps {
  currentLocale: string;
  onLocaleChange: (locale: string) => void;
  className?: string;
}

export function LanguageSwitcher({
  currentLocale,
  onLocaleChange,
  className,
}: LanguageSwitcherProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => onLocaleChange(lang.code)}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium transition-colors",
            currentLocale === lang.code
              ? "bg-brand text-white"
              : "text-slate-500 hover:bg-slate-100"
          )}
          aria-label={`Switch to ${lang.label}`}
          aria-current={currentLocale === lang.code ? "true" : undefined}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
