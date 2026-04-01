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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

/* ── helpers (same as app site-reports page) ── */

function getMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function formatWeek(mondayStr: string): string {
  const mon = new Date(mondayStr);
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  const weekNum = getISOWeekNumber(mon);
  return `Sem ${weekNum} (${mon.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })} \u2014 ${sun.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" })})`;
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function shiftWeek(mondayStr: string, delta: number): string {
  const d = new Date(mondayStr);
  d.setDate(d.getDate() + 7 * delta);
  return d.toISOString().split("T")[0];
}

function getDayDates(mondayStr: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mondayStr);
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/* ── types ── */

type ErrorType = "revoked" | "expired" | "invalid" | null;

/* ── component ── */

export default function PublicSiteReportsPage() {
  const params = useParams();
  const token = params.token as string;
  const t = useTranslations("siteReports.share");

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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("week_start", weekStart);
      if (projectFilter) params.set("project_id", projectFilter);
      if (activeTab === "hours" && crewFilter) params.set("crew_member_id", crewFilter);
      if (activeTab === "notes" && supplierFilter) params.set("supplier", supplierFilter);
      params.set("type", activeTab);

      const res = await fetch(`/api/site-reports/public/${token}?${params}`);

      if (res.status === 410) {
        const json = await res.json();
        const reason = json.reason || "revoked";
        setErrorType(reason === "expired" ? "expired" : "revoked");
        setError(json.error || "Lien indisponible");
        return;
      }
      if (res.status === 404) {
        setErrorType("invalid");
        setError("Lien invalide");
        return;
      }
      if (!res.ok) {
        setError("Erreur de chargement");
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
      setError("Erreur de chargement");
    } finally {
      setLoading(false);
    }
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
        },
        fallbackFilename: `export.${format}`,
      });
    } catch {
      /* ignore */
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
            className={`h-16 w-16 mx-auto mb-4 ${isRevoked ? "text-[#EF4444]" : isExpired ? "text-[#F59E0B]" : "text-[#71717A]"}`}
          />
          <h2 className="text-lg font-display font-bold text-[#FAFAFA] mb-2">
            {isRevoked
              ? t("revoked")
              : isExpired
                ? t("expired")
                : t("invalid")}
          </h2>
          <p className="text-sm text-[#71717A] mb-6">{error}</p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F97316] text-white text-sm font-medium rounded-lg hover:bg-[#EA580C] transition-colors"
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
            {t("publicTitle")} {orgName ? `\u2014 ${orgName}` : ""}
          </span>
        </div>
        <Link
          href="/register"
          className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#F97316] text-white text-sm font-medium rounded-lg hover:bg-[#EA580C] transition-colors"
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
                  ? "bg-[#F97316] text-white shadow-sm"
                  : "text-[#71717A] hover:text-[#FAFAFA]"
              }`}
            >
              <Clock className="h-4 w-4" /> Heures
            </button>
            <button
              onClick={() => setActiveTab("notes")}
              className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "notes"
                  ? "bg-[#F97316] text-white shadow-sm"
                  : "text-[#71717A] hover:text-[#FAFAFA]"
              }`}
            >
              <FileText className="h-4 w-4" /> Bons de livraison
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
              {formatWeek(weekStart)}
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
            <option value="">Tous les projets</option>
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
              <option value="">Tous les ouvriers</option>
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
              <option value="">Tous les fournisseurs</option>
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
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-[#71717A]">
                        Ouvrier
                      </th>
                      {DAYS.map((day, i) => (
                        <th
                          key={day}
                          className="px-3 py-2.5 text-center text-xs font-medium text-[#71717A]"
                        >
                          {day}
                          <br />
                          <span className="font-normal">
                            {new Date(dayDates[i]).toLocaleDateString("fr-CH", {
                              day: "2-digit",
                              month: "2-digit",
                            })}
                          </span>
                        </th>
                      ))}
                      <th className="px-4 py-2.5 text-right text-xs font-bold text-[#FAFAFA]">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {hoursData.summary.map((row: any, idx: number) => (
                      <tr
                        key={idx}
                        className="border-b border-[#27272A] last:border-0"
                      >
                        <td className="px-4 py-2.5">
                          <span className="text-sm font-medium text-[#FAFAFA]">
                            {row.name}
                          </span>
                          {row.role && (
                            <span className="text-xs text-[#71717A] ml-1">
                              ({row.role})
                            </span>
                          )}
                        </td>
                        {dayDates.map((date) => (
                          <td
                            key={date}
                            className="px-3 py-2.5 text-center text-sm text-[#FAFAFA]"
                          >
                            {row.days[date]
                              ? `${row.days[date].toFixed(1)}`
                              : "\u2014"}
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

            {/* Detail table */}
            {hoursData?.hours && hoursData.hours.length > 0 && (
              <div className="rounded-lg border border-[#27272A] bg-[#18181B] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#27272A] bg-[#27272A]/30">
                  <h3 className="text-sm font-semibold text-[#FAFAFA]">
                    D\u00e9tail des heures
                  </h3>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#27272A] bg-[#27272A]/50">
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">
                        Date
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">
                        Projet
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">
                        Ouvrier
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">
                        Travail
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-[#71717A]">
                        Heures
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {hoursData.hours.map((h: any) => (
                      <tr
                        key={h.id}
                        className="border-b border-[#27272A] last:border-0 hover:bg-[#27272A]/20"
                      >
                        <td className="px-4 py-2 text-sm text-[#FAFAFA]">
                          {new Date(h.report_date).toLocaleDateString("fr-CH", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-2 text-sm text-[#FAFAFA]">
                          {h.project_name}
                        </td>
                        <td className="px-4 py-2 text-sm text-[#FAFAFA]">
                          {h.crew_member_name}
                          {h.is_driver ? " \ud83d\ude90" : ""}
                        </td>
                        <td className="px-4 py-2 text-sm text-[#71717A]">
                          {h.work_description || "\u2014"}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-medium text-[#FAFAFA]">
                          {h.duration_hours.toFixed(1)}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(!hoursData?.hours || hoursData.hours.length === 0) && (
              <div className="flex flex-col items-center py-12 text-[#71717A]">
                <Clock className="h-10 w-10 mb-3 opacity-30" />
                <p>Aucune heure pour cette p\u00e9riode</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Supplier summary */}
            {notesData?.suppliers && notesData.suppliers.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {notesData.suppliers.map((s: any) => (
                  <div
                    key={s.name}
                    className="rounded-lg border border-[#27272A] bg-[#18181B] p-3"
                  >
                    <p className="text-sm font-semibold text-[#FAFAFA]">
                      {s.name}
                    </p>
                    <p className="text-2xl font-bold text-[#FAFAFA] mt-1">
                      {s.count}
                    </p>
                    <p className="text-xs text-[#71717A]">
                      bons \u2014 {s.projects.join(", ")}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Notes table */}
            {notesData?.notes && notesData.notes.length > 0 && (
              <div className="rounded-lg border border-[#27272A] bg-[#18181B] overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#27272A] bg-[#27272A]/50">
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">
                        Date
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">
                        Projet
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">
                        N\u00b0 Bon
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">
                        Fournisseur
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">
                        Photo
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">
                        Soumis par
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {notesData.notes.map((n: any) => (
                      <tr
                        key={n.id}
                        className="border-b border-[#27272A] last:border-0 hover:bg-[#27272A]/20"
                      >
                        <td className="px-4 py-2 text-sm text-[#FAFAFA]">
                          {new Date(n.report_date).toLocaleDateString("fr-CH", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-2 text-sm text-[#FAFAFA]">
                          {n.project_name}
                        </td>
                        <td className="px-4 py-2 text-sm font-mono text-[#FAFAFA]">
                          {n.note_number || "\u2014"}
                        </td>
                        <td className="px-4 py-2 text-sm text-[#FAFAFA]">
                          {n.supplier_name || "\u2014"}
                        </td>
                        <td className="px-4 py-2">
                          {n.photo_url ? (
                            <a
                              href={n.photo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={n.photo_url}
                                alt="Bon"
                                className="h-10 w-10 rounded object-cover border border-[#27272A]"
                              />
                            </a>
                          ) : (
                            <span className="text-xs text-[#71717A]">
                              \u2014
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-[#71717A]">
                          {n.submitted_by || "\u2014"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(!notesData?.notes || notesData.notes.length === 0) && (
              <div className="flex flex-col items-center py-12 text-[#71717A]">
                <FileText className="h-10 w-10 mb-3 opacity-30" />
                <p>Aucun bon de livraison pour cette p\u00e9riode</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-[#27272A] px-6 py-4 mt-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-[#71717A]">
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
