"use client";

import React, { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import {
  FileSpreadsheet,
  FileText,
  Plus,
  Loader2,
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

  const statusConfig: Record<string, { label: string; className: string }> = {
    pending: { label: "En attente", className: "bg-gray-100 text-gray-600" },
    analyzing: { label: "Analyse...", className: "bg-purple-100 text-purple-700 animate-pulse" },
    done: { label: "Analysé", className: "bg-green-100 text-green-700" },
    error: { label: "Erreur", className: "bg-red-100 text-red-700" },
  };

  return (
    <div className="px-4 py-4 sm:px-6 lg:px-8 overflow-auto h-full">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">
              Soumissions
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {submissions.length} soumission{submissions.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link
            href="/submissions/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nouvelle soumission
          </Link>
        </div>

        {/* Search */}
        {submissions.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, projet..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 text-brand animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <FileSpreadsheet className="h-7 w-7 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">
              {search ? "Aucun résultat" : "Aucune soumission"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
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
                  className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl hover:border-brand/30 hover:bg-gray-50/50 transition-all group"
                >
                  <Link
                    href={`/submissions/${sub.id}`}
                    className="flex items-center gap-4 flex-1 min-w-0"
                  >
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      {sub.file_type === "pdf" ? (
                        <FileText className="h-5 w-5 text-red-500" />
                      ) : (
                        <FileSpreadsheet className="h-5 w-5 text-green-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 truncate">
                        {sub.file_name || "Sans nom"}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {sub.projects?.name || "Projet inconnu"}
                        {sub.projects?.city ? ` · ${sub.projects.city}` : ""}
                      </p>
                    </div>
                    <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0 ${sc.className}`}>
                      {sc.label}
                    </span>
                    <p className="text-xs text-gray-400 shrink-0">
                      {new Date(sub.created_at).toLocaleDateString("fr-CH")}
                    </p>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" />
                  </Link>
                  <button
                    onClick={() => setDeleteId(sub.id)}
                    className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors opacity-0 group-hover:opacity-100"
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
