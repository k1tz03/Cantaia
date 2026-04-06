"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  FolderArchive,
  Download,
  Save,
  FolderOpen,
  FileText,
  Paperclip,
  Archive,
  CheckSquare,
  Square,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";

// ─── Types ───

interface ArchiveSettingsTabProps {
  projectId: string;
  projectName: string;
  archivePath: string | null;
  archiveEnabled: boolean;
  archiveStructure: string;
  archiveFilenameFormat: string;
  archiveAttachmentsMode: string;
}

type ArchiveStructure = "by_category" | "by_date" | "by_sender" | "flat";
type FilenameFormat = "date_sender_subject" | "date_subject" | "original";
type AttachmentsMode = "subfolder" | "beside" | "thematic";

interface StructureOption {
  value: ArchiveStructure;
  label: string;
  description: string;
  recommended?: boolean;
}

interface FilenameOption {
  value: FilenameFormat;
  label: string;
  example: string;
}

interface AttachmentsOption {
  value: AttachmentsMode;
  label: string;
}

// ─── Radio Button ───

function RadioOption({
  value,
  checked,
  onChange,
  label,
  description,
  recommended,
  recommendedLabel,
}: {
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: string;
  description?: string;
  recommended?: boolean;
  recommendedLabel?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-[#27272A]">
      <div className="pt-0.5">
        <button
          type="button"
          onClick={() => onChange(value)}
          className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors ${
            checked
              ? "border-[#F97316] bg-[#F97316]"
              : "border-[#27272A] bg-[#0F0F11] hover:border-[#71717A]"
          }`}
        >
          {checked && <div className="h-1.5 w-1.5 rounded-full bg-[#0F0F11]" />}
        </button>
      </div>
      <div className="flex-1" onClick={() => onChange(value)}>
        <span className="text-sm font-medium text-[#FAFAFA]">{label}</span>
        {recommended && (
          <span className="ml-2 inline-block rounded-full bg-[#F97316]/10 px-2 py-0.5 text-xs font-medium text-[#F97316]">
            {recommendedLabel ?? "recommande"}
          </span>
        )}
        {description && (
          <span className="ml-2 text-xs text-[#71717A]">{description}</span>
        )}
      </div>
    </label>
  );
}

// ─── Main Component ───

export function ArchiveSettingsTab({
  projectId,
  projectName,
  archivePath,
  archiveEnabled,
  archiveStructure,
  archiveFilenameFormat,
  archiveAttachmentsMode,
}: ArchiveSettingsTabProps) {
  const t = useTranslations("archiving");

  // ─── State ───
  const [enabled, setEnabled] = useState(archiveEnabled);
  const [path, setPath] = useState(archivePath ?? "");
  const [structure, setStructure] = useState<ArchiveStructure>(
    (archiveStructure as ArchiveStructure) || "by_category"
  );
  const [filenameFormat, setFilenameFormat] = useState<FilenameFormat>(
    (archiveFilenameFormat as FilenameFormat) || "date_sender_subject"
  );
  const [attachmentsMode, setAttachmentsMode] = useState<AttachmentsMode>(
    (archiveAttachmentsMode as AttachmentsMode) || "subfolder"
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [archiveStats, setArchiveStats] = useState<{
    total: number;
    archived: number;
    failed: number;
    pending: number;
  }>({ total: 0, archived: 0, failed: 0, pending: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  // ─── Fetch archive stats ───
  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const res = await fetch(`/api/emails/archive-download?project_id=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setArchiveStats({
          total: data.total_emails || 0,
          archived: data.archived_count || 0,
          failed: data.failed_count || 0,
          pending: data.pending_count || 0,
        });
      }
    } catch {
      // Silently fail — stats are non-critical
    } finally {
      setStatsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // ─── Options ───

  const structureOptions: StructureOption[] = [
    {
      value: "by_category",
      label: t("byCategory"),
      description: t("byCategoryDesc"),
      recommended: true,
    },
    {
      value: "by_date",
      label: t("byDate"),
      description: t("byDateDesc"),
    },
    {
      value: "by_sender",
      label: t("bySender"),
      description: t("bySenderDesc"),
    },
    {
      value: "flat",
      label: t("flat"),
      description: "",
    },
  ];

  const filenameOptions: FilenameOption[] = [
    {
      value: "date_sender_subject",
      label: t("dateSenderSubject"),
      example: "2026-02-15_Implenia_Situation-janvier",
    },
    {
      value: "date_subject",
      label: t("dateSubject"),
      example: "2026-02-15_Situation-janvier",
    },
    {
      value: "original",
      label: t("original"),
      example: "RE: FW: Situation janvier 2026",
    },
  ];

  const attachmentsOptions: AttachmentsOption[] = [
    {
      value: "subfolder",
      label: t("attachSubfolder"),
    },
    {
      value: "beside",
      label: t("attachBeside"),
    },
    {
      value: "thematic",
      label: t("attachThematic"),
    },
  ];

  // ─── Handlers ───

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);

    try {
      const payload = {
        project_id: projectId,
        archive_path: path || null,
        archive_enabled: enabled,
        archive_structure: structure,
        archive_filename_format: filenameFormat,
        archive_attachments_mode: attachmentsMode,
      };

      const res = await fetch("/api/projects/archive-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(t("saveError") + ": " + (err.error || res.statusText));
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast.error(t("networkError"));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateStructure = () => {
    const folders: string[] = [];

    if (structure === "by_category") {
      folders.push(
        "01_Correspondance",
        "01_Correspondance/01_Architecte",
        "01_Correspondance/02_Ingenieurs",
        "01_Correspondance/03_Entreprises",
        "01_Correspondance/04_Maitre-ouvrage",
        "01_Correspondance/05_Divers",
        "02_PV-Seances",
        "03_Plans",
        "04_Soumissions-Offres",
        "05_Avenants",
        "06_Situations-Factures",
        "07_Photos",
        "08_Divers"
      );
    } else if (structure === "by_date") {
      const now = new Date();
      for (let m = 0; m < 6; m++) {
        const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
        folders.push(d.toISOString().slice(0, 7));
      }
    } else if (structure === "by_sender") {
      folders.push("(dossiers crees automatiquement par expediteur)");
    } else {
      folders.push("(tous les emails dans un seul dossier)");
    }

    toast.info(
      t("treeTitle") + ":\n" + folders.map((f) => `  📁 ${f}`).join("\n"),
      { duration: 8000 }
    );
  };

  const handleArchiveExisting = async () => {
    setArchiving(true);
    try {
      const res = await fetch("/api/emails/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      const data = await res.json();
      if (res.ok) {
        const accepted = data.accepted || data.archived || 0;
        const alreadyDone = data.already_archived || 0;
        toast.success(
          `${accepted} emails en cours d'archivage${alreadyDone > 0 ? `, ${alreadyDone} deja archives` : ""}`,
          { duration: 5000 }
        );
        // Poll for completion
        if (accepted > 0) {
          pollArchiveProgress();
        }
      } else {
        toast.error(t("saveError") + ": " + (data.error || res.statusText));
      }
    } catch {
      toast.error(t("networkError"));
    } finally {
      setArchiving(false);
    }
  };

  const pollArchiveProgress = useCallback(() => {
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max (every 5s)

    const poll = async () => {
      attempts++;
      if (attempts > maxAttempts) return;

      try {
        const res = await fetch(`/api/emails/archive-download?project_id=${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setArchiveStats({
            total: data.total_emails || 0,
            archived: data.archived_count || 0,
            failed: data.failed_count || 0,
            pending: data.pending_count || 0,
          });

          // If still pending, continue polling
          if ((data.pending_count || 0) > 0) {
            setTimeout(poll, 5000);
          } else {
            toast.success(`Archivage termine : ${data.archived_count} emails archives`);
          }
        }
      } catch {
        // Silently fail — will retry
        setTimeout(poll, 5000);
      }
    };

    setTimeout(poll, 3000);
  }, [projectId]);

  const handleDownloadZip = async () => {
    if (archiveStats.archived === 0) {
      toast.error("Aucun email archive a telecharger");
      return;
    }

    setDownloading(true);
    try {
      const res = await fetch(
        `/api/emails/archive-download?project_id=${projectId}&format=zip`
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Erreur lors du telechargement");
        return;
      }

      // Download the blob
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ||
        `archives_${projectName.replace(/[^a-zA-Z0-9_-]/g, "_")}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Telechargement en cours...");
    } catch {
      toast.error(t("networkError"));
    } finally {
      setDownloading(false);
    }
  };

  // ─── Render ───

  const progressPercent =
    archiveStats.total > 0
      ? Math.round((archiveStats.archived / archiveStats.total) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
        <div className="mb-4 flex items-center gap-2">
          <FolderArchive className="h-5 w-5 text-[#F97316]" />
          <h2 className="text-base font-semibold text-[#FAFAFA]">
            {t("title")} &mdash; {projectName}
          </h2>
        </div>

        {/* ─── Enable toggle ─── */}
        <label className="flex cursor-pointer items-center gap-3">
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className="flex items-center"
          >
            {enabled ? (
              <CheckSquare className="h-5 w-5 text-[#F97316]" />
            ) : (
              <Square className="h-5 w-5 text-[#71717A]" />
            )}
          </button>
          <span
            className="text-sm font-medium text-[#FAFAFA]"
            onClick={() => setEnabled(!enabled)}
          >
            {t("enableAutoArchive")}
          </span>
        </label>
        <p className="mt-2 ml-8 text-xs text-[#71717A]">
          Les emails classes dans ce projet seront automatiquement archives lors de la synchronisation.
        </p>
      </div>

      {/* ─── Archive Path (for reference / future desktop) ─── */}
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
        <div className="mb-3 flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-[#71717A]" />
          <h3 className="text-sm font-semibold text-[#FAFAFA]">
            {t("rootFolder")}
          </h3>
          <span className="text-xs text-[#52525B]">(optionnel)</span>
        </div>

        <input
          type="text"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder={`Projet / ${projectName}`}
          className="w-full rounded-md border border-[#27272A] bg-[#18181B] px-3 py-2 text-sm text-[#FAFAFA] placeholder-[#52525B] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
        />

        <p className="mt-2 text-xs text-[#71717A]">
          Nom de reference pour l'arborescence. Les fichiers sont stockes dans le cloud Cantaia.
        </p>
      </div>

      {/* ─── Folder Structure ─── */}
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
        <div className="mb-3 flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-[#71717A]" />
          <h3 className="text-sm font-semibold text-[#FAFAFA]">
            {t("folderStructure")}
          </h3>
        </div>

        <div className="space-y-1">
          {structureOptions.map((opt) => (
            <RadioOption
              key={opt.value}
              value={opt.value}
              checked={structure === opt.value}
              onChange={(v) => setStructure(v as ArchiveStructure)}
              label={opt.label}
              description={opt.description || undefined}
              recommended={opt.recommended}
              recommendedLabel={t("recommended")}
            />
          ))}
        </div>
      </div>

      {/* ─── Filename Format ─── */}
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#71717A]" />
          <h3 className="text-sm font-semibold text-[#FAFAFA]">
            {t("filenameFormat")}
          </h3>
        </div>

        <div className="space-y-1">
          {filenameOptions.map((opt) => (
            <RadioOption
              key={opt.value}
              value={opt.value}
              checked={filenameFormat === opt.value}
              onChange={(v) => setFilenameFormat(v as FilenameFormat)}
              label={opt.label}
              description={opt.example}
            />
          ))}
        </div>
      </div>

      {/* ─── Attachments Mode ─── */}
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
        <div className="mb-3 flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-[#71717A]" />
          <h3 className="text-sm font-semibold text-[#FAFAFA]">
            {t("attachments")}
          </h3>
        </div>

        <div className="space-y-1">
          {attachmentsOptions.map((opt) => (
            <RadioOption
              key={opt.value}
              value={opt.value}
              checked={attachmentsMode === opt.value}
              onChange={(v) => setAttachmentsMode(v as AttachmentsMode)}
              label={opt.label}
            />
          ))}
        </div>
      </div>

      {/* ─── Save Button ─── */}
      <div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#EA580C] disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? t("saving") : t("save")}
        </button>
        {saved && (
          <span className="ml-3 text-sm text-green-400">
            {t("saveSuccess")}
          </span>
        )}
      </div>

      {/* ─── Stats & Progress ─── */}
      <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#FAFAFA]">Etat de l'archivage</h3>
          <button
            type="button"
            onClick={fetchStats}
            className="text-[#71717A] hover:text-[#A1A1AA] transition-colors"
            title={t("refresh")}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {statsLoading ? (
          <div className="flex items-center gap-2 text-sm text-[#71717A]">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("loadingStats")}
          </div>
        ) : (
          <>
            {/* Progress bar */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-[#A1A1AA] mb-1">
                <span>{progressPercent}% archive</span>
                <span>{archiveStats.archived} / {archiveStats.total}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-[#27272A]">
                <div
                  className="h-2 rounded-full bg-[#F97316] transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                <span className="text-[#A1A1AA]">
                  <span className="font-medium text-[#FAFAFA]">{archiveStats.archived}</span> archives
                </span>
              </div>
              {archiveStats.pending > 0 && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-[#A1A1AA]">
                    <span className="font-medium text-[#FAFAFA]">{archiveStats.pending}</span> en cours
                  </span>
                </div>
              )}
              {archiveStats.failed > 0 && (
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                  <span className="text-[#A1A1AA]">
                    <span className="font-medium text-[#FAFAFA]">{archiveStats.failed}</span> echoues
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Archive className="h-3.5 w-3.5 text-[#52525B]" />
                <span className="text-[#A1A1AA]">
                  <span className="font-medium text-[#FAFAFA]">{archiveStats.total}</span> {t("total")}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── Actions ─── */}
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
        <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">{t("actions")}</h3>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleCreateStructure}
            className="inline-flex items-center gap-2 rounded-md border border-[#27272A] bg-[#18181B] px-4 py-2 text-sm font-medium text-[#FAFAFA] transition-colors hover:bg-[#27272A]"
          >
            <FolderOpen className="h-4 w-4" />
            {t("createTree")}
          </button>

          <button
            type="button"
            onClick={handleArchiveExisting}
            disabled={archiving || !enabled}
            className="inline-flex items-center gap-2 rounded-md border border-[#27272A] bg-[#18181B] px-4 py-2 text-sm font-medium text-[#FAFAFA] transition-colors hover:bg-[#27272A] disabled:opacity-50"
          >
            {archiving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
            {archiving ? t("archiving") : t("archiveExisting")}
          </button>

          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={downloading || archiveStats.archived === 0}
            className="inline-flex items-center gap-2 rounded-md border border-[#F97316]/30 bg-[#F97316]/10 px-4 py-2 text-sm font-medium text-[#F97316] transition-colors hover:bg-[#F97316]/20 disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {downloading ? "Telechargement..." : t("downloadZip")}
          </button>
        </div>
      </div>
    </div>
  );
}
