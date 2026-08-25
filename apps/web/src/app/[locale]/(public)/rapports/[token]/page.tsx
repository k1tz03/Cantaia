"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Loader2,
  AlertCircle,
  ExternalLink,
  Clock,
  FileText,
  Download,
  Truck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toLocalDateString } from "@/components/calendar/datetime-utils";

/* ── date helpers (LOCAL calendar, never UTC) ──
 * `new Date(str)` + `toISOString().split("T")[0]` returns the UTC date, which
 * pushed the week one day back in Europe/Zurich before 01:00/02:00 — the exact
 * bug the app site-reports page already fixed. Mirror that here. */

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function getMonday(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return toLocalDateString(d);
}

function getISOWeekNumber(dateStr: string): number {
  const local = parseLocalDate(dateStr);
  const d = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
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

function shortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return parseLocalDate(dateStr).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" });
}

/* ── types ── */

type ErrorType = "revoked" | "expired" | "invalid" | null;

/* ── component ── */

export default function PublicSiteReportsPage() {
  const params = useParams();
  const token = params.token as string;
  const t = useTranslations("siteReports.share");
  const tp = useTranslations("siteReports.public");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const [activeTab, setActiveTab] = useState<"hours" | "notes">("hours");
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [projectFilter, setProjectFilter] = useState("");
  const [crewFilter, setCrewFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [hoursData, setHoursData] = useState<any>(null);
  const [notesData, setNotesData] = useState<any>(null);
  const [orgName, setOrgName] = useState("");
  const [exporting, setExporting] = useState(false);

  const DAY_LABELS = [
    tp("dayMon"), tp("dayTue"), tp("dayWed"), tp("dayThu"), tp("dayFri"), tp("daySat"), tp("daySun"),
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("week_start", weekStart);
      if (projectFilter) params.set("project_id", projectFilter);
      if (activeTab === "hours" && crewFilter) params.set("crew_member_id", crewFilter);
      if (activeTab === "notes" && supplierFilter) params.set("supplier", supplierFilter);
      params.set("type", activeTab);

      const res = await fetch(`/api/site-reports/public/${token}?${params}`);

      if (res.status === 410) {
        const json = await res.json().catch(() => ({}));
        setErrorType(json.reason === "expired" ? "expired" : "revoked");
        setError(json.error || tp("loadError"));
        return;
      }
      if (res.status === 404) {
        setErrorType("invalid");
        setError(tp("loadError"));
        return;
      }
      if (!res.ok) {
        // A real server error is NOT an empty week: show it (don't render the
        // "no hours" empty state and let the reader believe there is no data).
        setError(tp("loadError"));
        return;
      }

      const json = await res.json();
      if (json.org_name) setOrgName(json.org_name);

      if (activeTab === "hours") {
        setHoursData(json);
      } else {
        setNotesData(json);
      }
    } catch {
      setError(tp("loadError"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, weekStart, projectFilter, crewFilter, supplierFilter, activeTab]);

  useEffect(() => {
    if (token) fetchData();
  }, [token, fetchData]);

  async function handleExport(format: "xlsx" | "pdf") {
    setExporting(true);
    try {
      const { exportFile } = await import("@/lib/tauri");
      await exportFile(`/api/site-reports/public/${token}/export`, {
        method: "POST",
        body: {
          format,
          type: activeTab,
          week_start: weekStart,
          project_id: projectFilter || undefined,
          // Reflect the on-screen filters in the exported file.
          crew_member_id: activeTab === "hours" && crewFilter ? crewFilter : undefined,
          supplier: activeTab === "notes" && supplierFilter ? supplierFilter : undefined,
        },
        fallbackFilename: `export.${format}`,
      });
    } catch {
      /* the download helper surfaces its own failure */
    } finally {
      setExporting(false);
    }
  }

  /* ── error states ── */

  if (errorType) {
    const isRevoked = errorType === "revoked";
    const isExpired = errorType === "expired";
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0F0F11]">
        <div className="text-center max-w-md p-8">
          <AlertCircle
            className={`h-16 w-16 mx-auto mb-4 ${isRevoked ? "text-[#EF4444]" : isExpired ? "text-[#F59E0B]" : "text-[#A1A1AA]"}`}
          />
          <h2 className="text-lg font-display font-bold text-[#FAFAFA] mb-2">
            {isRevoked ? t("revoked") : isExpired ? t("expired") : t("invalid")}
          </h2>
          <p className="text-sm text-[#A1A1AA] mb-6">{error}</p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F97316] text-[#0F0F11] text-sm font-medium rounded-lg hover:bg-[#EA580C] transition-colors"
          >
            {t("tryFree")}
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  if (loading && !hoursData && !notesData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0F0F11]">
        <Loader2 className="h-8 w-8 animate-spin text-[#F97316]" />
      </div>
    );
  }

  const projects = hoursData?.projects || notesData?.projects || [];
  const dayDates = getDayDates(weekStart);
  const machineSummary = hoursData?.machine_summary || [];

  return (
    <div className="min-h-screen bg-[#0F0F11]">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-[#09090B]/95 backdrop-blur-xl border-b border-[#27272A] px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-gradient-to-br from-[#F97316] to-[#EA580C] rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">C</span>
            </div>
            <span className="text-lg font-display font-semibold text-[#FAFAFA]">Cantaia</span>
          </div>
          <span className="text-sm text-[#3F3F46] hidden sm:inline">|</span>
          <span className="text-sm text-[#A1A1AA] hidden sm:inline">
            {t("publicTitle")} {orgName ? `— ${orgName}` : ""}
          </span>
        </div>
        <Link
          href="/register"
          className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#F97316] text-[#0F0F11] text-sm font-medium rounded-lg hover:bg-[#EA580C] transition-colors"
        >
          {t("tryFree")}
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </header>

      {/* ── Content ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Tabs + week nav */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex gap-1 rounded-lg bg-[#18181B] p-1 w-fit border border-[#27272A]">
            <button
              onClick={() => setActiveTab("hours")}
              className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "hours"
                  ? "bg-[#F97316] text-[#0F0F11] shadow-sm"
                  : "text-[#A1A1AA] hover:text-[#FAFAFA]"
              }`}
            >
              <Clock className="h-4 w-4" /> {tp("tabHours")}
            </button>
            <button
              onClick={() => setActiveTab("notes")}
              className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "notes"
                  ? "bg-[#F97316] text-[#0F0F11] shadow-sm"
                  : "text-[#A1A1AA] hover:text-[#FAFAFA]"
              }`}
            >
              <FileText className="h-4 w-4" /> {tp("tabNotes")}
            </button>
          </div>

          {/* Week navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekStart(shiftWeek(weekStart, -1))}
              className="rounded-md p-1.5 hover:bg-[#27272A] text-[#A1A1AA]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-[#FAFAFA] min-w-[260px] text-center">
              {tp("weekLabel", {
                week: getISOWeekNumber(weekStart),
                from: shortDate(weekStart),
                to: parseLocalDate(dayDates[6]).toLocaleDateString("fr-CH", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                }),
              })}
            </span>
            <button
              onClick={() => setWeekStart(shiftWeek(weekStart, 1))}
              className="rounded-md p-1.5 hover:bg-[#27272A] text-[#A1A1AA]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filters + export */}
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="rounded-lg border border-[#27272A] bg-[#18181B] px-3 py-2 text-sm text-[#FAFAFA]"
          >
            <option value="">{tp("allProjects")}</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {activeTab === "hours" && hoursData?.crew && (
            <select
              value={crewFilter}
              onChange={(e) => setCrewFilter(e.target.value)}
              className="rounded-lg border border-[#27272A] bg-[#18181B] px-3 py-2 text-sm text-[#FAFAFA]"
            >
              <option value="">{tp("allWorkers")}</option>
              {hoursData.crew.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.role ? ` (${c.role})` : ""}
                </option>
              ))}
            </select>
          )}

          {activeTab === "notes" && notesData?.suppliers && (
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="rounded-lg border border-[#27272A] bg-[#18181B] px-3 py-2 text-sm text-[#FAFAFA]"
            >
              <option value="">{tp("allSuppliers")}</option>
              {notesData.suppliers.map((s: any) => (
                <option key={s.name} value={s.name}>
                  {s.name} ({s.count})
                </option>
              ))}
            </select>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => handleExport("xlsx")}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#27272A] px-3 py-2 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A] disabled:opacity-50 transition-colors"
            >
              <Download className="h-4 w-4" /> Excel
            </button>
            <button
              onClick={() => handleExport("pdf")}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#27272A] px-3 py-2 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A] disabled:opacity-50 transition-colors"
            >
              <Download className="h-4 w-4" /> PDF
            </button>
          </div>
        </div>

        {/* Error banner (a server error must not read as an empty week) */}
        {error && (
          <div className="mb-4 rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#FCA5A5]">
            {error}
          </div>
        )}

        {/* ── Data display ── */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" />
          </div>
        ) : activeTab === "hours" ? (
          <div className="space-y-6">
            {/* Weekly summary grid */}
            {hoursData?.summary && hoursData.summary.length > 0 && (
              <div className="rounded-lg border border-[#27272A] bg-[#18181B] overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="border-b border-[#27272A] bg-[#27272A]/50">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-[#A1A1AA]">
                        {tp("worker")}
                      </th>
                      {DAY_LABELS.map((day, i) => (
                        <th
                          key={i}
                          className="px-3 py-2.5 text-center text-xs font-medium text-[#A1A1AA]"
                        >
                          {day}
                          <br />
                          <span className="font-normal">{shortDate(dayDates[i])}</span>
                        </th>
                      ))}
                      <th className="px-4 py-2.5 text-right text-xs font-bold text-[#FAFAFA]">
                        {tp("total")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {hoursData.summary.map((row: any, idx: number) => (
                      <tr key={idx} className="border-b border-[#27272A] last:border-0">
                        <td className="px-4 py-2.5">
                          <span className="text-sm font-medium text-[#FAFAFA]">{row.name}</span>
                          {row.role && (
                            <span className="text-xs text-[#A1A1AA] ml-1">({row.role})</span>
                          )}
                        </td>
                        {dayDates.map((date) => (
                          <td key={date} className="px-3 py-2.5 text-center text-sm text-[#FAFAFA]">
                            {row.days[date] ? `${row.days[date].toFixed(1)}` : "—"}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right text-sm font-bold text-[#FAFAFA]">
                          {row.total.toFixed(1)}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Machine summary — collected on site and previously never shown */}
            {machineSummary.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {machineSummary.map((m: any) => (
                  <div key={m.description} className="rounded-lg border border-[#27272A] bg-[#18181B] p-3">
                    <div className="flex items-center gap-1.5">
                      <Truck className="h-4 w-4 text-[#A1A1AA]" />
                      <p className="text-sm font-semibold text-[#FAFAFA] truncate">{m.description}</p>
                    </div>
                    <p className="text-2xl font-bold text-[#FAFAFA] mt-1">{m.hours.toFixed(1)}h</p>
                    {m.is_rented && <p className="text-xs text-[#A1A1AA]">{tp("machineRented")}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Detail table */}
            {hoursData?.hours && hoursData.hours.length > 0 && (
              <div className="rounded-lg border border-[#27272A] bg-[#18181B] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#27272A] bg-[#27272A]/30">
                  <h3 className="text-sm font-semibold text-[#FAFAFA]">{tp("detailHours")}</h3>
                </div>
                <div className="w-full overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#27272A] bg-[#27272A]/50">
                        <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{tp("colDate")}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{tp("colProject")}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{tp("worker")}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{tp("colWork")}</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-[#A1A1AA]">{tp("colHours")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hoursData.hours.map((h: any) => (
                        <tr key={h.id} className="border-b border-[#27272A] last:border-0 hover:bg-[#27272A]/20">
                          <td className="px-4 py-2 text-sm text-[#FAFAFA]">{shortDate(h.report_date)}</td>
                          <td className="px-4 py-2 text-sm text-[#FAFAFA]">{h.project_name}</td>
                          <td className="px-4 py-2 text-sm text-[#FAFAFA]">
                            {h.crew_member_name}
                            {h.is_driver ? " 🚐" : ""}
                          </td>
                          <td className="px-4 py-2 text-sm text-[#A1A1AA]">{h.work_description || "—"}</td>
                          <td className="px-4 py-2 text-sm text-right font-medium text-[#FAFAFA]">
                            {h.duration_hours.toFixed(1)}h
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(!hoursData?.hours || hoursData.hours.length === 0) && machineSummary.length === 0 && (
              <div className="flex flex-col items-center py-12 text-[#A1A1AA]">
                <Clock className="h-10 w-10 mb-3 opacity-30" />
                <p>{tp("emptyHours")}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Supplier summary */}
            {notesData?.suppliers && notesData.suppliers.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {notesData.suppliers.map((s: any) => (
                  <div key={s.name} className="rounded-lg border border-[#27272A] bg-[#18181B] p-3">
                    <p className="text-sm font-semibold text-[#FAFAFA]">{s.name}</p>
                    <p className="text-2xl font-bold text-[#FAFAFA] mt-1">{s.count}</p>
                    <p className="text-xs text-[#A1A1AA]">
                      {tp("notesLabel")} — {s.projects.join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Notes table */}
            {notesData?.notes && notesData.notes.length > 0 && (
              <div className="rounded-lg border border-[#27272A] bg-[#18181B] overflow-hidden">
                <div className="w-full overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#27272A] bg-[#27272A]/50">
                        <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{tp("colDate")}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{tp("colProject")}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{tp("noteNumber")}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{tp("supplier")}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{tp("photo")}</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-[#A1A1AA]">{tp("submittedBy")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notesData.notes.map((n: any) => (
                        <tr key={n.id} className="border-b border-[#27272A] last:border-0 hover:bg-[#27272A]/20">
                          <td className="px-4 py-2 text-sm text-[#FAFAFA]">{shortDate(n.report_date)}</td>
                          <td className="px-4 py-2 text-sm text-[#FAFAFA]">{n.project_name}</td>
                          <td className="px-4 py-2 text-sm font-mono text-[#FAFAFA]">{n.note_number || "—"}</td>
                          <td className="px-4 py-2 text-sm text-[#FAFAFA]">{n.supplier_name || "—"}</td>
                          <td className="px-4 py-2">
                            {n.photo_url ? (
                              <a href={n.photo_url} target="_blank" rel="noopener noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={n.photo_url}
                                  alt={tp("photo")}
                                  className="h-10 w-10 rounded object-cover border border-[#27272A]"
                                />
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
              </div>
            )}

            {(!notesData?.notes || notesData.notes.length === 0) && (
              <div className="flex flex-col items-center py-12 text-[#A1A1AA]">
                <FileText className="h-10 w-10 mb-3 opacity-30" />
                <p>{tp("emptyNotes")}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-[#27272A] px-6 py-4 mt-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-[#A1A1AA]">
            <div className="h-5 w-5 bg-gradient-to-br from-[#F97316] to-[#EA580C] rounded flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">C</span>
            </div>
            {t("poweredBy")} &mdash;{" "}
            <a
              href="https://cantaia.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#F97316] hover:underline"
            >
              cantaia.io
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
