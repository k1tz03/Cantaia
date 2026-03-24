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
  pending: { label: "En attente", className: "bg-[#27272A] text-[#71717A]" },
  analyzing: { label: "Analyse...", className: "bg-purple-500/10 text-purple-700 dark:text-purple-400" },
  done: { label: "Analysé", className: "bg-green-500/10 text-green-700 dark:text-green-400" },
  error: { label: "Erreur", className: "bg-red-500/10 text-red-700 dark:text-red-400" },
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
        <p className="text-sm text-[#71717A]">
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
                className="flex items-center gap-4 rounded-md border border-[#27272A] bg-[#0F0F11] p-4 transition-colors hover:bg-[#27272A] group"
              >
                <div className="w-10 h-10 rounded-lg bg-[#27272A] flex items-center justify-center shrink-0">
                  {sub.file_type === "pdf" ? (
                    <FileText className="h-5 w-5 text-red-500" />
                  ) : (
                    <FileSpreadsheet className="h-5 w-5 text-green-600 dark:text-green-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#FAFAFA] truncate">
                    {sub.file_name || "Sans nom"}
                  </p>
                  <p className="text-xs text-[#71717A] mt-0.5">
                    {new Date(sub.created_at).toLocaleDateString("fr-CH")}
                  </p>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${sc.className}`}>
                  {sc.label}
                </span>
                <ChevronRight className="h-4 w-4 text-[#71717A] group-hover:text-[#71717A] shrink-0" />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-[#27272A] bg-[#0F0F11]">
          <div className="text-center">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-[#71717A]" />
            <p className="mt-3 text-sm font-medium text-[#71717A]">Aucune soumission</p>
            <p className="text-xs text-[#71717A] mt-1">Importez un descriptif pour commencer</p>
          </div>
        </div>
      )}
    </div>
  );
}
