"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  ArrowLeft,
  Upload,
  FileText,
  X,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Plus,
} from "lucide-react";
import { cn } from "@cantaia/ui";
import { createClient } from "@/lib/supabase/client";
import type { PlanType, PlanDiscipline } from "@cantaia/database";

const PLAN_TYPES: PlanType[] = ["execution", "detail", "principle", "as_built", "shop_drawing", "schema"];
const DISCIPLINES: PlanDiscipline[] = ["architecture", "structure", "cvcs", "electricite", "sanitaire", "facades", "amenagement"];

const DISCIPLINE_KEYS: Record<string, string> = {
  architecture: "disciplineArchitecture",
  structure: "disciplineStructure",
  cvcs: "disciplineCvcs",
  electricite: "disciplineElectricite",
  sanitaire: "disciplineSanitaire",
  facades: "disciplineFacades",
  amenagement: "disciplineAmenagement",
};

const TYPE_KEYS: Record<string, string> = {
  execution: "typeExecution",
  detail: "typeDetail",
  principle: "typePrinciple",
  as_built: "typeAsBuilt",
  shop_drawing: "typeShopDrawing",
  schema: "typeSchema",
};

interface ProjectItem {
  id: string;
  name: string;
  code: string | null;
}

interface FileEntry {
  id: string;
  file: File;
  planNumber: string;
  planTitle: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  planId?: string;
}

