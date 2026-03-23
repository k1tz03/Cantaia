"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  LifeBuoy, Copy, RefreshCw, Unlock, CheckCircle2,
  Loader2, ClipboardList
} from "lucide-react";

interface SiteReportsTabProps {
  projectId: string;
}

interface SiteReport {
  id: string;
  report_date: string;
  submitted_by_name: string;
  status: string;
  workers_count: number;
  total_hours: number;
  created_at: string;
}

export function ProjectSiteReportsTab({ projectId }: SiteReportsTabProps) {
  const t = useTranslations("portal");
  const [config, setConfig] = useState<any>(null);
  const [reports, setReports] = useState<SiteReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function fetchData() {
    setLoading(true);
    try {
      const [configRes, reportsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/portal`),
        fetch(`/api/projects/${projectId}/site-reports`),
      ]);
      if (configRes.ok) setConfig(await configRes.json());
      if (reportsRes.ok) {
        const data = await reportsRes.json();
        setReports(data.reports || []);
      }
    } catch (e) {
      console.error("[SiteReports] Fetch error:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [projectId]);

  async function togglePortal(enabled: boolean) {
    setSaving(true);
    const body: any = { portal_enabled: enabled };
    if (enabled && !config?.portal_enabled) {
      body.generate_pin = true;
    }
    const res = await fetch(`/api/projects/${projectId}/portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.pin) setPin(data.pin);
      await fetchData();
    }
    setSaving(false);
  }

  async function regeneratePin() {
    if (!confirm(t("regenerateConfirm"))) return;
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/portal/regenerate-pin`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setPin(data.pin);
    }
    setSaving(false);
  }

  async function updateConfig(field: string, value: any) {
    await fetch(`/api/projects/${projectId}/portal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  }

  function copyLink() {
    if (config?.portal_url) {
      navigator.clipboard.writeText(config.portal_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function toggleReportLock(reportId: string, currentStatus: string) {
    const newStatus = currentStatus === "submitted" ? "draft" : "locked";
    await fetch(`/api/projects/${projectId}/site-reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchData();
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const isEnabled = config?.portal_enabled;

  return (
    <div className="space-y-6">
      {/* Portal Config Section */}
      <div className="rounded-lg border border-border bg-background p-5">
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-primary" />
          {t("configPortal")}
        </h3>

        {/* Toggle */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-foreground">{t("enablePortal")}</span>
          <button
            onClick={() => togglePortal(!isEnabled)}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isEnabled ? "bg-primary" : "bg-muted"}`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${isEnabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>

        {isEnabled && (
          <div className="space-y-4">
            {/* Link */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">{t("shareLink")}</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={config?.portal_url || ""}
                  className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground font-mono"
                />
                <button onClick={copyLink} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
                  {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* PIN */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">{t("pinCode")}</label>
              <div className="flex items-center gap-3">
                {pin ? (
                  <span className="text-2xl font-mono font-bold tracking-[0.3em] text-foreground">{pin}</span>
                ) : (
                  <span className="text-sm text-muted-foreground">••••••</span>
                )}
                <button
                  onClick={regeneratePin}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("regeneratePin")}
                </button>
              </div>
              {pin && (
                <p className="text-xs text-amber-600 mt-1">Ce code ne sera plus affiché après avoir quitté cette page. Notez-le.</p>
              )}
            </div>

            {/* Submission picker */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">{t("selectSubmission")}</label>
              <select
                value={config?.portal_submission_id || ""}
                onChange={e => updateConfig("portal_submission_id", e.target.value || null)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">— {t("noSubmission")} —</option>
                {(config?.submissions || []).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.title || s.reference || s.id}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase mb-1 block">{t("portalDescription")}</label>
              <textarea
                defaultValue={config?.portal_description || ""}
                onBlur={e => updateConfig("portal_description", e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground resize-none"
                placeholder="Instructions pour le chef d'équipe..."
              />
            </div>
          </div>
        )}
      </div>

      {/* Reports List Section */}
      <div className="rounded-lg border border-border bg-background p-5">
        <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-primary" />
          {t("siteReports")}
          <span className="text-sm font-normal text-muted-foreground">({reports.length})</span>
        </h3>

        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Aucun rapport reçu</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Chef d'équipe</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Statut</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Ouvriers</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground">Heures</th>
                  <th className="px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {reports.map(report => (
                  <tr key={report.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-sm text-foreground">
                      {new Date(report.report_date).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-foreground">{report.submitted_by_name || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        report.status === "draft" ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" :
                        report.status === "submitted" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      }`}>
                        {t(report.status as any)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-foreground">{report.workers_count}</td>
                    <td className="px-4 py-2.5 text-sm text-right text-foreground">{report.total_hours.toFixed(1)}h</td>
                    <td className="px-4 py-2.5">
                      {report.status === "submitted" && (
                        <button
                          onClick={() => toggleReportLock(report.id, report.status)}
                          className="text-muted-foreground hover:text-foreground"
                          title={t("unlock")}
                        >
                          <Unlock className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
