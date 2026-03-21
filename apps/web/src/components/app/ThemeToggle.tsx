"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Sun, Moon, Monitor } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@cantaia/ui";

const CYCLE = ["light", "dark", "system"] as const;

interface ThemeToggleProps {
  collapsed?: boolean;
}

export function ThemeToggle({ collapsed }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("nav");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const currentIndex = Math.max(0, CYCLE.indexOf(theme as (typeof CYCLE)[number]));
  const nextIndex = (currentIndex + 1) % CYCLE.length;

  const handleClick = () => setTheme(CYCLE[nextIndex]);

  const Icon = theme === "dark" ? Moon : theme === "system" ? Monitor : Sun;
  const label =
    theme === "dark" ? t("themeDark") : theme === "system" ? t("themeSystem") : t("themeLight");

  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        "text-muted-foreground hover:bg-muted hover:text-foreground",
        collapsed && "justify-center px-0"
      )}
      title={collapsed ? label : undefined}
      aria-label={label}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="flex-1">{label}</span>}
    </button>
  );
}
