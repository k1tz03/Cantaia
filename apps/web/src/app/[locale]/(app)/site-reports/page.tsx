"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Clock, FileText, Download, ChevronLeft, ChevronRight, Loader2, Link2, Copy, Check, RefreshCw, Trash2 } from "lucide-react";

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
  return `${mon.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })} — ${sun.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
}

function shiftWeek(mondayStr: string, delta: number): string {
  const d = new Date(mondayStr);
  d.setDate(d.getDate() + 7 * delta);
  return d.toISOString().split("T")[0];
}

// Days of week headers
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function getDayDates(mondayStr: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mondayStr);
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

export default function SiteReportsPage() {
  const t = useTranslations("portal");
  const tShare = useTranslations("siteReports.share");
  const [activeTab, setActiveTab] = useState<"hours" | "notes">("hours");
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [projectFilter, setProjectFilter] = useState("");
  const [crewFilter, setCrewFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [hoursData, setHoursData] = useState<any>(null);
  const [notesData, setNotesData] = useState<any>(null);
  const [exporting, setExporting] = useState(false);

  // Share link state
  const [userRole, setUserRole] = useState<string>("");
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loadingShare, setLoadingShare] = useState(false);

  const canShare =
    ["admin", "director", "project_manager"].includes(userRole) || isSuperadmin;

  // Fetch user profile + existing share link on mount (separate to avoid one blocking the other)
  useEffect(() => {
    // 1. Profile — determines if share section is visible
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
    // 2. Share link — independent, may fail if migration 066 not applied
    fetch("/api/site-reports/share")
      .then(r => r.ok ? r.json() : null)
      .then(shareData => {
        if (shareData?.url) {
          setShareUrl(shareData.url);
          setShareExpiresAt(shareData.expires_at || null);
        }
      })
      .catch(() => {});
  }, []);

  async function handleGenerateShare() {
    setLoadingShare(true);
    try {
      const res = await fetch("/api/site-reports/share", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setShareUrl(data.url);
        setShareExpiresAt(data.expires_at || null);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingShare(false);
    }
  }

  async function handleRevokeShare() {
    if (!confirm(tShare("revokeConfirm"))) return;
    setLoadingShare(true);
    try {
      const res = await fetch("/api/site-reports/share", { method: "DELETE" });
      if (res.ok) {
        setShareUrl(null);
        setShareExpiresAt(null);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingShare(false);
    }
  }

  function handleCopyLink() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("week_start", weekStart);
      if (projectFilter) params.set("project_id", projectFilter);

      if (activeTab === "hours") {
        if (crewFilter) params.set("crew_member_id", crewFilter);
        const res = await fetch(`/api/site-reports/hours?${params}`);
        if (res.ok) setHoursData(await res.json());
      } else {
        if (supplierFilter) params.set("supplier", supplierFilter);
        const res = await fetch(`/api/site-reports/delivery-notes?${params}`);
        if (res.ok) setNotesData(await res.json());
      }
    } catch (e) {
      console.error("[SiteReports] Fetch error:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [activeTab, weekStart, projectFilter, crewFilter, supplierFilter]);

  async function handleExport(format: "xlsx" | "pdf") {
    setExporting(true);
    try {
      const endpoint = activeTab === "hours" ? "/api/site-reports/export-hours" : "/api/site-reports/export-notes";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          week_start: weekStart,
          project_id: projectFilter || undefined,
          supplier: supplierFilter || undefined,
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || `export.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch { /* ignore */ } finally {
      setExporting(false);
    }
  }

  const projects = hoursData?.projects || notesData?.projects || [];
  const dayDates = getDayDates(weekStart);

  return (
    <div className="min-h-full bg-[#0F0F11] mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-extrabold text-[#FAFAFA]">{t("siteReports")}</h1>
          <p className="text-sm text-[#71717A]">Centralisation heures et bons de livraison</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport("xlsx")}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#27272A] px-3 py-2 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A]"
          >
            <Download className="h-4 w-4" /> Excel
          </button>
          <button
            onClick={() => handleExport("pdf")}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#27272A] px-3 py-2 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A]"
          >
            <Download className="h-4 w-4" /> PDF
          </button>
        </div>
      </div>

      {/* Share link section — visible only for admin/director/PM/superadmin */}
      {canShare && (
        <div className="mb-4 rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <div className="flex items-start gap-3">
            <Link2 className="h-5 w-5 text-[#F97316] mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-[#FAFAFA]">{tShare("title")}</h3>

              {!shareUrl ? (
                <>
                  <p className="text-sm text-[#A1A1AA] mt-1">{tShare("description")}</p>
                  <button
                    onClick={handleGenerateShare}
                    disabled={loadingShare}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#F97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#EA580C] disabled:opacity-50 transition-colors"
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
                        {shareUrl}
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
                    <span className="text-xs text-[#71717A]">
                      {shareExpiresAt &&
                        tShare("expiresOn", {
                          date: new Date(shareExpiresAt).toLocaleDateString("fr-CH", {
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
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === "hours" ? "bg-[#0F0F11] text-[#FAFAFA] shadow-sm" : "text-[#71717A]"}`}
        >
          <Clock className="h-4 w-4" /> Heures
        </button>
        <button
          onClick={() => setActiveTab("notes")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === "notes" ? "bg-[#0F0F11] text-[#FAFAFA] shadow-sm" : "text-[#71717A]"}`}
        >
          <FileText className="h-4 w-4" /> Bons de livraison
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
          <option value="">Tous les projets</option>
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
            <option value="">Tous les ouvriers</option>
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
            <option value="">Tous les fournisseurs</option>
            {notesData.suppliers.map((s: any) => (
              <option key={s.name} value={s.name}>{s.name} ({s.count})</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#F97316]" /></div>
      ) : activeTab === "hours" ? (
        <div className="space-y-6">
          {/* Weekly summary grid */}
          {hoursData?.summary && hoursData.summary.length > 0 && (
            <div className="rounded-lg border border-[#27272A] overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-[#27272A] bg-[#27272A]/50">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-[#71717A]">Ouvrier</th>
                    {DAYS.map((day, i) => (
                      <th key={day} className="px-3 py-2.5 text-center text-xs font-medium text-[#71717A]">
                        {day}<br /><span className="font-normal">{new Date(dayDates[i]).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })}</span>
                      </th>
                    ))}
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-[#FAFAFA]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {hoursData.summary.map((row: any, idx: number) => (
                    <tr key={idx} className="border-b border-[#27272A] last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="text-sm font-medium text-[#FAFAFA]">{row.name}</span>
                        {row.role && <span className="text-xs text-[#71717A] ml-1">({row.role})</span>}
                      </td>
                      {dayDates.map(date => (
                        <td key={date} className="px-3 py-2.5 text-center text-sm text-[#FAFAFA]">
                          {row.days[date] ? `${row.days[date].toFixed(1)}` : "\u2014"}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-[#FAFAFA]">{row.total.toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Detail table */}
          {hoursData?.hours && hoursData.hours.length > 0 && (
            <div className="rounded-lg border border-[#27272A] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#27272A] bg-[#27272A]/30">
                <h3 className="text-sm font-semibold text-[#FAFAFA]">Détail des heures</h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#27272A] bg-[#27272A]/50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">Projet</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">Ouvrier</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">Travail</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-[#71717A]">Heures</th>
                  </tr>
                </thead>
                <tbody>
                  {hoursData.hours.map((h: any) => (
                    <tr key={h.id} className="border-b border-[#27272A] last:border-0 hover:bg-[#27272A]/20">
                      <td className="px-4 py-2 text-sm text-[#FAFAFA]">{new Date(h.report_date).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })}</td>
                      <td className="px-4 py-2 text-sm text-[#FAFAFA]">{h.project_name}</td>
                      <td className="px-4 py-2 text-sm text-[#FAFAFA]">{h.crew_member_name}{h.is_driver ? " \ud83d\ude90" : ""}</td>
                      <td className="px-4 py-2 text-sm text-[#71717A]">{h.work_description || "\u2014"}</td>
                      <td className="px-4 py-2 text-sm text-right font-medium text-[#FAFAFA]">{h.duration_hours.toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(!hoursData?.hours || hoursData.hours.length === 0) && (
            <div className="flex flex-col items-center py-12 text-[#71717A]">
              <Clock className="h-10 w-10 mb-3 opacity-30" />
              <p>Aucune heure pour cette période</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Supplier summary */}
          {notesData?.suppliers && notesData.suppliers.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {notesData.suppliers.map((s: any) => (
                <div key={s.name} className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-3">
                  <p className="text-sm font-semibold text-[#FAFAFA]">{s.name}</p>
                  <p className="text-2xl font-bold text-[#FAFAFA] mt-1">{s.count}</p>
                  <p className="text-xs text-[#71717A]">bons \u2014 {s.projects.join(", ")}</p>
                </div>
              ))}
            </div>
          )}

          {/* Notes table */}
          {notesData?.notes && notesData.notes.length > 0 && (
            <div className="rounded-lg border border-[#27272A] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#27272A] bg-[#27272A]/50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">Projet</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">N° Bon</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">Fournisseur</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">Photo</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-[#71717A]">Soumis par</th>
                  </tr>
                </thead>
                <tbody>
                  {notesData.notes.map((n: any) => (
                    <tr key={n.id} className="border-b border-[#27272A] last:border-0 hover:bg-[#27272A]/20">
                      <td className="px-4 py-2 text-sm text-[#FAFAFA]">{new Date(n.report_date).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })}</td>
                      <td className="px-4 py-2 text-sm text-[#FAFAFA]">{n.project_name}</td>
                      <td className="px-4 py-2 text-sm font-mono text-[#FAFAFA]">{n.note_number || "\u2014"}</td>
                      <td className="px-4 py-2 text-sm text-[#FAFAFA]">{n.supplier_name || "\u2014"}</td>
                      <td className="px-4 py-2">
                        {n.photo_url ? (
                          <a href={n.photo_url} target="_blank" rel="noopener noreferrer">
                            <img src={n.photo_url} alt="Bon" className="h-10 w-10 rounded object-cover border border-[#27272A]" />
                          </a>
                        ) : (
                          <span className="text-xs text-[#71717A]">\u2014</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-[#71717A]">{n.submitted_by || "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(!notesData?.notes || notesData.notes.length === 0) && (
            <div className="flex flex-col items-center py-12 text-[#71717A]">
              <FileText className="h-10 w-10 mb-3 opacity-30" />
              <p>Aucun bon de livraison pour cette période</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
