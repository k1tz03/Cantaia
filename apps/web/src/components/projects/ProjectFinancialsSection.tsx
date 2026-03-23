"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Loader2, CheckCircle2, DollarSign } from "lucide-react";

interface ProjectFinancialsSectionProps {
  projectId: string;
}

export function ProjectFinancialsSection({ projectId }: ProjectFinancialsSectionProps) {
  const t = useTranslations("direction");
  const [invoiced, setInvoiced] = useState("");
  const [costs, setCosts] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/financials`)
      .then(r => r.json())
      .then(data => {
        if (data.invoiced_amount) setInvoiced(String(data.invoiced_amount));
        if (data.purchase_costs) setCosts(String(data.purchase_costs));
        setStats(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/financials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiced_amount: invoiced ? parseFloat(invoiced) : null,
          purchase_costs: costs ? parseFloat(costs) : null,
        }),
      });
      if (res.ok) {
        setSaved(true);
        // Refresh stats
        const data = await fetch(`/api/projects/${projectId}/financials`).then(r => r.json());
        setStats(data);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {}
    finally { setSaving(false); }
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  const margin = invoiced && costs ? parseFloat(invoiced) - parseFloat(costs) : null;
  const marginPct = invoiced && costs && parseFloat(invoiced) > 0
    ? ((parseFloat(invoiced) - parseFloat(costs)) / parseFloat(invoiced) * 100)
    : null;

  return (
    <div className="rounded-lg border border-border p-6 space-y-6">
      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold text-foreground">{t("closeProject")}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{t("closureNote")}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">{t("invoicedAmount")} (CHF)</label>
          <input
            type="number"
            value={invoiced}
            onChange={(e) => setInvoiced(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            placeholder="0.00"
            step="0.01"
            min="0"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">{t("purchaseCosts")} (CHF)</label>
          <input
            type="number"
            value={costs}
            onChange={(e) => setCosts(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            placeholder="0.00"
            step="0.01"
            min="0"
          />
        </div>
      </div>

      {/* Calculated margin */}
      {margin !== null && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">{t("margin")}</p>
            <p className={`text-lg font-bold ${margin >= 0 ? "text-green-600" : "text-red-600"}`}>
              CHF {margin.toLocaleString("fr-CH", { minimumFractionDigits: 0 })}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">{t("marginPct")}</p>
            <p className={`text-lg font-bold ${(marginPct || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
              {marginPct?.toFixed(1)}%
            </p>
          </div>
          {stats?.total_labor_hours > 0 && (
            <>
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{t("totalHours")}</p>
                <p className="text-lg font-bold text-foreground">{stats.total_labor_hours}h</p>
              </div>
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{t("hoursPerThousand")}</p>
                <p className="text-lg font-bold text-foreground">
                  {invoiced && parseFloat(invoiced) > 0
                    ? (stats.total_labor_hours / (parseFloat(invoiced) / 1000)).toFixed(1)
                    : "\u2014"}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("save")}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            {t("saved")}
          </span>
        )}
      </div>
    </div>
  );
}
