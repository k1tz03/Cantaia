"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Clock, FileText, Download, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

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
  const [activeTab, setActiveTab] = useState<"hours" | "notes">("hours");
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const [projectFilter, setProjectFilter] = useState("");
  const [crewFilter, setCrewFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [hoursData, setHoursData] = useState<any>(null);
  const [notesData, setNotesData] = useState<any>(null);
  const [exporting, setExporting] = useState(false);

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
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("siteReports")}</h1>
          <p className="text-sm text-muted-foreground">Centralisation heures et bons de livraison</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport("xlsx")}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            <Download className="h-4 w-4" /> Excel
          </button>
          <button
            onClick={() => handleExport("pdf")}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            <Download className="h-4 w-4" /> PDF
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          onClick={() => setActiveTab("hours")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === "hours" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
        >
          <Clock className="h-4 w-4" /> Heures
        </button>
        <button
          onClick={() => setActiveTab("notes")}
          className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === "notes" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
        >
          <FileText className="h-4 w-4" /> Bons de livraison
        </button>
      </div>

      {/* Week navigation + filters */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => setWeekStart(shiftWeek(weekStart, -1))} className="rounded-md p-1.5 hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-medium text-foreground min-w-[200px] text-center">{formatWeek(weekStart)}</span>
          <button onClick={() => setWeekStart(shiftWeek(weekStart, 1))} className="rounded-md p-1.5 hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <select
          value={projectFilter}
          onChange={e => setProjectFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
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
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
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
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="">Tous les fournisseurs</option>
            {notesData.suppliers.map((s: any) => (
              <option key={s.name} value={s.name}>{s.name} ({s.count})</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : activeTab === "hours" ? (
        <div className="space-y-6">
          {/* Weekly summary grid */}
          {hoursData?.summary && hoursData.summary.length > 0 && (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">Ouvrier</th>
                    {DAYS.map((day, i) => (
                      <th key={day} className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground">
                        {day}<br /><span className="font-normal">{new Date(dayDates[i]).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })}</span>
                      </th>
                    ))}
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {hoursData.summary.map((row: any, idx: number) => (
                    <tr key={idx} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="text-sm font-medium text-foreground">{row.name}</span>
                        {row.role && <span className="text-xs text-muted-foreground ml-1">({row.role})</span>}
                      </td>
                      {dayDates.map(date => (
                        <td key={date} className="px-3 py-2.5 text-center text-sm text-foreground">
                          {row.days[date] ? `${row.days[date].toFixed(1)}` : "\u2014"}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-foreground">{row.total.toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Detail table */}
          {hoursData?.hours && hoursData.hours.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <h3 className="text-sm font-semibold text-foreground">D\u00e9tail des heures</h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Projet</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Ouvrier</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Travail</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Heures</th>
                  </tr>
                </thead>
                <tbody>
                  {hoursData.hours.map((h: any) => (
                    <tr key={h.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2 text-sm text-foreground">{new Date(h.report_date).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })}</td>
                      <td className="px-4 py-2 text-sm text-foreground">{h.project_name}</td>
                      <td className="px-4 py-2 text-sm text-foreground">{h.crew_member_name}{h.is_driver ? " \ud83d\ude90" : ""}</td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">{h.work_description || "\u2014"}</td>
                      <td className="px-4 py-2 text-sm text-right font-medium text-foreground">{h.duration_hours.toFixed(1)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(!hoursData?.hours || hoursData.hours.length === 0) && (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
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
                <div key={s.name} className="rounded-lg border border-border bg-background p-3">
                  <p className="text-sm font-semibold text-foreground">{s.name}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{s.count}</p>
                  <p className="text-xs text-muted-foreground">bons \u2014 {s.projects.join(", ")}</p>
                </div>
              ))}
            </div>
          )}

          {/* Notes table */}
          {notesData?.notes && notesData.notes.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Projet</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">N\u00b0 Bon</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Fournisseur</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Photo</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Soumis par</th>
                  </tr>
                </thead>
                <tbody>
                  {notesData.notes.map((n: any) => (
                    <tr key={n.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2 text-sm text-foreground">{new Date(n.report_date).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" })}</td>
                      <td className="px-4 py-2 text-sm text-foreground">{n.project_name}</td>
                      <td className="px-4 py-2 text-sm font-mono text-foreground">{n.note_number || "\u2014"}</td>
                      <td className="px-4 py-2 text-sm text-foreground">{n.supplier_name || "\u2014"}</td>
                      <td className="px-4 py-2">
                        {n.photo_url ? (
                          <a href={n.photo_url} target="_blank" rel="noopener noreferrer">
                            <img src={n.photo_url} alt="Bon" className="h-10 w-10 rounded object-cover border border-border" />
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">\u2014</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">{n.submitted_by || "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(!notesData?.notes || notesData.notes.length === 0) && (
            <div className="flex flex-col items-center py-12 text-muted-foreground">
              <FileText className="h-10 w-10 mb-3 opacity-30" />
              <p>Aucun bon de livraison pour cette p\u00e9riode</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
