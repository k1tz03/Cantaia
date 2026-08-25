"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useProject } from "@/lib/hooks/use-supabase-data";
import {
  ArrowLeft,
  AlertTriangle,
  Download,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { formatDate } from "@/lib/format";

/**
 * Closure documents (step 6 of the closure workflow).
 *
 * The step existed and was counted, but "Ajouter les documents" linked to a
 * page that had never been written — a dead link at the end of the workflow.
 */

interface ClosureDocument {
  id: string;
  document_type: string;
  document_name: string;
  document_url: string;
  notes: string | null;
  uploaded_at: string | null;
}

const DOCUMENT_TYPES = [
  { value: "pv_reception", labelKey: "pvReception" },
  { value: "pv_reserves_lifted", labelKey: "pvReservesLifted" },
  { value: "guarantee_certificate", labelKey: "guaranteeCertificate" },
  { value: "final_invoice", labelKey: "finalInvoice" },
  { value: "as_built_plans", labelKey: "asBuiltPlans" },
  { value: "other", labelKey: "otherDocument" },
] as const;

const MAX_BYTES = 10 * 1024 * 1024;

export default function ClosureDocumentsPage() {
  const params = useParams();
  const t = useTranslations("closure");
  const tCommon = useTranslations("common");
  const projectId = params.id as string;

  const { project, loading: projectLoading } = useProject(projectId);

  const [documents, setDocuments] = useState<ClosureDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState<string>("other");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/closure/documents`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Chargement impossible");
      setDocuments(data.documents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) {
          throw new Error(`${file.name} dépasse 10 Mo`);
        }

        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1] || "");
          };
          reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
          reader.readAsDataURL(file);
        });

        const res = await fetch(`/api/projects/${projectId}/closure/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_base64: base64,
            filename: file.name,
            content_type: file.type,
            document_type: documentType,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Envoi de ${file.name} échoué`);
      }

      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Envoi impossible");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(documentId: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/closure/documents?document_id=${documentId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Suppression impossible");
      }
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Suppression impossible");
    }
  }

  if (projectLoading || loading) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" />
        <span className="sr-only">{tCommon("loading")}</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <p className="text-[#A1A1AA]">{t("projectNotFound")}</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-start gap-4">
        <Link
          href={`/projects/${project.id}/closure`}
          className="mt-1 rounded-md p-2 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-[#FAFAFA]">
            {t("closureDocuments")} — {project.name}
          </h1>
          <p className="mt-1 text-sm text-[#A1A1AA]">{t("step6Description")}</p>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex max-w-3xl items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload */}
      <div className="mt-8 max-w-3xl rounded-md border border-[#27272A] bg-[#0F0F11] p-6">
        <label className="text-sm font-semibold text-[#FAFAFA]">{t("uploadDocument")}</label>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="text-xs font-medium text-[#A1A1AA]">{t("documentType")}</label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none"
            >
              {DOCUMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {t(type.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-[#0F0F11] hover:bg-[#EA580C] disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? t("uploadingFile") : t("orBrowseFiles")}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />

        <p className="mt-2 text-xs text-[#A1A1AA]">{t("acceptedFormats")} — max 10 Mo</p>
      </div>

      {/* List */}
      <div className="mt-6 max-w-3xl space-y-2">
        {documents.length === 0 ? (
          <div className="rounded-md border border-dashed border-[#27272A] bg-[#0F0F11] py-12 text-center">
            <FileText className="mx-auto h-8 w-8 text-[#52525B]" />
            <p className="mt-2 text-sm text-[#A1A1AA]">{t("step6Pending")}</p>
          </div>
        ) : (
          documents.map((doc) => {
            const typeLabel =
              DOCUMENT_TYPES.find((type) => type.value === doc.document_type)?.labelKey ?? "otherDocument";
            return (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-md border border-[#27272A] bg-[#0F0F11] px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FileText className="h-4 w-4 shrink-0 text-[#F97316]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#FAFAFA]">{doc.document_name}</p>
                    <p className="text-xs text-[#A1A1AA]">
                      {t(typeLabel)}
                      {doc.uploaded_at ? ` — ${formatDate(doc.uploaded_at)}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href={doc.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md p-2 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
                    aria-label="Télécharger"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(doc.id)}
                    className="rounded-md p-2 text-[#A1A1AA] hover:bg-red-500/10 hover:text-red-400"
                    aria-label={t("removeFile")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
