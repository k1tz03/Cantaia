"use client";

import {
  DollarSign,
  FileSearch,
  Calendar,
  Mail,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface DimensionStat {
  count: number;
  threshold: number;
}

interface IntelligenceScoreProps {
  dimensions: Record<string, DimensionStat>;
  loading?: boolean;
}

interface DimensionConfig {
  key: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  barColor: string;
}

const DIMENSION_CONFIGS: DimensionConfig[] = [
  {
    key: "prices",
    icon: DollarSign,
    color: "text-emerald-600",
    bgColor: "bg-emerald-500/10",
    barColor: "bg-emerald-500",
  },
  {
    key: "plans",
    icon: FileSearch,
    color: "text-blue-600",
    bgColor: "bg-blue-500/10",
    barColor: "bg-blue-500",
  },
  {
    key: "planning",
    icon: Calendar,
    color: "text-purple-600",
    bgColor: "bg-purple-500/10",
    barColor: "bg-purple-500",
  },
  {
    key: "emails",
    icon: Mail,
    color: "text-amber-600",
    bgColor: "bg-amber-500/10",
    barColor: "bg-amber-500",
  },
  {
    key: "suppliers",
    icon: Building2,
    color: "text-rose-600",
    bgColor: "bg-rose-500/10",
    barColor: "bg-rose-500",
  },
];

function computeScore(count: number, threshold: number): number {
  return Math.min(20, Math.round((count / threshold) * 20));
}

function ScoreSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-center">
        <div className="h-16 w-16 rounded-full bg-muted" />
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="h-2 w-full rounded-full bg-muted" />
          </div>
          <div className="h-3 w-8 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export default function IntelligenceScore({
  dimensions,
  loading,
}: IntelligenceScoreProps) {
  const t = useTranslations("dashboard.intelligence");

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <ScoreSkeleton />
      </div>
    );
  }

  const totalScore = DIMENSION_CONFIGS.reduce((sum, cfg) => {
    const dim = dimensions[cfg.key];
    if (!dim) return sum;
    return sum + computeScore(dim.count, dim.threshold);
  }, 0);

  const scoreColor =
    totalScore >= 80
      ? "text-emerald-600"
      : totalScore >= 50
        ? "text-blue-600"
        : totalScore >= 25
          ? "text-amber-600"
          : "text-muted-foreground";

  const ringColor =
    totalScore >= 80
      ? "border-emerald-200 dark:border-emerald-800"
      : totalScore >= 50
        ? "border-blue-200 dark:border-blue-800"
        : totalScore >= 25
          ? "border-amber-200 dark:border-amber-800"
          : "border-border";

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">
        {t("scoreTitle")}
      </h3>

      {/* Total score circle */}
      <div className="flex flex-col items-center mb-5">
        <div
          className={`flex h-[72px] w-[72px] items-center justify-center rounded-full border-[3px] ${ringColor}`}
        >
          <div className="text-center">
            <div className={`font-display text-2xl font-bold ${scoreColor}`}>
              {totalScore}
            </div>
            <div className="text-[9px] text-muted-foreground -mt-0.5">/100</div>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {totalScore >= 80
            ? t("levelExpert")
            : totalScore >= 50
              ? t("levelIntermediate")
              : totalScore >= 25
                ? t("levelBeginner")
                : t("levelStarting")}
        </p>
      </div>

      {/* Dimensions */}
      <div className="space-y-3">
        {DIMENSION_CONFIGS.map((cfg) => {
          const dim = dimensions[cfg.key];
          if (!dim) return null;
          const score = computeScore(dim.count, dim.threshold);
          const pct = Math.min(100, (dim.count / dim.threshold) * 100);
          const Icon = cfg.icon;

          return (
            <div key={cfg.key} className="flex items-center gap-3">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.bgColor}`}
              >
                <Icon className={`h-4 w-4 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground">
                    {t(`dim_${cfg.key}`)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {score}/20
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div
                    className={`h-1.5 rounded-full ${cfg.barColor} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {dim.count}/{dim.threshold}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
