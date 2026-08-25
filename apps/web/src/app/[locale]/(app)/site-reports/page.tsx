"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Clock, FileText, Download, ChevronLeft, ChevronRight, Loader2, Link2, Copy, Check,
  RefreshCw, Trash2, Truck, Receipt, Wallet,
} from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { toLocalDateString } from "@/components/calendar/datetime-utils";

interface ShareLink {
  token: string;
  url: string;
  expires_at: string | null;
  project_id: string | null;
}

/**
 * Monday of the week containing `date`, as a LOCAL calendar date.
 * `toISOString()` returns the UTC date and pushed the week one day back for
 * every user east of UTC — in Europe/Zurich the page opened on the previous
 * week for anyone loading it before 02:00 (01:00 in winter).
 */
function getMonday(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return toLocalDateString(d);
}

/** Parse "YYYY-MM-DD" as a local calendar date (never as UTC midnight). */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatWeek(mondayStr: string): string {
  const mon = parseLocalDate(mondayStr);
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  return `${mon.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })} — ${sun.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
}

function shiftWeek(mondayStr: string, delta: number): string {
  const d = parseLocalDate(mondayStr);
  d.setDate(d.getDate() + 7 * delta);
  return toLocalDateString(d);
}

function getDayDates(mondayStr: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = parseLocalDate(mondayStr);
    d.setDate(d.getDate() + i);
    return toLocalDateString(d);
  });
}

function formatDay(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return parseLocalDate(dateStr).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" });
}

function chf(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
  return amount.toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Tab = "hours" | "machines" | "notes";

export default function SiteReportsPage() {
  const t = useTranslations("siteReports");
  const tShare = useTranslations("siteReports.share");
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("hours");
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [projectFilter, setProjectFilter] = useState("");
  const [crewFilter, setCrewFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoursData, setHoursData] = useState<any>(null);
  const [notesData, setNotesData] = useState<any>(null);
  const [exporting, setExporting] = useState(false);
  const [regieBusy, setRegieBusy] = useState<string | null>(null);

  // Share link state
  const [userRole, setUserRole] = useState<string>("");
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [copied, setCopied] = useState(false);
  const [loadingShare, setLoadingShare] = useState(false);

  const canShare =
    ["admin", "director", "project_manager"].includes(userRole) || isSuperadmin;
  /** Payroll output is individual pay data — org admins/directors only. */
  const canExportPayroll = ["admin", "director"].includes(userRole) || isSuperadmin;
  /** Valued hours, CHF columns and régie sheets are management data. */
  const canViewFinancials = canShare;

  // The link matching the current project scope (org-wide when no filter) —
  // derived from the full list so a scoped link survives a reload even when an
  // org-wide link also exists.
  const activeShare = shares.find((s) => (s.project_id || "") === projectFilter) || null;

  // Load every active share link (the API returns them all in `shares`), so the
  // UI can show the one matching the current scope and reflect a revoke.
  const loadShares = useCallback(async () => {
    try {
      const res = await fetch("/api/site-reports/share");
      if (!res.ok) return;
      const data = await res.json();
      setShares(Array.isArray(data?.shares) ? data.shares : []);
    } catch (e) {
      console.error("[site-reports] failed to load share links:", e);
    }
  }, []);

  // Fetch user profile + existing share links on mount (separate to avoid one blocking the other)
  useEffect(() => {
    fetch("/api/user/profile")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const p = data?.profile || data;
        if (p) {
          setUserRole(p.role || "");
          setIsSuperadmin(p.is_superadmin === true);
        }
      })
      .catch(() => {});
    loadShares();
  }, [loadShares]);

  async function handleGenerateShare() {
    setLoadingShare(true);
    try {
      const res = await fetch("/api/site-reports/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Scope the link to the selected project when there is one (migration
        // 100): an unscoped link exposes the WHOLE organisation for 90 days.
        body: JSON.stringify(projectFilter ? { project_id: projectFilter } : {}),
      });
      if (res.ok) {
        await loadShares();
      } else {
        setError(t("shareGenerateFailed"));
      }
    } catch {
      setError(t("shareGenerateFailed"));
    } finally {
      setLoadingShare(false);
    }
  }

  async function handleRevokeShare() {
    if (!confirm(tShare("revokeConfirm"))) return;
    setLoadingShare(true);
    try {
      // Revoke ONLY the current scope — dropping every scope would take down the
      // org-wide link while revoking a single project's link.
      const query = projectFilter ? `?project_id=${encodeURIComponent(projectFilter)}` : "";
      const res = await fetch(`/api/site-reports/share${query}`, { method: "DELETE" });
      if (res.ok) await loadShares();
    } catch {
      /* ignore */
    } finally {
      setLoadingShare(false);
    }
  }

  function handleCopyLink() {
    if (!activeShare?.url) return;
    navigator.clipboard.writeText(activeShare.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("week_start", weekStart);
      if (projectFilter) params.set("project_id", projectFilter);

      let endpoint: string;
      if (activeTab === "notes") {
        if (supplierFilter) params.set("supplier_id", supplierFilter);
        endpoint = `/api/site-reports/delivery-notes?${params}`;
      } else {
        // Hours and machines come from the same payload.
        if (crewFilter) params.set("crew_member_id", crewFilter);
        endpoint = `/api/site-reports/hours?${params}`;
      }

      const res = await fetch(endpoint);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      if (activeTab === "notes") setNotesData(json);
      else setHoursData(json);
    } catch (e) {
      console.error("[SiteReports] Fetch error:", e);
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, weekStart, projectFilter, crewFilter, supplierFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleExport(format: "xlsx" | "pdf") {
    setExporting(true);
    try {
      const endpoint = activeTab === "notes" ? "/api/site-reports/export-notes" : "/api/site-reports/export-hours";
      const { exportFile } = await import("@/lib/tauri");
      await exportFile(endpoint, {
        method: "POST",
        body: {
          format,
          week_start: weekStart,
          project_id: projectFilter || undefined,
          // Propagate the on-screen filters so the file matches the view.
          crew_member_id: activeTab === "hours" && crewFilter ? crewFilter : undefined,
          supplier_id: activeTab === "notes" && supplierFilter ? supplierFilter : undefined,
        },
        fallbackFilename: `export.${format}`,
      });
    } catch (e) {
      console.error("[SiteReports] Export error:", e);
      setError(t("exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  async function handlePayrollExport() {
    setExporting(true);
    try {
      const { exportFile } = await import("@/lib/tauri");
      await exportFile("/api/site-reports/export-payroll", {
        method: "POST",
        body: {
          week_start: weekStart,
          project_id: projectFilter || undefined,
          crew_member_id: crewFilter || undefined,
        },
        fallbackFilename: `paie_${weekStart}.csv`,
      });
    } catch (e) {
      console.error("[SiteReports] Payroll export error:", e);
      setError(t("payrollExportFailed"));
    } finally {
      setExporting(false);
    }
  }

  async function handleRegie(reportId: string) {
    setRegieBusy(reportId);
    try {
      const { exportFile } = await import("@/lib/tauri");
      await exportFile("/api/site-reports/regie", {
        method: "POST",
        body: { report_id: reportId },
        fallbackFilename: "bon-de-regie.pdf",
      });
    } catch (e) {
      console.error("[SiteReports] Régie export error:", e);
      setError(t("regieFailed"));
    } finally {
      setRegieBusy(null);
    }
  }

  const projects = hoursData?.projects || notesData?.projects || [];
  const dayDates = getDayDates(weekStart);
  const totals = hoursData?.totals;
  const DAY_LABELS = [t("dayMon"), t("dayTue"), t("dayWed"), t("dayThu"), t("dayFri"), t("daySat"), t("daySun")];

  return (
    <div className="min-h-full bg-[#0F0F11] mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-extrabold text-[#FAFAFA]">{t("title")}</h1>
          <p className="text-sm text-[#A1A1AA]">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport("xlsx")}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#27272A] px-3 py-2 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A] disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> {t("exportExcel")}
          </button>
          <button
            onClick={() => handleExport("pdf")}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#27272A] px-3 py-2 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A] disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> {t("exportPdf")}
          </button>
          {canExportPayroll && (
            <button
              onClick={handlePayrollExport}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#F97316] px-3 py-2 text-sm font-medium text-[#0F0F11] hover:bg-[#EA580C] disabled:opacity-50"
            >
              <Wallet className="h-4 w-4" /> {t("exportPayroll")}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#FCA5A5]">
          {error}
        </div>
      )}

      {/* Share link section — visible only for admin/director/PM/superadmin */}
      {canShare && (
        <div className="mb-4 rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <div className="flex items-start gap-3">
            <Link2 className="h-5 w-5 text-[#F97316] mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-[#FAFAFA]">{tShare("title")}</h3>

              {!activeShare ? (
                <>
                  <p className="text-sm text-[#A1A1AA] mt-1">{tShare("description")}</p>
                  <button
                    onClick={handleGenerateShare}
                    disabled={loadingShare}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#F97316] px-4 py-2 text-sm font-medium text-[#0F0F11] hover:bg-[#EA580C] disabled:opacity-50 transition-colors"
                  >
                    {loadingShare ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                    {tShare("generate")}
                  </button>
                </>
              ) : (
                <>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0 rounded bg-[#0F0F11] border border-[#27272A] px-3 py-2">
                      <span className="text-sm font-mono text-[#A1A1AA] block truncate">
                        {activeShare.url}
                      </span>
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[#27272A] px-3 py-2 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A] transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 text-[#10B981]" />
                          {tShare("copied")}
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          {tShare("copy")}
                        </>
                      )}
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-[#A1A1AA]">
                      {activeShare.expires_at &&
                        tShare("expiresOn", {
                          date: new Date(activeShare.expires_at).toLocaleDateString("fr-CH", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          }),
                        })}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleGenerateShare}
                        disabled={loadingShare}
                        className="inline-flex items-center gap-1 text-xs text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${loadingShare ? "animate-spin" : ""}`} />
                        {tShare("regenerate")}
                      </button>
                      <button
                        onClick={handleRevokeShare}
                        disabled={loadingShare}
                        className="inline-flex items-center gap-1 text-xs text-[#EF4444] hover:text-[#F87171] transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {tShare("revoke")}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-[#27272A] p-1 w-fit">
        <button
          onClick={() => setActiveTab("hours")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === "hours" ? "bg-[#0F0F11] text-[#FAFAFA] shadow-sm" : "text-[#A1A1AA]"}`}
        >
          <Clock className="h-4 w-4" /> {t("tabHours")}
        </button>
        <button
          onClick={() => setActiveTab("machines")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === "machines" ? "bg-[#0F0F11] text-[#FAFAFA] shadow-sm" : "text-[#A1A1AA]"}`}
        >
          <Truck className="h-4 w-4" /> {t("tabMachines")}
        </button>
        <button
          onClick={() => setActiveTab("notes")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === "notes" ? "bg-[#0F0F11] text-[#FAFAFA] shadow-sm" : "text-[#A1A1AA]"}`}
        >
          <FileText className="h-4 w-4" /> {t("tabNotes")}
        </button>
      </div>

      {/* Week navigation + filters */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => setWeekStart(shiftWeek(weekStart, -1))} className="rounded-md p-1.5 hover:bg-[#27272A]"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-medium text-[#FAFAFA] min-w-[200px] text-center">{formatWeek(weekStart)}</span>
          <button onClick={() => setWeekStart(shiftWeek(weekStart, 1))} className="rounded-md p-1.5 hover:bg-[#27272A]"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <select
          value={projectFilter}
          onChange={e => setProjectFilter(e.target.value)}
          className="rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA]"
        >
          <option value="">{t("allProjects")}</option>
          {projects.map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {activeTab === "hours" && hoursData?.crew && (
          <select
            value={crewFilter}
            onChange={e => setCrewFilter(e.target.value)}
            className="rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA]"
          >
            <option value="">{t("allWorkers")}</option>
            {hoursData.crew.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}{c.role ? ` (${c.role})` : ""}</option>
            ))}
          </select>
        )}
        {activeTab === "notes" && notesData?.suppliers && (
          <select
            value={supplierFilter}
            onChange={e => setSupplierFilter(e.target.value)}
            className="rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA]"
          >
            <option value="">{t("allSuppliers")}</option>
            {notesData.suppliers
              .filter((s: any) => s.supplier_id)
              .map((s: any) => (
                <option key={s.key} value={s.supplier_id}>{s.name} ({s.count})</option>
              ))}
          </select>
        )}
      </div>

      {/* Valued totals — the whole point of the module */}
      {totals && activeTab !== "notes" && (
        <div className="mb-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-3">
            <p className="text-xs text-[#A1A1AA]">{t("totalsHours")}</p>
            <p className="text-xl font-bold text-[#FAFAFA]">{Number(totals.labor_hours || 0).toFixed(1)} h</p>
          </div>
          <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-3">
            <p className="text-xs text-[#A1A1AA]">{t("totalsLaborCost")}</p>
            <p className="text-xl font-bold text-[#F97316]">CHF {chf(totals.labor_cost)}</p>
          </div>
          <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-3">
            <p className="text-xs text-[#A1A1AA]">{t("tabMachines")}</p>
            <p className="text-xl font-bold text-[#FAFAFA]">{Number(totals.machine_hours || 0).toFixed(1)} h</p>
          </div>
          <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-3">
            <p className="text-xs text-[#A1A1AA]">{t("totalsMachineCost")}</p>
            <p className="text-xl font-bold text-[#FAFAFA]">
              {totals.machine_valued ? `CHF ${chf(totals.machine_cost)}` : t("notValued")}
            </p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#F97316]" /></div>
      ) : activeTab === "hours" ? (
        <div className="space-y-6">
          {/* Weekly summary grid */}
          {hoursData?.summary && hoursData.summary.length > 0 && (
            <div className="rounded-lg border border-[#27272A] overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-[#27272A] bg-[#27272A]/50">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-[#A1A1AA]">{t("colWorker")}</th>
                    {DAY_LABELS.map((day, i) => (
                      <th key={day} className="px-3 py-2.5 text-center text-xs font-medium text-[#A1A1AA]">
                        {day}<br /><span className="font-normal">{formatDay(dayDates[i])}</span>
                      </th>
                    ))}
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-[#FAFAFA]">{t("colTotal")}</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-[#FAFAFA]">{t("colAmount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {hoursData.summary.map((row: any, idx: number) => (
                    <tr key={idx} className="border-b border-[#27272A] last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="text-sm font-medium text-[#FAFAFA]">{row.name}</span>
                        {row.role && <span className="text-xs text-[#A1A1AA] ml-1">({row.role})</span>}
                      </td>
                      {dayDates.map(date => (
                        <td key={date} className="px-3 py-2.5 text-center text-sm text-[#FAFAFA]">
                          {row.days[date] ? `${row.days[date].toFixed(1)}` : "—"}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-[#FAFAFA]">{row.total.toFixed(1)}h</td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-[#F97316]">CHF {chf(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Detail table */}
          {hoursData?.hours && hoursData.hours.length > 0 && (
            <div className="rounded-lg border border-[#27272A] overflow-x-auto">
              <div className="px-4 py-3 border-b border-[#27272A] bg-[#27272A]/30">
                <h3 className="text-sm font-semibold text-[#FAFAFA]">{t("detailHours")}</h3>
              </div>
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-[#27272A] bg-[#27272A]/50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{t("colDate")}</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{t("colProject")}</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{t("colWorker")}</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{t("colCfc")}</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{t("colWork")}</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-[#A1A1AA]">{t("colHours")}</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-[#A1A1AA]">{t("colRate")}</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-[#A1A1AA]">{t("colAmount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {hoursData.hours.map((h: any) => (
                    <tr key={h.id} className="border-b border-[#27272A] last:border-0 hover:bg-[#27272A]/20">
                      <td className="px-4 py-2 text-sm text-[#FAFAFA]">{formatDay(h.report_date)}</td>
                      <td className="px-4 py-2 text-sm text-[#FAFAFA]">{h.project_name}</td>
                      <td className="px-4 py-2 text-sm text-[#FAFAFA]">{h.crew_member_name}{h.is_driver ? " 🚐" : ""}</td>
                      <td className="px-4 py-2 text-xs font-mono text-[#A1A1AA]">{h.cfc_code || "—"}</td>
                      <td className="px-4 py-2 text-sm text-[#A1A1AA]">{h.work_description || "—"}</td>
                      <td className="px-4 py-2 text-sm text-right font-medium text-[#FAFAFA]">{h.duration_hours.toFixed(1)}h</td>
                      <td className="px-4 py-2 text-sm text-right text-[#A1A1AA]">{chf(h.rate_chf)}</td>
                      <td className="px-4 py-2 text-sm text-right font-medium text-[#F97316]">{chf(h.amount_chf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Reports of the week — one régie sheet per report */}
          {hoursData?.reports && hoursData.reports.length > 0 && (
            <div className="rounded-lg border border-[#27272A] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#27272A] bg-[#27272A]/30">
                <h3 className="text-sm font-semibold text-[#FAFAFA]">{t("reportsOfWeek")}</h3>
              </div>
              <div className="w-full overflow-x-auto">
                <table className="w-full">
                  <tbody>
                    {hoursData.reports.map((r: any) => (
                      <tr key={r.id} className="border-b border-[#27272A] last:border-0 hover:bg-[#27272A]/20">
                        <td className="px-4 py-2 text-sm text-[#FAFAFA]">{formatDay(r.report_date)}</td>
                        <td className="px-4 py-2 text-sm text-[#FAFAFA]">{r.project_name}</td>
                        <td className="px-4 py-2 text-sm text-[#A1A1AA]">{r.submitted_by || "—"}</td>
                        <td className="px-4 py-2 text-right">
                          {canViewFinancials && (
                            <button
                              onClick={() => handleRegie(r.id)}
                              disabled={regieBusy === r.id}
                              className="inline-flex items-center gap-1.5 rounded-md border border-[#27272A] px-2.5 py-1.5 text-xs font-medium text-[#FAFAFA] hover:bg-[#27272A] disabled:opacity-50"
                            >
                              {regieBusy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}
                              {t("regieSheet")}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(!hoursData?.hours || hoursData.hours.length === 0) && (
            <div className="flex flex-col items-center py-12 text-[#A1A1AA]">
              <Clock className="h-10 w-10 mb-3 opacity-30" />
              <p>{t("emptyHours")}</p>
            </div>
          )}
        </div>
      ) : activeTab === "machines" ? (
        <div className="space-y-6">
          {!totals?.machine_valued && hoursData?.machines?.length > 0 && (
            <div className="rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-4 py-3 text-sm text-[#FCD34D]">
              {t("machineRateMissing")}
            </div>
          )}

          {hoursData?.machine_summary && hoursData.machine_summary.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {hoursData.machine_summary.map((m: any) => (
                <div key={m.description} className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-3">
                  <p className="text-sm font-semibold text-[#FAFAFA]">{m.description}</p>
                  <p className="text-2xl font-bold text-[#FAFAFA] mt-1">{m.hours.toFixed(1)}h</p>
                  <p className="text-xs text-[#A1A1AA]">
                    {m.amount === null ? t("notValued") : `CHF ${chf(m.amount)}`}
                    {m.is_rented ? ` — ${t("colRented")}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}

          {hoursData?.machines && hoursData.machines.length > 0 && (
            <div className="rounded-lg border border-[#27272A] overflow-x-auto">
              <div className="px-4 py-3 border-b border-[#27272A] bg-[#27272A]/30">
                <h3 className="text-sm font-semibold text-[#FAFAFA]">{t("detailMachines")}</h3>
              </div>
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="border-b border-[#27272A] bg-[#27272A]/50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{t("colDate")}</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{t("colProject")}</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{t("colMachine")}</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{t("colCfc")}</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{t("colRented")}</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-[#A1A1AA]">{t("colHours")}</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-[#A1A1AA]">{t("colRate")}</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-[#A1A1AA]">{t("colAmount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {hoursData.machines.map((m: any) => (
                    <tr key={m.id} className="border-b border-[#27272A] last:border-0 hover:bg-[#27272A]/20">
                      <td className="px-4 py-2 text-sm text-[#FAFAFA]">{formatDay(m.report_date)}</td>
                      <td className="px-4 py-2 text-sm text-[#FAFAFA]">{m.project_name}</td>
                      <td className="px-4 py-2 text-sm text-[#FAFAFA]">{m.machine_description}</td>
                      <td className="px-4 py-2 text-xs font-mono text-[#A1A1AA]">{m.cfc_code || "—"}</td>
                      <td className="px-4 py-2 text-sm text-[#A1A1AA]">{m.is_rented ? t("yes") : "—"}</td>
                      <td className="px-4 py-2 text-sm text-right font-medium text-[#FAFAFA]">{m.duration_hours.toFixed(1)}h</td>
                      <td className="px-4 py-2 text-sm text-right text-[#A1A1AA]">{m.rate_chf === null ? "—" : chf(m.rate_chf)}</td>
                      <td className="px-4 py-2 text-sm text-right font-medium text-[#FAFAFA]">{m.amount_chf === null ? "—" : chf(m.amount_chf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(!hoursData?.machines || hoursData.machines.length === 0) && (
            <div className="flex flex-col items-center py-12 text-[#A1A1AA]">
              <Truck className="h-10 w-10 mb-3 opacity-30" />
              <p>{t("emptyMachines")}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Supplier summary */}
          {notesData?.suppliers && notesData.suppliers.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {notesData.suppliers.map((s: any) => (
                <div key={s.key} className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-[#FAFAFA]">{s.name}</p>
                    {s.linked && (
                      <span title={t("supplierLinked")} className="shrink-0 rounded bg-[#10B981]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#34D399]">
                        FK
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-bold text-[#FAFAFA] mt-1">{s.count}</p>
                  <p className="text-xs text-[#A1A1AA]">{s.projects.join(", ")}</p>
                </div>
              ))}
            </div>
          )}

          {/* Notes table */}
          {notesData?.notes && notesData.notes.length > 0 && (
            <div className="rounded-lg border border-[#27272A] overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-[#27272A] bg-[#27272A]/50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{t("colDate")}</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{t("colProject")}</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{t("colNoteNumber")}</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{t("colSupplier")}</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{t("colPhoto")}</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{t("colSubmittedBy")}</th>
                  </tr>
                </thead>
                <tbody>
                  {notesData.notes.map((n: any) => (
                    <tr key={n.id} className="border-b border-[#27272A] last:border-0 hover:bg-[#27272A]/20">
                      <td className="px-4 py-2 text-sm text-[#FAFAFA]">{formatDay(n.report_date)}</td>
                      <td className="px-4 py-2 text-sm text-[#FAFAFA]">{n.project_name}</td>
                      <td className="px-4 py-2 text-sm font-mono text-[#FAFAFA]">{n.note_number || "—"}</td>
                      <td className="px-4 py-2 text-sm text-[#FAFAFA]">
                        {n.supplier_name || "—"}
                        {n.supplier_linked && (
                          <span title={t("supplierLinked")} className="ml-1.5 rounded bg-[#10B981]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#34D399]">FK</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {n.photo_url ? (
                          <a href={n.photo_url} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={n.photo_url} alt="Bon" className="h-10 w-10 rounded object-cover border border-[#27272A]" />
                          </a>
                        ) : (
                          <span className="text-xs text-[#A1A1AA]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-[#A1A1AA]">{n.submitted_by || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(!notesData?.notes || notesData.notes.length === 0) && (
            <div className="flex flex-col items-center py-12 text-[#A1A1AA]">
              <FileText className="h-10 w-10 mb-3 opacity-30" />
              <p>{t("emptyNotes")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
