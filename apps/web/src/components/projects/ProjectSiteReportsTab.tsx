"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  LifeBuoy, Copy, RefreshCw, Unlock, CheckCircle2,
  Loader2, ClipboardList, X, Users, Wrench, FileText,
  Truck, Clock, MessageSquare, Cloud
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

interface ReportEntry {
  id: string;
  entry_type: "labor" | "machine" | "delivery_note";
  crew_member_id: string | null;
  work_description: string | null;
  duration_hours: number | null;
  is_driver: boolean;
  machine_description: string | null;
  is_rented: boolean;
  note_number: string | null;
  supplier_name: string | null;
  photo_url: string | null;
  portal_crew_members: { name: string; role: string | null } | null;
}

interface ReportDetail {
  report: {
    id: string;
    report_date: string;
    submitted_by_name: string;
    status: string;
    remarks: string | null;
    weather: string | null;
  };
  entries: ReportEntry[];
}

export function ProjectSiteReportsTab({ projectId }: SiteReportsTabProps) {
  const t = useTranslations("portal");
  const [config, setConfig] = useState<any>(null);
  const [reports, setReports] = useState<SiteReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Detail modal
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  async function fetchReportDetail(reportId: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/site-reports/${reportId}`);
      if (res.ok) {
        const data = await res.json();
        setDetail(data);
      }
    } catch (e) {
      console.error("[SiteReports] Detail fetch error:", e);
    } finally {
      setDetailLoading(false);
    }
  }

  function openDetail(reportId: string) {
    setSelectedReportId(reportId);
    setDetail(null);
    fetchReportDetail(reportId);
  }

  function closeDetail() {
    setSelectedReportId(null);
    setDetail(null);
  }

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
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#F97316]" /></div>;
  }

  const isEnabled = config?.portal_enabled;

  // Group labor entries by crew member for the detail view
  function groupLaborByWorker(entries: ReportEntry[]) {
    const laborEntries = entries.filter(e => e.entry_type === "labor");
    const grouped: Record<string, { name: string; role: string | null; is_driver: boolean; lines: { description: string; hours: number }[] }> = {};
    for (const entry of laborEntries) {
      const key = entry.crew_member_id || "unknown";
      if (!grouped[key]) {
        grouped[key] = {
          name: entry.portal_crew_members?.name || "—",
          role: entry.portal_crew_members?.role || null,
          is_driver: false,
          lines: [],
        };
      }
      if (entry.is_driver) grouped[key].is_driver = true;
      grouped[key].lines.push({
        description: entry.work_description || "—",
        hours: Number(entry.duration_hours) || 0,
      });
    }
    return Object.values(grouped);
  }

  return (
    <div className="space-y-6">
      {/* Portal Config Section */}
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-5">
        <h3 className="text-base font-semibold text-[#FAFAFA] mb-4 flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-[#F97316]" />
          {t("configPortal")}
        </h3>

        {/* Toggle */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-[#FAFAFA]">{t("enablePortal")}</span>
          <button
            onClick={() => togglePortal(!isEnabled)}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isEnabled ? "bg-[#F97316]" : "bg-[#27272A]"}`}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white transition-transform ${isEnabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>

        {isEnabled && (
          <div className="space-y-4">
            {/* Link */}
            <div>
              <label className="text-xs font-medium text-[#71717A] uppercase mb-1 block">{t("shareLink")}</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={config?.portal_url || ""}
                  className="flex-1 rounded-md border border-[#27272A] bg-[#27272A] px-3 py-2 text-sm text-[#FAFAFA] font-mono"
                />
                <button onClick={copyLink} className="rounded-md border border-[#27272A] px-3 py-2 text-sm hover:bg-[#27272A]">
                  {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* PIN */}
            <div>
              <label className="text-xs font-medium text-[#71717A] uppercase mb-1 block">{t("pinCode")}</label>
              <div className="flex items-center gap-3">
                {pin ? (
                  <span className="text-2xl font-mono font-bold tracking-[0.3em] text-[#FAFAFA]">{pin}</span>
                ) : (
                  <span className="text-sm text-[#71717A]">••••••</span>
                )}
                <button
                  onClick={regeneratePin}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-xs font-medium hover:bg-[#27272A]"
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
              <label className="text-xs font-medium text-[#71717A] uppercase mb-1 block">{t("selectSubmission")}</label>
              <select
                value={config?.portal_submission_id || ""}
                onChange={e => updateConfig("portal_submission_id", e.target.value || null)}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA]"
              >
                <option value="">— {t("noSubmission")} —</option>
                {(config?.submissions || []).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.title || s.reference || s.id}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-[#71717A] uppercase mb-1 block">{t("portalDescription")}</label>
              <textarea
                defaultValue={config?.portal_description || ""}
                onBlur={e => updateConfig("portal_description", e.target.value)}
                rows={3}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] resize-none"
                placeholder="Instructions pour le chef d'équipe..."
              />
            </div>
          </div>
        )}
      </div>

      {/* Reports List Section */}
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-5">
        <h3 className="text-base font-semibold text-[#FAFAFA] mb-4 flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-[#F97316]" />
          {t("siteReports")}
          <span className="text-sm font-normal text-[#71717A]">({reports.length})</span>
        </h3>

        {reports.length === 0 ? (
          <p className="text-sm text-[#71717A] text-center py-8">Aucun rapport reçu</p>
        ) : (
          <div className="rounded-lg border border-[#27272A] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#27272A] bg-[#27272A]/50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#71717A]">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#71717A]">Chef d'équipe</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-[#71717A]">Statut</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-[#71717A]">Ouvriers</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-[#71717A]">Heures</th>
                  <th className="px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {reports.map(report => (
                  <tr
                    key={report.id}
                    className="border-b border-[#27272A] last:border-0 hover:bg-[#27272A]/30 cursor-pointer transition-colors"
                    onClick={() => openDetail(report.id)}
                  >
                    <td className="px-4 py-2.5 text-sm text-[#FAFAFA]">
                      {new Date(report.report_date).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-[#FAFAFA]">{report.submitted_by_name || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        report.status === "draft" ? "bg-[#27272A] text-[#71717A]" :
                        report.status === "submitted" ? "bg-green-500/10 text-green-400" :
                        "bg-[#F97316]/10 text-[#F97316]"
                      }`}>
                        {t(report.status as any)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-right text-[#FAFAFA]">{report.workers_count}</td>
                    <td className="px-4 py-2.5 text-sm text-right text-[#FAFAFA]">{report.total_hours.toFixed(1)}h</td>
                    <td className="px-4 py-2.5">
                      {report.status === "submitted" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleReportLock(report.id, report.status); }}
                          className="text-[#71717A] hover:text-[#FAFAFA]"
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

      {/* Report Detail Modal */}
      {selectedReportId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeDetail}>
          <div
            className="bg-[#0F0F11] rounded-xl shadow-xl border border-[#27272A] w-full max-w-2xl max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {detailLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" />
              </div>
            ) : detail ? (
              <ReportDetailContent
                detail={detail}
                groupLaborByWorker={groupLaborByWorker}
                onClose={closeDetail}
                t={t}
              />
            ) : (
              <div className="p-6 text-center text-sm text-[#71717A]">
                Erreur de chargement
                <button onClick={closeDetail} className="block mx-auto mt-4 text-[#F97316] hover:underline">Fermer</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReportDetailContent({
  detail,
  groupLaborByWorker,
  onClose,
  t,
}: {
  detail: ReportDetail;
  groupLaborByWorker: (entries: ReportEntry[]) => { name: string; role: string | null; is_driver: boolean; lines: { description: string; hours: number }[] }[];
  onClose: () => void;
  t: any;
}) {
  const { report, entries } = detail;
  const laborGroups = groupLaborByWorker(entries);
  const machineEntries = entries.filter(e => e.entry_type === "machine");
  const deliveryEntries = entries.filter(e => e.entry_type === "delivery_note");
  const totalHours = laborGroups.reduce((sum, g) => sum + g.lines.reduce((s, l) => s + l.hours, 0), 0);
  const machineHours = machineEntries.reduce((sum, e) => sum + Number(e.duration_hours || 0), 0);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#27272A] px-5 py-4">
        <div>
          <h3 className="text-base font-semibold text-[#FAFAFA]">
            Rapport du {new Date(report.report_date).toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </h3>
          <p className="text-sm text-[#71717A] mt-0.5">
            {report.submitted_by_name || "—"}
            <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              report.status === "draft" ? "bg-[#27272A] text-[#71717A]" :
              report.status === "submitted" ? "bg-green-500/10 text-green-400" :
              "bg-[#F97316]/10 text-[#F97316]"
            }`}>
              {t(report.status as any)}
            </span>
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 hover:bg-[#27272A] text-[#71717A]">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Weather */}
        {report.weather && (
          <div className="flex items-start gap-3 rounded-lg bg-[#27272A]/50 px-4 py-3">
            <Cloud className="h-4 w-4 text-[#71717A] mt-0.5 shrink-0" />
            <p className="text-sm text-[#FAFAFA]">{report.weather}</p>
          </div>
        )}

        {/* Summary bar */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-[#27272A] bg-[#27272A]/30 px-3 py-2.5 text-center">
            <div className="text-lg font-semibold text-[#FAFAFA]">{laborGroups.length}</div>
            <div className="text-xs text-[#71717A]">{t("workers")}</div>
          </div>
          <div className="rounded-lg border border-[#27272A] bg-[#27272A]/30 px-3 py-2.5 text-center">
            <div className="text-lg font-semibold text-[#FAFAFA]">{totalHours.toFixed(1)}h</div>
            <div className="text-xs text-[#71717A]">{t("totalHours")}</div>
          </div>
          <div className="rounded-lg border border-[#27272A] bg-[#27272A]/30 px-3 py-2.5 text-center">
            <div className="text-lg font-semibold text-[#FAFAFA]">{machineEntries.length}</div>
            <div className="text-xs text-[#71717A]">{t("machines")}</div>
          </div>
        </div>

        {/* Labor entries grouped by worker */}
        {laborGroups.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-[#FAFAFA] mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-[#F97316]" />
              {t("personnel")} ({laborGroups.length})
            </h4>
            <div className="space-y-2">
              {laborGroups.map((group, gi) => {
                const workerHours = group.lines.reduce((s, l) => s + l.hours, 0);
                return (
                  <div key={gi} className="rounded-lg border border-[#27272A] bg-[#0F0F11] overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-[#27272A]/30">
                      <span className="text-sm font-medium text-[#FAFAFA]">{group.name}</span>
                      {group.role && <span className="text-xs text-[#71717A]">{group.role}</span>}
                      {group.is_driver && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#F97316]/10 text-[#F97316] px-2 py-0.5 text-xs">
                          <Truck className="h-3 w-3" />
                          {t("driver")}
                        </span>
                      )}
                      <span className="ml-auto text-xs font-medium text-[#71717A] flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {workerHours.toFixed(1)}h
                      </span>
                    </div>
                    <div className="divide-y divide-border">
                      {group.lines.map((line, li) => (
                        <div key={li} className="flex items-center justify-between px-4 py-2">
                          <span className="text-sm text-[#FAFAFA]">{line.description}</span>
                          <span className="text-sm font-medium text-[#FAFAFA] whitespace-nowrap ml-4">{line.hours.toFixed(1)}h</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Machine entries */}
        {machineEntries.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-[#FAFAFA] mb-3 flex items-center gap-2">
              <Wrench className="h-4 w-4 text-[#F97316]" />
              {t("machines")} ({machineEntries.length})
              <span className="ml-auto text-xs font-normal text-[#71717A]">{machineHours.toFixed(1)}h total</span>
            </h4>
            <div className="rounded-lg border border-[#27272A] overflow-hidden divide-y divide-border">
              {machineEntries.map((entry, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#FAFAFA]">{entry.machine_description || "—"}</span>
                    {entry.is_rented && (
                      <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-400 px-2 py-0.5 text-xs">
                        {t("rented")}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium text-[#FAFAFA]">{Number(entry.duration_hours || 0).toFixed(1)}h</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Delivery notes */}
        {deliveryEntries.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-[#FAFAFA] mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#F97316]" />
              {t("deliveryNotes")} ({deliveryEntries.length})
            </h4>
            <div className="rounded-lg border border-[#27272A] overflow-hidden divide-y divide-border">
              {deliveryEntries.map((entry, i) => (
                <div key={i} className="px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[#FAFAFA]">{entry.note_number || "—"}</span>
                    <span className="text-sm text-[#71717A]">{entry.supplier_name || "—"}</span>
                  </div>
                  {entry.photo_url && (
                    <img
                      src={entry.photo_url}
                      alt={`BL ${entry.note_number}`}
                      className="mt-2 h-24 w-auto rounded-lg object-cover border border-[#27272A]"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Remarks */}
        {report.remarks && (
          <div>
            <h4 className="text-sm font-semibold text-[#FAFAFA] mb-2 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[#F97316]" />
              {t("remarks")}
            </h4>
            <div className="rounded-lg border border-[#27272A] bg-[#27272A]/30 px-4 py-3">
              <p className="text-sm text-[#FAFAFA] whitespace-pre-wrap">{report.remarks}</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {laborGroups.length === 0 && machineEntries.length === 0 && deliveryEntries.length === 0 && !report.remarks && (
          <p className="text-sm text-[#71717A] text-center py-6">Aucune donnée dans ce rapport</p>
        )}
      </div>
    </>
  );
}
