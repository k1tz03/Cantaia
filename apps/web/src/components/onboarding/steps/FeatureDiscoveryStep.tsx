"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  Mail, FileText, CalendarRange, Bot, ClipboardList,
  Map, Truck, Calculator, HardHat, FileBarChart,
  Newspaper, BarChart3
} from "lucide-react";

interface FeatureDiscoveryStepProps {
  onContinue: () => void;
}

const MODULES = [
  { key: "mail", icon: Mail, color: "#3B82F6" },
  { key: "submissions", icon: FileText, color: "#F97316" },
  { key: "planning", icon: CalendarRange, color: "#10B981" },
  { key: "chat", icon: Bot, color: "#A855F7" },
  { key: "pv", icon: ClipboardList, color: "#EF4444" },
  { key: "plans", icon: Map, color: "#06B6D4" },
  { key: "suppliers", icon: Truck, color: "#F59E0B" },
  { key: "pricing", icon: Calculator, color: "#EC4899" },
  { key: "portal", icon: HardHat, color: "#14B8A6" },
  { key: "siteReports", icon: FileBarChart, color: "#8B5CF6" },
  { key: "briefing", icon: Newspaper, color: "#22C55E" },
  { key: "direction", icon: BarChart3, color: "#F97316" },
];

export function FeatureDiscoveryStep({ onContinue }: FeatureDiscoveryStepProps) {
  const t = useTranslations("onboarding.features");
  const tProgress = useTranslations("onboarding.progress");

  return (
    <div className="flex flex-col items-center py-4">
      <motion.div
        className="mb-8 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="font-display text-2xl font-bold text-[#FAFAFA]">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-[#A1A1AA]">{t("subtitle")}</p>
      </motion.div>

      {/* 12-module grid */}
      <div className="grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {MODULES.map((mod, i) => {
          const Icon = mod.icon;
          return (
            <motion.div
              key={mod.key}
              className="group relative rounded-xl border border-[#27272A] bg-[#18181B] p-4 transition-colors hover:border-[#3F3F46]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, type: "spring", stiffness: 300, damping: 30 }}
              whileHover={{ scale: 1.03 }}
            >
              <div
                className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${mod.color}15` }}
              >
                <Icon className="h-5 w-5" style={{ color: mod.color }} />
              </div>
              <h3 className="text-sm font-semibold text-[#FAFAFA]">
                {t(`${mod.key}.title`)}
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-[#71717A]">
                {t(`${mod.key}.description`)}
              </p>
            </motion.div>
          );
        })}
      </div>

      <motion.button
        type="button"
        onClick={onContinue}
        className="mt-8 rounded-xl bg-gradient-to-r from-[#F97316] to-[#EA580C] px-8 py-3 font-medium text-white transition-shadow hover:shadow-lg hover:shadow-[#F97316]/25"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {tProgress("continue")}
      </motion.button>
    </div>
  );
}
