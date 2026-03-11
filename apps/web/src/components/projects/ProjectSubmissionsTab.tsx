"use client";

import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { FileSpreadsheet, FileText, Plus, Loader2, ChevronRight } from "lucide-react";

interface SubmissionRow {
  id: string;
  file_name: string | null;
  file_type: string | null;
  analysis_status: string;
  created_at: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-gray-100 text-gray-600" },
  analyzing: { label: "Analyse...", className: "bg-purple-100 text-purple-700" },
  done: { label: "Analysé", className: "bg-green-100 text-green-700" },
  error: { label: "Erreur", className: "bg-red-100 text-red-700" },
};

export function ProjectSubmissionsTab({ projectId }: { projectId: string }) {
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/submissions?project_id=${projectId}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setSubmissions(json.submissions || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 text-brand animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {submissions.length} soumission{submissions.length !== 1 ? "s" : ""}
        </p>
        <Link
          href="/submissions/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90"
        >
          <Plus className="h-3.5 w-3.5" />
          Nouvelle soumission
        </Link>
      </div>
      {submissions.length > 0 ? (
        <div className="space-y-2">
          {submissions.map((sub) => {
            const sc = statusConfig[sub.analysis_status] || statusConfig.pending;
            return (
              <Link
                key={sub.id}
                href={`/submissions/${sub.id}`}
                className="flex items-center gap-4 rounded-md border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50 group"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                  {sub.file_type === "pdf" ? (
                    <FileText className="h-5 w-5 text-red-500" />
                  ) : (
                    <FileSpreadsheet className="h-5 w-5 text-green-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {sub.file_name || "Sans nom"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(sub.created_at).toLocaleDateString("fr-CH")}
                  </p>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${sc.className}`}>
                  {sc.label}
                </span>
                <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 shrink-0" />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white">
          <div className="text-center">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-500">Aucune soumission</p>
            <p className="text-xs text-slate-400 mt-1">Importez un descriptif pour commencer</p>
          </div>
        </div>
      )}
    </div>
  );
}