// Allow-list appliquée AUX DEUX chemins d'ajout (file picker ET drag&drop —
// l'attribut `accept` ne filtre QUE le picker). On refuse explicitement les
// SVG (vecteur XSS servi depuis le domaine Supabase) et tout exécutable.
const ALLOWED_EXTENSIONS = [".pdf", ".dwg", ".dxf", ".png", ".jpg", ".jpeg"];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB (aligné sur le bucket)

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function extractPlanInfo(fileName: string): { number: string; title: string } {
  const name = fileName.replace(/\.[^.]+$/, ""); // remove extension
  const numMatch = name.match(/(\d{3,4}[-_][A-Z0-9]+[-_]\d{2,6})/i) || name.match(/([A-Z]{2,4}[-_]\d{2,4})/i);
  const planNumber = numMatch ? numMatch[1].replace(/_/g, "-") : "";
  // Use filename (cleaned) as default title
  const planTitle = name.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return { number: planNumber, title: planTitle };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPlanPage() {
  const t = useTranslations("plans");
  const tc = useTranslations("common");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Projects from API
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  // Shared settings for all files
  const [projectId, setProjectId] = useState("");
  const [planType, setPlanType] = useState<PlanType>("execution");
  const [discipline, setDiscipline] = useState<PlanDiscipline | "">("");
  const [versionCode, setVersionCode] = useState("A");

  // Files queue
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [globalError, setGlobalError] = useState("");

  // Load projects
  useEffect(() => {
    fetch("/api/projects/list")
      .then((res) => res.json())
      .then((data) => {
        if (data.projects) {
          setProjects(data.projects.map((p: any) => ({ id: p.id, name: p.name, code: p.code })));
        }
      })
      .catch(() => {})
      .finally(() => setProjectsLoading(false));
  }, []);

  const addFiles = (newFiles: FileList | File[]) => {
    const rejected: string[] = [];
    const accepted = Array.from(newFiles).filter((f) => {
      if (files.some((e) => e.file.name === f.name && e.file.size === f.size)) return false;
      const ext = fileExtension(f.name);
      if (!ALLOWED_EXTENSIONS.includes(ext) || f.type === "image/svg+xml") {
        rejected.push(`${f.name} — ${t("uploadRejectedType")}`);
        return false;
      }
      if (f.size > MAX_FILE_SIZE_BYTES) {
        rejected.push(`${f.name} — ${t("uploadRejectedSize")}`);
        return false;
      }
      return true;
    });

    if (rejected.length > 0) {
      setGlobalError(rejected.join(" · "));
    } else {
      setGlobalError("");
    }

    const entries: FileEntry[] = accepted.map((f) => {
      const info = extractPlanInfo(f.name);
      return {
        id: crypto.randomUUID(),
        file: f,
        planNumber: info.number,
        planTitle: info.title,
        status: "pending" as const,
      };
    });
    if (entries.length > 0) setFiles((prev) => [...prev, ...entries]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = ""; // reset so same file can be re-selected
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFile = (id: string, patch: Partial<FileEntry>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pending = files.filter((f) => f.status === "pending" || f.status === "error");
    if (!projectId || pending.length === 0) return;

    setUploading(true);
    setGlobalError("");

    // Get user info via API route (bypasses RLS recursion on users table)
    let userId: string;
    try {
      const profileRes = await fetch("/api/user/profile");
      const profileData = await profileRes.json();
      userId = profileData?.profile?.id || profileData?.user?.id;
      if (!userId) {
        // Fallback: try Supabase auth directly
        const supabase2 = createClient();
        const { data: { user: authUser } } = await supabase2.auth.getUser();
        if (!authUser) {
          setGlobalError(t("uploadNotAuthenticated"));
          setUploading(false);
          return;
        }
        userId = authUser.id;
      }
    } catch {
      setGlobalError(t("uploadNotAuthenticated"));
      setUploading(false);
      return;
    }

    const supabase = createClient();

    // On accumule les résultats DANS la boucle : le state `files` capturé dans
    // cette closure n'est jamais rafraîchi (updateFile crée de nouveaux objets
    // sans muter les anciens), donc reconstruire la redirection depuis `files`
    // laissait tout en `pending` et `planId` undefined → redirection morte.
    const results: { id: string; planId?: string }[] = [];

    for (const entry of pending) {
      updateFile(entry.id, { status: "uploading", error: undefined });

      try {
        // 1. Upload file directly to Supabase Storage (bypasses Vercel payload limit)
        const timestamp = Date.now();
        const safeName = entry.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const storagePath = `${userId}/${projectId}/${timestamp}_${safeName}`;

        const { error: storageError } = await supabase.storage
          .from("plans")
          .upload(storagePath, entry.file, {
            contentType: entry.file.type || "application/pdf",
            upsert: false,
          });

        if (storageError) {
          updateFile(entry.id, { status: "error", error: storageError.message });
          continue;
        }

        // 2. Get public URL
        const { data: urlData } = supabase.storage.from("plans").getPublicUrl(storagePath);
        const fileUrl = urlData?.publicUrl || "";

        // 3. Create DB records via API (metadata only, no file in body)
        const res = await fetch("/api/plans/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            plan_number: entry.planNumber || entry.file.name.replace(/\.[^.]+$/, ""),
            plan_title: entry.planTitle || entry.file.name,
            file_url: fileUrl,
            file_name: entry.file.name,
            file_size: entry.file.size,
            file_type: entry.file.type || "application/pdf",
            plan_type: planType,
            discipline: discipline || null,
            version_code: versionCode,
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          updateFile(entry.id, { status: "done", planId: data.plan_id });
          results.push({ id: entry.id, planId: data.plan_id });
        } else {
          if (res.status === 401) {
            router.replace("/login");
            return;
          }
          updateFile(entry.id, { status: "error", error: data.error || t("uploadDbError") });
        }
      } catch (err: unknown) {
        updateFile(entry.id, { status: "error", error: err instanceof Error ? err.message : t("uploadGenericError") });
      }
    }

    setUploading(false);

    // Redirection décidée sur les résultats RÉELS accumulés dans la boucle.
    const doneFiles = results.filter((r) => r.planId);
    if (doneFiles.length === 1 && doneFiles[0].planId) {
      router.push(`/plans/${doneFiles[0].planId}`);
    } else if (doneFiles.length > 0) {
      router.push("/plans");
    }
  };

  const pendingCount = files.filter((f) => f.status === "pending" || f.status === "error").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const isValid = projectId && pendingCount > 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* Back link */}
        <Link href="/plans" className="flex items-center gap-1.5 text-sm text-[#A1A1AA] hover:text-[#FAFAFA] mb-4">
          <ArrowLeft className="h-4 w-4" />
          {t("title")}
        </Link>

        <h1 className="text-xl font-bold text-[#FAFAFA] mb-1">{t("uploadPlan")}</h1>
        <p className="text-sm text-[#A1A1AA] mb-6">{t("uploadDescription")}</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error banner */}
          {globalError && (
            <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-500/20">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {globalError}
            </div>
          )}

          {/* File drop zone */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] mb-2 block">
              {t("planFile")} *
            </label>
            <div
              className={cn(
                "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors",
                dragging ? "border-brand bg-[#F97316]/10" : "border-[#27272A] bg-[#27272A] hover:border-[#27272A]"
              )}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-8 w-8 text-[#A1A1AA] mb-2" />
              <p className="text-sm font-medium text-[#A1A1AA]">{t("dropPlanHere")}</p>
              <p className="text-xs text-[#A1A1AA] mt-1">{t("acceptedPlanFormats")} — {t("multipleFilesAllowed")}</p>
              <label className="mt-3 cursor-pointer rounded-md bg-[#0F0F11] border border-[#27272A] px-4 py-2 text-xs font-medium text-[#A1A1AA] hover:bg-[#27272A]">
                {t("browsePlanFiles")}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg"
                  multiple
                  onChange={handleFileSelect}
                />
              </label>
            </div>
          </div>

          {/* Files list */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
                  {t("planFiles")} ({files.length})
                </p>
                {doneCount > 0 && (
                  <span className="text-xs text-green-600 font-medium">{doneCount} {t("uploaded")}</span>
                )}
              </div>
              {files.map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    "rounded-lg border bg-[#0F0F11] p-3",
                    entry.status === "done" ? "border-green-500/20 bg-green-500/5" :
                    entry.status === "error" ? "border-red-500/20 bg-red-500/5" :
                    entry.status === "uploading" ? "border-[#F97316]/20 bg-[#F97316]/10/30" :
                    "border-[#27272A]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md shrink-0",
                      entry.status === "done" ? "bg-green-100" :
                      entry.status === "error" ? "bg-red-100" :
                      entry.status === "uploading" ? "bg-blue-100" : "bg-[#F97316]/10"
                    )}>
                      {entry.status === "uploading" ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[#F97316]" />
                      ) : entry.status === "done" ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : entry.status === "error" ? (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      ) : (
                        <FileText className="h-4 w-4 text-[#F97316]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#FAFAFA] truncate">{entry.file.name}</p>
                      <p className="text-[11px] text-[#A1A1AA]">{formatFileSize(entry.file.size)}</p>
                      {entry.error && <p className="text-[11px] text-red-500 mt-0.5">{entry.error}</p>}
                    </div>
                    {/* Editable plan number + title for pending files */}
                    {(entry.status === "pending" || entry.status === "error") && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={entry.planNumber}
                          onChange={(e) => updateFile(entry.id, { planNumber: e.target.value })}
                          placeholder={t("uploadPlanNumberPlaceholder")}
                          className="w-24 rounded border border-[#27272A] px-2 py-1 text-xs text-[#FAFAFA] focus:border-brand focus:outline-none"
                        />
                        <input
                          type="text"
                          value={entry.planTitle}
                          onChange={(e) => updateFile(entry.id, { planTitle: e.target.value })}
                          placeholder={t("uploadTitlePlaceholder")}
                          className="w-48 rounded border border-[#27272A] px-2 py-1 text-xs text-[#FAFAFA] focus:border-brand focus:outline-none"
                        />
                      </div>
                    )}
                    {entry.status === "done" && entry.planId && (
                      <Link
                        href={`/plans/${entry.planId}`}
                        className="text-xs font-medium text-brand hover:underline"
                      >
                        {t("viewPlan")}
                      </Link>
                    )}
                    {entry.status !== "uploading" && entry.status !== "done" && (
                      <button
                        type="button"
                        onClick={() => removeFile(entry.id)}
                        className="rounded-md p-1 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#A1A1AA]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {/* Add more files */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#27272A] py-2 text-xs font-medium text-[#A1A1AA] hover:border-[#27272A] hover:text-[#A1A1AA]"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("addMoreFiles")}
              </button>
            </div>
          )}

          {/* Project + settings */}
          {files.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] mb-1.5 block">
                    {t("filterProject")} *
                  </label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    disabled={projectsLoading}
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
                  >
                    <option value="">{projectsLoading ? tc("loading") : t("selectProject")}</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code ? `${p.code} — ${p.name}` : p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] mb-1.5 block">
                    {t("colVersion")}
                  </label>
                  <input
                    type="text"
                    value={versionCode}
                    onChange={(e) => setVersionCode(e.target.value.toUpperCase())}
                    placeholder="A"
                    maxLength={2}
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#A1A1AA] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] mb-1.5 block">
                    {t("planType")}
                  </label>
                  <select
                    value={planType}
                    onChange={(e) => setPlanType(e.target.value as PlanType)}
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    {PLAN_TYPES.map((pt) => (
                      <option key={pt} value={pt}>{t(TYPE_KEYS[pt])}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] mb-1.5 block">
                    {t("colDiscipline")}
                  </label>
                  <select
                    value={discipline}
                    onChange={(e) => setDiscipline(e.target.value as PlanDiscipline | "")}
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                  >
                    <option value="">—</option>
                    {DISCIPLINES.map((d) => (
                      <option key={d} value={d}>{t(DISCIPLINE_KEYS[d])}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 border-t border-[#27272A] pt-4">
            <Link
              href="/plans"
              className="rounded-md border border-[#27272A] px-4 py-2 text-sm font-medium text-[#A1A1AA] hover:bg-[#27272A]"
            >
              {tc("cancel")}
            </Link>
            <button
              type="submit"
              disabled={!isValid || uploading}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors",
                isValid && !uploading
                  ? "bg-[#F97316] text-[#0F0F11] hover:bg-[#EA580C]"
                  : "bg-[#27272A] text-[#A1A1AA] cursor-not-allowed"
              )}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("uploading")}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  {t("uploadPlan")} {pendingCount > 1 && `(${pendingCount})`}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
