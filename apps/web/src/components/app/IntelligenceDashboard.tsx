"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Brain,
  DollarSign,
  FileSearch,
  FolderKanban,
  Mail,
  Clock,
  Users,
} from "lucide-react";
import IntelligenceScore from "./IntelligenceScore";

interface DimensionStat {
  count: number;
  threshold: number;
}

interface JournalEntry {
  type: string;
  description: string;
  date: string;
}

interface IntelligenceData {
  dimensions: Record<string, DimensionStat>;
  journal: JournalEntry[];
  c2: {
    opted_in: boolean;
    market_prices: number;
    suppliers_scored: number;
  };
  orgCounters: {
    total_prices: number;
    plans_analyzed: number;
    projects_active: number;
    emails_classified: number;
  };
}

const JOURNAL_ICONS: Record<string, { icon: typeof DollarSign; color: string; bg: string }> = {
  price_calibration: { icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
  quantity_correction: { icon: FileSearch, color: "text-blue-600", bg: "bg-blue-50" },
  email_feedback: { icon: Mail, color: "text-amber-600", bg: "bg-amber-50" },
};

function CounterCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: typeof DollarSign;
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-50 bg-gray-50/50 px-3 py-2.5">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bg}`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="min-w-0">
        <div className="font-display text-lg font-bold text-[#111827]">{value}</div>
        <div className="text-[10px] text-[#6B7280] leading-tight">{label}</div>
      </div>
    </div>
  );
}

function formatJournalDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);

  if (diffMin < 60) return `${diffMin}min`;
  if (diffH < 24) return `${diffH}h`;
  if (diffD < 7) return `${diffD}j`;
  return d.toLocaleDateString("fr-CH", { day: "numeric", month: "short" });
}

export default function IntelligenceDashboard() {
  const t = useTranslations("dashboard.intelligence");
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/intelligence/stats")
      .then((r) => {
        if (!r.ok) throw new Error("fetch failed");
        return r.json();
      })
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const emptyDimensions: Record<string, DimensionStat> = {
    prices: { count: 0, threshold: 50 },
    plans: { count: 0, threshold: 10 },
    planning: { count: 0, threshold: 5 },
    emails: { count: 0, threshold: 100 },
    suppliers: { count: 0, threshold: 20 },
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-50 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50">
            <Brain className="h-4 w-4 text-violet-600" />
          </div>
          <h2 className="font-display text-sm font-semibold text-[#111827]">
            {t("title")}
          </h2>
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Left: Intelligence Score */}
          <IntelligenceScore
            dimensions={data?.dimensions || emptyDimensions}
            loading={loading}
          />

          {/* Right: Counters + Journal */}
          <div className="space-y-4">
            {/* Org counters */}
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <h4 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-3">
                {t("orgCountersTitle")}
              </h4>
              {loading ? (
                <div className="grid grid-cols-2 gap-2 animate-pulse">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-16 rounded-lg bg-gray-50" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <CounterCard
                    icon={DollarSign}
                    label={t("counterPrices")}
                    value={data?.orgCounters.total_prices || 0}
                    color="text-emerald-600"
                    bg="bg-emerald-50"
                  />
                  <CounterCard
                    icon={FileSearch}
                    label={t("counterPlans")}
                    value={data?.orgCounters.plans_analyzed || 0}
                    color="text-blue-600"
                    bg="bg-blue-50"
                  />
                  <CounterCard
                    icon={FolderKanban}
                    label={t("counterProjects")}
                    value={data?.orgCounters.projects_active || 0}
                    color="text-purple-600"
                    bg="bg-purple-50"
                  />
                  <CounterCard
                    icon={Mail}
                    label={t("counterEmails")}
                    value={data?.orgCounters.emails_classified || 0}
                    color="text-amber-600"
                    bg="bg-amber-50"
                  />
                </div>
              )}
            </div>

            {/* Learning journal */}
            <div className="rounded-xl border border-gray-100 bg-white p-4">
              <h4 className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider mb-3">
                {t("journalTitle")}
              </h4>
              {loading ? (
                <div className="space-y-3 animate-pulse">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-7 w-7 rounded-full bg-gray-100" />
                      <div className="flex-1 space-y-1">
                        <div className="h-3 w-36 rounded bg-gray-100" />
                        <div className="h-2 w-12 rounded bg-gray-50" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : data?.journal && data.journal.length > 0 ? (
                <div className="space-y-2.5">
                  {data.journal.map((entry, idx) => {
                    const config = JOURNAL_ICONS[entry.type] || {
                      icon: Brain,
                      color: "text-gray-500",
                      bg: "bg-gray-50",
                    };
                    const Icon = config.icon;
                    return (
                      <div
                        key={idx}
                        className="flex items-start gap-2.5"
                      >
                        <div
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${config.bg}`}
                        >
                          <Icon className={`h-3 w-3 ${config.color}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-[#374151] leading-snug">
                            {entry.description}
                          </p>
                          <p className="text-[10px] text-[#9CA3AF] flex items-center gap-1 mt-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {formatJournalDate(entry.date)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-[#9CA3AF] text-center py-3">
                  {t("journalEmpty")}
                </p>
              )}
            </div>

            {/* C2 collective (if opted in) */}
            {data?.c2.opted_in && (
              <div className="rounded-xl border border-violet-100 bg-violet-50/30 p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <Users className="h-3.5 w-3.5 text-violet-600" />
                  <h4 className="text-xs font-semibold text-violet-800">
                    {t("c2Title")}
                  </h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="font-display text-lg font-bold text-violet-700">
                      {data.c2.market_prices}
                    </div>
                    <div className="text-[10px] text-violet-600">
                      {t("c2MarketPrices")}
                    </div>
                  </div>
                  <div>
                    <div className="font-display text-lg font-bold text-violet-700">
                      {data.c2.suppliers_scored}
                    </div>
                    <div className="text-[10px] text-violet-600">
                      {t("c2SuppliersScored")}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
