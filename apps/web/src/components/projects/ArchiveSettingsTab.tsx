"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  FolderArchive,
  Download,
  Save,
  HardDrive,
  FolderOpen,
  FileText,
  Paperclip,
  Info,
  Archive,
  CheckSquare,
  Square,
  Loader2,
  RefreshCw,
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
              ? "border-brand bg-brand"
              : "border-[#27272A] bg-[#0F0F11] hover:border-muted-foreground"
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
  const [archiveStats, setArchiveStats] = useState<{
    total: number;
    archived: number;
  }>({ total: 0, archived: 0 });
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

      console.log("[ArchiveSettingsTab] Saving archive settings:", payload);

      const res = await fetch("/api/projects/archive-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[ArchiveSettingsTab] Save error:", err);
        toast.error(t("saveError") + ": " + (err.error || res.statusText));
        return;
      }

      console.log("[ArchiveSettingsTab] Settings saved successfully");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("[ArchiveSettingsTab] Network error:", err);
      toast.error(t("networkError"));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateStructure = () => {
    const folders: string[] = [];
    const basePath = path || `C:\\Chantiers\\${projectName}`;

    if (structure === "by_category") {
      folders.push(
        `${basePath}\\Correspondance`,
        `${basePath}\\Plans`,
        `${basePath}\\Soumissions`,
        `${basePath}\\PV`,
        `${basePath}\\Administratif`,
        `${basePath}\\Photos`,
        `${basePath}\\Divers`
      );
    } else if (structure === "by_date") {
      const now = new Date();
      for (let m = 0; m < 6; m++) {
        const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
        const label = d.toISOString().slice(0, 7);
        folders.push(`${basePath}\\${label}`);
      }
    } else if (structure === "by_sender") {
      folders.push(
        `${basePath}\\(dossiers crees automatiquement par expediteur)`
      );
    } else {
      folders.push(basePath);
    }

    toast.info(
      t("treeTitle") + ": " + folders.join(", ")
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
        toast.success(
          `${t("archiveExisting")} : ${data.archived} ${t("emailsArchived")}, ${data.already_archived || 0} ${t("total")}`
        );
        fetchStats();
      } else {
        toast.error(t("saveError") + ": " + (data.error || res.statusText));
      }
    } catch {
      toast.error(t("networkError"));
    } finally {
      setArchiving(false);
    }
  };

  const handleDownloadZip = () => {
    toast.info(t("downloadZipPlaceholder"));
  };

  // ─── Render ───

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
        <div className="mb-4 flex items-center gap-2">
          <FolderArchive className="h-5 w-5 text-brand" />
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
              <CheckSquare className="h-5 w-5 text-brand" />
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
      </div>

      {/* ─── Archive Path ─── */}
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
        <div className="mb-3 flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-[#71717A]" />
          <h3 className="text-sm font-semibold text-[#FAFAFA]">
            {t("rootFolder")}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder={`C:\\Chantiers\\${projectName}`}
            className="flex-1 rounded-md border border-[#27272A] px-3 py-2 text-sm text-[#FAFAFA] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            className="rounded-md border border-[#27272A] p-2 text-[#71717A] hover:bg-[#27272A]"
            title={t("browse")}
            onClick={() =>
              toast.info(t("browseDesktopOnly"))
            }
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-200 px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {t("desktopInfo")}
          </p>
        </div>
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
          className="inline-flex items-center gap-2 rounded-md bg-gold px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gold/90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? t("saving") : t("save")}
        </button>
        {saved && (
          <span className="ml-3 text-sm text-green-600 dark:text-green-400">
            {t("saveSuccess")}
          </span>
        )}
      </div>

      {/* ─── Actions ─── */}
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
        <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">{t("actions")}</h3>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleCreateStructure}
            className="inline-flex items-center gap-2 rounded-md border border-[#27272A] bg-[#0F0F11] px-4 py-2 text-sm font-medium text-[#FAFAFA] transition-colors hover:bg-[#27272A]"
          >
            <FolderOpen className="h-4 w-4" />
            {t("createTree")}
          </button>

          <button
            type="button"
            onClick={handleArchiveExisting}
            disabled={archiving || !enabled}
            className="inline-flex items-center gap-2 rounded-md border border-[#27272A] bg-[#0F0F11] px-4 py-2 text-sm font-medium text-[#FAFAFA] transition-colors hover:bg-[#27272A] disabled:opacity-50"
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
            className="inline-flex items-center gap-2 rounded-md border border-[#27272A] bg-[#0F0F11] px-4 py-2 text-sm font-medium text-[#FAFAFA] transition-colors hover:bg-[#27272A]"
          >
            <Download className="h-4 w-4" />
            {t("downloadZip")}
          </button>
        </div>
      </div>

      {/* ─── Stats ─── */}
      <div className="flex items-center gap-2 rounded-lg border border-[#27272A] bg-[#27272A] px-4 py-3">
        <Archive className="h-4 w-4 text-[#71717A]" />
        {statsLoading ? (
          <p className="text-sm text-[#71717A]">{t("loadingStats")}</p>
        ) : (
          <p className="text-sm text-[#71717A]">
            <span className="font-medium text-[#FAFAFA]">{archiveStats.archived}</span> {t("emailsArchived")}
            {" / "}
            <span className="font-medium text-[#FAFAFA]">{archiveStats.total}</span> {t("total")}
          </p>
        )}
        <button
          type="button"
          onClick={fetchStats}
          className="ml-auto text-[#71717A] hover:text-[#71717A]"
          title={t("refresh")}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
