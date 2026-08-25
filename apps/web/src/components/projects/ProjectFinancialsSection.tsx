"use client";

import { useCallback, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Loader2, CheckCircle2, DollarSign, AlertTriangle } from "lucide-react";

interface ProjectFinancialsSectionProps {
  projectId: string;
}

interface FinancialStats {
  invoiced_amount: number | null;
  purchase_costs: number | null;
  total_labor_hours: number;
  total_machine_hours: number;
  total_workers: number;
  total_delivery_notes: number;
  total_reports: number;
  hourly_rate: number | null;
  machine_rate: number | null;
  machine_valued: boolean;
  labor_cost: number;
  machine_cost: number;
  margin: number;
  margin_pct: number | null;
  hours_per_thousand: number;
}

function chf(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
  return amount.toLocaleString("fr-CH", { maximumFractionDigits: 0 });
}

/**
 * Project P&L block on the closure tab.
 *
 * The margin is NO LONGER recomputed here. This component used to display
 * `invoiced - costs` straight from the two inputs, which meant the closure tab,
 * /api/projects/[id]/financials and /api/direction/stats each published a
 * different number for the same project — and none of them subtracted labour.
 * The server (via @cantaia/core/financials) is the only place that computes it.
 */
export function ProjectFinancialsSection({ projectId }: ProjectFinancialsSectionProps) {
  const t = useTranslations("direction");
  const [invoiced, setInvoiced] = useState("");
  const [costs, setCosts] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<FinancialStats | null>(null);

  const loadStats = useCallback(
    async (syncInputs: boolean) => {
      const res = await fetch(`/api/projects/${projectId}/financials`);
      if (!res.ok) throw new Error(String(res.status));
      const data: FinancialStats = await res.json();
      setStats(data);
      if (syncInputs) {
        if (data.invoiced_amount !== null && data.invoiced_amount !== undefined) {
          setInvoiced(String(data.invoiced_amount));
        }
        if (data.purchase_costs !== null && data.purchase_costs !== undefined) {
          setCosts(String(data.purchase_costs));
        }
      }
      return data;
    },
    [projectId],
  );

  useEffect(() => {
    loadStats(true)
      .catch(() => setError("Impossible de charger les données financières."))
      .finally(() => setLoading(false));
  }, [loadStats]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/financials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiced_amount: invoiced ? parseFloat(invoiced) : 0,
          purchase_costs: costs ? parseFloat(costs) : 0,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSaved(true);
      // Re-read: the margin depends on server-side labour valuation.
      await loadStats(false);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("L'enregistrement a échoué.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#F97316]" /></div>;
  }

  const hasInvoiced = (stats?.invoiced_amount ?? 0) > 0;
  const margin = stats?.margin ?? null;
  const marginPct = stats?.margin_pct ?? null;

  return (
    <div className="rounded-lg border border-[#27272A] p-6 space-y-6">
      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-[#F97316]" />
        <h3 className="text-base font-semibold text-[#FAFAFA]">{t("closeProject")}</h3>
      </div>
      <p className="text-sm text-[#A1A1AA]">{t("closureNote")}</p>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-[#EF4444]/40 bg-[#EF4444]/10 px-3 py-2 text-sm text-[#FCA5A5]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-[#A1A1AA] mb-1">{t("invoicedAmount")} (CHF)</label>
          <input
            type="number"
            value={invoiced}
            onChange={(e) => setInvoiced(e.target.value)}
            className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA]"
            placeholder="0.00"
            step="0.01"
            min="0"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#A1A1AA] mb-1">{t("purchaseCosts")} (CHF)</label>
          <input
            type="number"
            value={costs}
            onChange={(e) => setCosts(e.target.value)}
            className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA]"
            placeholder="0.00"
            step="0.01"
            min="0"
          />
        </div>
      </div>

      {/* Cost base — the labour line the margin was blind to until now */}
      {stats && (
        <>
          <p className="text-xs text-[#A1A1AA]">{t("marginFormula")}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-md bg-[#27272A]/50 p-3">
              <p className="text-xs text-[#A1A1AA]">{t("totalHours")}</p>
              <p className="text-lg font-bold text-[#FAFAFA]">{stats.total_labor_hours.toFixed(1)}h</p>
              {stats.hourly_rate !== null && (
                <p className="text-[11px] text-[#A1A1AA] mt-0.5">
                  {t("hourlyRateUsed")} : {chf(stats.hourly_rate)} CHF/h
                </p>
              )}
            </div>
            <div className="rounded-md bg-[#27272A]/50 p-3">
              <p className="text-xs text-[#A1A1AA]">{t("laborCost")}</p>
              <p className="text-lg font-bold text-[#F97316]">CHF {chf(stats.labor_cost)}</p>
            </div>
            <div className="rounded-md bg-[#27272A]/50 p-3">
              <p className="text-xs text-[#A1A1AA]">{t("machineHours")}</p>
              <p className="text-lg font-bold text-[#FAFAFA]">{stats.total_machine_hours.toFixed(1)}h</p>
            </div>
            <div className="rounded-md bg-[#27272A]/50 p-3">
              <p className="text-xs text-[#A1A1AA]">{t("machineCost")}</p>
              {stats.machine_valued ? (
                <p className="text-lg font-bold text-[#FAFAFA]">CHF {chf(stats.machine_cost)}</p>
              ) : (
                <p className="text-[11px] text-[#FCD34D] mt-1">{t("machineNotValued")}</p>
              )}
            </div>
          </div>

          {/* Margin — server-computed */}
          {hasInvoiced && margin !== null ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-md bg-[#27272A]/50 p-3">
                <p className="text-xs text-[#A1A1AA]">{t("margin")}</p>
                <p className={`text-lg font-bold ${margin >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
                  CHF {chf(margin)}
                </p>
              </div>
              <div className="rounded-md bg-[#27272A]/50 p-3">
                <p className="text-xs text-[#A1A1AA]">{t("marginPct")}</p>
                <p className={`text-lg font-bold ${(marginPct ?? 0) >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
                  {marginPct === null ? "—" : `${marginPct.toFixed(1)}%`}
                </p>
              </div>
              <div className="rounded-md bg-[#27272A]/50 p-3">
                <p className="text-xs text-[#A1A1AA]">{t("hoursPerThousand")}</p>
                <p className="text-lg font-bold text-[#FAFAFA]">{stats.hours_per_thousand.toFixed(1)}</p>
              </div>
              <div className="rounded-md bg-[#27272A]/50 p-3">
                <p className="text-xs text-[#A1A1AA]">{t("totalWorkers")}</p>
                <p className="text-lg font-bold text-[#FAFAFA]">{stats.total_workers}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#A1A1AA]">{t("marginPending")}</p>
          )}
        </>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-[#0F0F11] hover:bg-[#EA580C] disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("save")}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-[#22C55E]">
            <CheckCircle2 className="h-4 w-4" />
            {t("saved")}
          </span>
        )}
      </div>
    </div>
  );
}
