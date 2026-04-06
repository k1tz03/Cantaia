"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  HardDrive,
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
  const [savingLocal, setSavingLocal] = useState(false);
  const [localProgress, setLocalProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [autoLocalEnabled, setAutoLocalEnabled] = useState(false);
  const [localDirName, setLocalDirName] = useState<string | null>(null);
  const [lastLocalSyncCount, setLastLocalSyncCount] = useState(0);
  const localDirHandleRef = useRef<any>(null);
  const autoSyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncedIdsRef = useRef<Set<string>>(new Set());
  const autoSaveRef = useRef<(() => Promise<void>) | null>(null);

  // ─── localStorage helpers for persisting synced email IDs ───

  const loadSyncedIds = useCallback((): Set<string> => {
    try {
      const raw = localStorage.getItem(`cantaia_local_synced_${projectId}`);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  }, [projectId]);

  const saveSyncedIds = useCallback((ids: Set<string>) => {
    try {
      localStorage.setItem(`cantaia_local_synced_${projectId}`, JSON.stringify([...ids]));
    } catch { /* localStorage full */ }
  }, [projectId]);

  const [archiveStats, setArchiveStats] = useState<{
    total: number;
    archived: number;
    failed: number;
    pending: number;
  }>({ total: 0, archived: 0, failed: 0, pending: 0 });
  const [statsLoading, setStatsLoading] = useState(true);

  // ─── IndexedDB helpers for persisting directory handle ───
  const IDB_DB = "cantaia_archive";
  const IDB_STORE = "dir_handles";

  const saveHandleToIDB = useCallback((handle: any): Promise<void> => {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(IDB_DB, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
        req.onsuccess = () => {
          const tx = req.result.transaction(IDB_STORE, "readwrite");
          const putReq = tx.objectStore(IDB_STORE).put(handle, `project_${projectId}`);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => resolve();
        };
        req.onerror = () => resolve();
      } catch { resolve(); }
    });
  }, [projectId]);

  const loadHandleFromIDB = useCallback(async (): Promise<any | null> => {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(IDB_DB, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
        req.onsuccess = () => {
          const tx = req.result.transaction(IDB_STORE, "readonly");
          const getReq = tx.objectStore(IDB_STORE).get(`project_${projectId}`);
          getReq.onsuccess = () => resolve(getReq.result || null);
          getReq.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }, [projectId]);

  const clearHandleFromIDB = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(IDB_DB, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
        req.onsuccess = () => {
          const tx = req.result.transaction(IDB_STORE, "readwrite");
          const delReq = tx.objectStore(IDB_STORE).delete(`project_${projectId}`);
          delReq.onsuccess = () => resolve();
          delReq.onerror = () => resolve();
        };
        req.onerror = () => resolve();
      } catch { resolve(); }
    });
  }, [projectId]);

  // ─── Restore auto-local from IndexedDB on mount ───
  useEffect(() => {
    (async () => {
      const handle = await loadHandleFromIDB();
      if (!handle) return;

      // Verify we still have permission
      try {
        const perm = await handle.queryPermission({ mode: "readwrite" });
        if (perm === "granted") {
          localDirHandleRef.current = handle;
          setLocalDirName(handle.name);
          setAutoLocalEnabled(true);
        }
      } catch {
        // Permission lost — clean up
        await clearHandleFromIDB();
      }
    })();
  }, [loadHandleFromIDB, clearHandleFromIDB]);

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
            // Trigger auto-local save if enabled
            if (localDirHandleRef.current && autoSaveRef.current) {
              setTimeout(() => autoSaveRef.current?.(), 2000);
            }
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

  // ─── Save to local disk via File System Access API ───

  const supportsFileSystemAccess =
    typeof window !== "undefined" && "showDirectoryPicker" in window;

  const handleSaveLocal = async () => {
    // Fallback: if browser doesn't support File System Access API, download ZIP instead
    if (!supportsFileSystemAccess) {
      toast.error(
        "Votre navigateur ne supporte pas l'enregistrement local. Utilisez Chrome ou Edge, ou téléchargez le ZIP."
      );
      return;
    }

    if (archiveStats.archived === 0) {
      toast.error("Aucun email archivé à enregistrer");
      return;
    }

    try {
      // 1. Let the user pick a folder
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: "readwrite",
        startIn: "documents",
      });

      setSavingLocal(true);
      setLocalProgress({ current: 0, total: 0 });

      // 2. Fetch the manifest with signed download URLs
      const res = await fetch(
        `/api/emails/archive-download?project_id=${projectId}`
      );
      if (!res.ok) {
        toast.error("Erreur lors de la récupération du manifest");
        setSavingLocal(false);
        return;
      }
      const manifest = await res.json();
      const archives: Array<{
        file_name: string;
        folder_name: string | null;
        download_url: string | null;
      }> = manifest.archives || [];

      const toDownload = archives.filter((a) => a.download_url);
      setLocalProgress({ current: 0, total: toDownload.length });

      if (toDownload.length === 0) {
        toast.error("Aucun fichier disponible au téléchargement");
        setSavingLocal(false);
        return;
      }

      // 3. Create the project root folder
      const projectFolderName = projectName
        .replace(/[^a-zA-Z0-9À-ÿ _-]/g, "_")
        .substring(0, 80);
      const projectDir = await dirHandle.getDirectoryHandle(
        projectFolderName,
        { create: true }
      );

      // 4. Download each file and write to the local folder structure
      let saved = 0;
      let failed = 0;

      for (const arc of toDownload) {
        try {
          // Create subfolder if folder_name exists
          let targetDir = projectDir;
          if (arc.folder_name) {
            // Handle nested paths like "01_Correspondance/03_Entreprises"
            const parts = arc.folder_name.split("/").filter(Boolean);
            for (const part of parts) {
              const safePart = part.replace(/[<>:"|?*]/g, "_");
              targetDir = await targetDir.getDirectoryHandle(safePart, {
                create: true,
              });
            }
          }

          // Download the file from signed URL
          const fileRes = await fetch(arc.download_url!);
          if (!fileRes.ok) {
            failed++;
            continue;
          }
          const fileBlob = await fileRes.blob();

          // Sanitize filename and ensure .eml extension
          let fileName = (arc.file_name || "email")
            .replace(/[<>:"|?*]/g, "_")
            .substring(0, 200);
          if (!fileName.endsWith(".eml")) {
            fileName += ".eml";
          }

          // Write the file
          const fileHandle = await targetDir.getFileHandle(fileName, {
            create: true,
          });
          const writable = await fileHandle.createWritable();
          await writable.write(fileBlob);
          await writable.close();

          saved++;
          setLocalProgress({ current: saved, total: toDownload.length });
        } catch (err) {
          console.warn("[save-local] Error saving file:", arc.file_name, err);
          failed++;
        }
      }

      if (failed > 0) {
        toast.warning(
          `${saved} fichiers enregistrés, ${failed} erreurs`
        );
      } else {
        toast.success(
          `${saved} fichiers enregistrés dans "${projectFolderName}"`
        );
      }
    } catch (err: any) {
      // User cancelled the directory picker
      if (err?.name === "AbortError") {
        // User cancelled — silent
        return;
      }
      console.error("[save-local] Error:", err);
      toast.error("Erreur lors de l'enregistrement local");
    } finally {
      setSavingLocal(false);
      setLocalProgress({ current: 0, total: 0 });
    }
  };

  // ─── Auto-save new archives to local disk ───

  const autoSaveNewArchives = useCallback(async () => {
    const dirHandle = localDirHandleRef.current;
    if (!dirHandle) return;

    try {
      // Verify permission is still granted
      const perm = await dirHandle.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        const requested = await dirHandle.requestPermission({ mode: "readwrite" });
        if (requested !== "granted") {
          setAutoLocalEnabled(false);
          setLocalDirName(null);
          localDirHandleRef.current = null;
          await clearHandleFromIDB();
          return;
        }
      }

      // Fetch manifest with signed download URLs
      const res = await fetch(`/api/emails/archive-download?project_id=${projectId}`);
      if (!res.ok) return;
      const manifest = await res.json();

      const archives: Array<{
        email_id: string;
        file_name: string;
        folder_name: string | null;
        download_url: string | null;
      }> = manifest.archives || [];

      // Filter to only new archives not yet synced locally
      const newArchives = archives.filter(
        (a) => a.download_url && !syncedIdsRef.current.has(a.email_id)
      );

      if (newArchives.length === 0) return;

      // Create project folder
      const projectFolderName = projectName
        .replace(/[^a-zA-Z0-9À-ÿ _-]/g, "_")
        .substring(0, 80);
      const projectDir = await dirHandle.getDirectoryHandle(projectFolderName, {
        create: true,
      });

      let saved = 0;
      for (const arc of newArchives) {
        try {
          let targetDir = projectDir;
          if (arc.folder_name) {
            const parts = arc.folder_name.split("/").filter(Boolean);
            for (const part of parts) {
              const safePart = part.replace(/[<>:"|?*]/g, "_");
              targetDir = await targetDir.getDirectoryHandle(safePart, {
                create: true,
              });
            }
          }

          const fileRes = await fetch(arc.download_url!);
          if (!fileRes.ok) continue;
          const fileBlob = await fileRes.blob();

          let fileName = (arc.file_name || "email")
            .replace(/[<>:"|?*]/g, "_")
            .substring(0, 200);
          if (!fileName.endsWith(".eml")) fileName += ".eml";

          const fileHandle = await targetDir.getFileHandle(fileName, {
            create: true,
          });
          const writable = await fileHandle.createWritable();
          await writable.write(fileBlob);
          await writable.close();

          syncedIdsRef.current.add(arc.email_id);
          saved++;
        } catch (err) {
          console.warn("[auto-local] Error saving file:", arc.file_name, err);
        }
      }

      if (saved > 0) {
        saveSyncedIds(syncedIdsRef.current);
        setLastLocalSyncCount(syncedIdsRef.current.size);
        toast.success(
          `${saved} nouveau(x) email(s) enregistre(s) en local`,
          { duration: 3000 }
        );
      }
    } catch (err) {
      console.warn("[auto-local] Auto-sync error:", err);
    }
  }, [projectId, projectName, clearHandleFromIDB, saveSyncedIds]);

  // Keep ref in sync for use in pollArchiveProgress
  autoSaveRef.current = autoSaveNewArchives;

  // ─── Enable / Disable auto-local ───

  const handleEnableAutoLocal = async () => {
    if (!supportsFileSystemAccess) return;

    try {
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: "readwrite",
        startIn: "documents",
      });

      localDirHandleRef.current = dirHandle;
      setLocalDirName(dirHandle.name);
      await saveHandleToIDB(dirHandle);

      // Load any previously synced IDs
      syncedIdsRef.current = loadSyncedIds();
      setLastLocalSyncCount(syncedIdsRef.current.size);

      // This triggers the auto-sync interval effect
      setAutoLocalEnabled(true);

      toast.success(`Enregistrement automatique active dans "${dirHandle.name}"`);
    } catch (err: any) {
      if (err?.name === "AbortError") return; // User cancelled
      console.error("[auto-local] Enable error:", err);
      toast.error("Erreur lors de la selection du dossier");
    }
  };

  const handleDisableAutoLocal = async () => {
    // Stop interval immediately
    if (autoSyncIntervalRef.current) {
      clearInterval(autoSyncIntervalRef.current);
      autoSyncIntervalRef.current = null;
    }

    // Clear persisted data
    await clearHandleFromIDB();
    try {
      localStorage.removeItem(`cantaia_local_synced_${projectId}`);
    } catch { /* ok */ }

    // Reset state
    localDirHandleRef.current = null;
    syncedIdsRef.current = new Set();
    setAutoLocalEnabled(false);
    setLocalDirName(null);
    setLastLocalSyncCount(0);

    toast.info("Enregistrement local automatique desactive");
  };

  // ─── Auto-sync interval — starts/stops when autoLocalEnabled changes ───

  useEffect(() => {
    if (!autoLocalEnabled || !localDirHandleRef.current) {
      if (autoSyncIntervalRef.current) {
        clearInterval(autoSyncIntervalRef.current);
        autoSyncIntervalRef.current = null;
      }
      return;
    }

    // Load synced IDs on activation
    syncedIdsRef.current = loadSyncedIds();
    setLastLocalSyncCount(syncedIdsRef.current.size);

    // Initial sync check (small delay to avoid race with mount)
    const initialTimeout = setTimeout(() => {
      autoSaveNewArchives();
    }, 3000);

    // Poll every 60s for new archives
    autoSyncIntervalRef.current = setInterval(() => {
      autoSaveNewArchives();
    }, 60_000);

    return () => {
      clearTimeout(initialTimeout);
      if (autoSyncIntervalRef.current) {
        clearInterval(autoSyncIntervalRef.current);
        autoSyncIntervalRef.current = null;
      }
    };
  }, [autoLocalEnabled, autoSaveNewArchives, loadSyncedIds]);

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

          {supportsFileSystemAccess && (
            <button
              type="button"
              onClick={handleSaveLocal}
              disabled={savingLocal || archiveStats.archived === 0}
              className="inline-flex items-center gap-2 rounded-md border border-[#3B82F6]/30 bg-[#3B82F6]/10 px-4 py-2 text-sm font-medium text-[#3B82F6] transition-colors hover:bg-[#3B82F6]/20 disabled:opacity-50"
            >
              {savingLocal ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <HardDrive className="h-4 w-4" />
              )}
              {savingLocal
                ? `Enregistrement... (${localProgress.current}/${localProgress.total})`
                : "Enregistrer en local"}
            </button>
          )}
        </div>

        {/* Hint for browsers without File System Access API */}
        {!supportsFileSystemAccess && (
          <p className="mt-3 text-xs text-[#52525B]">
            💡 Pour enregistrer les fichiers directement sur votre disque (sans ZIP), utilisez Chrome ou Edge.
          </p>
        )}
      </div>

      {/* ─── Auto-enregistrement local ─── */}
      {supportsFileSystemAccess && (
        <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
          <div className="mb-3 flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-[#71717A]" />
            <h3 className="text-sm font-semibold text-[#FAFAFA]">
              Enregistrement local automatique
            </h3>
          </div>

          <p className="mb-4 text-xs text-[#71717A]">
            Les emails archives seront automatiquement enregistres sur votre disque a chaque synchronisation.
          </p>

          {autoLocalEnabled ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md bg-[#18181B] px-3 py-2">
                <FolderOpen className="h-4 w-4 text-[#F97316]" />
                <span className="text-sm text-[#FAFAFA] truncate">{localDirName}</span>
                <span className="ml-auto flex shrink-0 items-center gap-1 text-xs text-green-400">
                  <CheckCircle2 className="h-3 w-3" /> Actif
                </span>
              </div>
              {lastLocalSyncCount > 0 && (
                <p className="text-xs text-[#A1A1AA]">
                  {lastLocalSyncCount} fichier(s) synchronise(s) en local
                </p>
              )}
              <button
                type="button"
                onClick={handleDisableAutoLocal}
                className="text-xs text-red-400 transition-colors hover:text-red-300"
              >
                Desactiver l&apos;enregistrement automatique
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleEnableAutoLocal}
              disabled={!enabled}
              className="inline-flex items-center gap-2 rounded-md border border-[#27272A] bg-[#18181B] px-4 py-2 text-sm font-medium text-[#FAFAFA] transition-colors hover:bg-[#27272A] disabled:opacity-50"
            >
              <FolderOpen className="h-4 w-4" />
              Choisir un dossier et activer
            </button>
          )}

          {!enabled && !autoLocalEnabled && (
            <p className="mt-3 text-xs text-[#52525B]">
              Activez l&apos;archivage automatique ci-dessus pour utiliser cette fonctionnalite.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
