"use client";

import React, { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import {
  FileSpreadsheet,
  FileText,
  Plus,
  Trash2,
  ChevronRight,
  Search,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface SubmissionRow {
  id: string;
  project_id: string;
  file_name: string | null;
  file_type: string | null;
  analysis_status: string;
  created_at: string;
  projects?: {
    id: string;
    name: string;
    code: string | null;
    color: string | null;
    client_name: string | null;
    city: string | null;
  };
}

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    fetchSubmissions();
  }, []);

  async function fetchSubmissions() {
    try {
      const res = await fetch("/api/submissions");
      const json = await res.json();
      if (json.success) setSubmissions(json.submissions || []);
    } catch (err) {
      console.error("[submissions] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/submissions/${id}`, { method: "DELETE" });
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("[submissions] delete error:", err);
    }
    setDeleteId(null);
  }

  const filtered = submissions.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.file_name || "").toLowerCase().includes(q) ||
      (s.projects?.name || "").toLowerCase().includes(q) ||
      (s.projects?.client_name || "").toLowerCase().includes(q)
    );
  });

  const statusConfig: Record<string, { label: string; className: string; dot: string }> = {
    pending: { label: "En attente", className: "bg-muted text-muted-foreground border border-border", dot: "bg-muted-foreground" },
    analyzing: { label: "Analyse...", className: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-200 animate-pulse", dot: "bg-purple-500" },
    done: { label: "Analysé", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200", dot: "bg-emerald-500" },
    error: { label: "Erreur", className: "bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200", dot: "bg-red-500" },
  };

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 overflow-auto h-full">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">
              Soumissions
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {submissions.length} soumission{submissions.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link
            href="/submissions/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary/90 hover:shadow"
          >
            <Plus className="h-4 w-4" />
            Nouvelle soumission
          </Link>
        </div>

        {/* Search */}
        {submissions.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, projet..."
              className="w-full pl-10 pr-4 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4 bg-background border border-border rounded-xl shadow-sm">
                <div className="w-10 h-10 animate-pulse rounded-lg bg-muted" />
                <div className="flex-1">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted mb-2" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                </div>
                <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted border border-border flex items-center justify-center mb-4 shadow-sm">
              <FileSpreadsheet className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-muted-foreground">
              {search ? "Aucun résultat" : "Aucune soumission"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {search ? "Essayez un autre terme" : "Importez un descriptif pour commencer"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((sub) => {
              const sc = statusConfig[sub.analysis_status] || statusConfig.pending;
              return (
                <div
                  key={sub.id}
                  className="flex items-center gap-4 p-4 bg-background border border-border rounded-xl shadow-sm hover:shadow-md hover:border-border transition-all group"
                >
                  <Link
                    href={`/submissions/${sub.id}`}
                    className="flex items-center gap-4 flex-1 min-w-0"
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${sub.file_type === "pdf" ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
                      {sub.file_type === "pdf" ? (
                        <FileText className="h-5 w-5 text-red-500" />
                      ) : (
                        <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[13px] text-foreground truncate group-hover:text-primary transition-colors">
                        {sub.file_name || "Sans nom"}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                        {sub.projects?.color && (
                          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: sub.projects.color }} />
                        )}
                        <span className="truncate">{sub.projects?.name || "Projet inconnu"}</span>
                        {sub.projects?.city && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span>{sub.projects.city}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0 ${sc.className}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                      {sc.label}
                    </span>
                    <p className="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {new Date(sub.created_at).toLocaleDateString("fr-CH")}
                    </p>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                  </Link>
                  <button
                    onClick={() => setDeleteId(sub.id)}
                    className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) handleDelete(deleteId); }}
        title="Supprimer cette soumission ?"
        description="La soumission et toutes les données associées seront supprimées définitivement."
        variant="danger"
      />
    </div>
  );
}
