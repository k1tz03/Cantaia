"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  AlertTriangle,
} from "lucide-react";

interface ProjectOption {
  id: string;
  name: string;
  code: string | null;
  status: string;
}

// Upload steps for user feedback
type UploadStep = "idle" | "getting-url" | "uploading" | "creating" | "done";

export default function NewSubmissionPage() {
  const t = useTranslations("submissions");
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectId, setProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [city, setCity] = useState("");
  const [deadline, setDeadline] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [createNewProject, setCreateNewProject] = useState(false);

  useEffect(() => {
    fetch("/api/projects/list")
      .then((r) => r.json())
      .then((json) => {
        if (json.projects) {
          setProjects(
            json.projects
              .filter((p: ProjectOption) => p.status !== "archived" && p.status !== "completed")
              .sort((a: ProjectOption, b: ProjectOption) => a.name.localeCompare(b.name))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProjects(false));
  }, []);

  const handleFile = useCallback((f: File) => {
    const ext = f.name.toLowerCase().split(".").pop();
    if (!ext || !["pdf", "xlsx", "xls"].includes(ext)) {
      setError(t("new.errorUnsupportedFormat"));
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError(t("new.errorFileTooLarge"));
      return;
    }
    setFile(f);
    setError(null);
  }, [t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  // ── Safe JSON parser: checks res.ok BEFORE calling res.json() ──
  async function safeJson(res: Response): Promise<any> {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const isEntityTooLarge =
        res.status === 413 || text.toLowerCase().includes("entity too large");
      if (isEntityTooLarge) {
        throw new Error(
          t("new.errorServerFileTooLarge", {
            size: file?.size ? (file.size / 1024 / 1024).toFixed(1) : "?",
          })
        );
      }
      throw new Error(
        text.replace(/^\s*(<!DOCTYPE|<html)/i, "").slice(0, 200) ||
          t("new.errorServer", { status: res.status })
      );
    }
    return res.json();
  }

  const handleSubmit = useCallback(async () => {
    if (!file) return;
    if (!projectId && !newProjectName) {
      setError(t("new.errorSelectProject"));
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const fileType = ext === "pdf" ? "pdf" : "excel";

      // ── Step 1: Get a Supabase signed upload URL ──
      setUploadStep("getting-url");
      const urlParams = new URLSearchParams({ filename: file.name });
      if (projectId) urlParams.set("project_id", projectId);

      const urlRes = await fetch(`/api/submissions/upload-url?${urlParams}`);
      const urlJson = await safeJson(urlRes);

      // ── Step 2: Upload file DIRECTLY to Supabase Storage (bypasses Vercel) ──
      setUploadStep("uploading");
      const uploadRes = await fetch(urlJson.signed_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => "");
        throw new Error(
          t("new.errorUploadFailed", { status: uploadRes.status, message: errText.slice(0, 200) })
        );
      }

      // ── Step 3: Create submission record in DB (tiny JSON, no binary) ──
      setUploadStep("creating");
      const body: Record<string, string> = {
        storage_path: urlJson.storage_path,
        file_name: file.name,
        file_type: fileType,
      };
      if (projectId) {
        body.project_id = projectId;
      } else {
        body.project_name = newProjectName;
        if (clientName) body.client_name = clientName;
        if (city) body.city = city;
      }
      if (deadline) body.deadline = deadline;

      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await safeJson(res);
      if (!json.success) {
        throw new Error(json.error || t("new.errorCreate"));
      }

      setUploadStep("done");
      const submissionId = json.submission.id;

      // H3: do NOT fire the analysis here. A scanned PDF needs the client to drive
      // the CHUNK loop, and this page navigates away immediately — nobody would
      // pilot it, leaving the submission stuck in "analyzing". The submission is
      // created with analysis_status = "pending" and the detail page auto-starts
      // (and drives) the full pipeline on mount.
      router.push(`/submissions/${submissionId}`);
    } catch (err: any) {
      setError(err.message || t("new.errorUnexpected"));
      setSubmitting(false);
      setUploadStep("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, projectId, newProjectName, clientName, city, deadline, router, t]);

  // Human-readable step labels
  const stepLabel: Record<UploadStep, string> = {
    idle: t("new.stepIdle"),
    "getting-url": t("new.stepGettingUrl"),
    uploading: t("new.stepUploading"),
    creating: t("new.stepCreating"),
    done: t("new.stepDone"),
  };

  const isValid = file && (projectId || newProjectName);
  const isLargeFile = file && file.size > 4 * 1024 * 1024;

  // Timezone: min bound of the deadline picker must follow the local
  // Europe/Zurich date — toISOString() flips to tomorrow at 22:00 UTC in summer.
  const todayLocal = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Zurich" });

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-3xl mx-auto overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/submissions" className="p-1 hover:bg-[#27272A] rounded">
          <ArrowLeft className="h-4 w-4 text-[#A1A1AA]" />
        </Link>
        <h1 className="text-xl font-bold text-[#FAFAFA]">{t("new.title")}</h1>
      </div>

      <div className="space-y-6">
        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-400 flex-1">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-300 text-lg leading-none"
            >
              &times;
            </button>
          </div>
        )}

        {/* Project selection */}
        <div className="bg-[#0F0F11] border border-[#27272A] rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-[#FAFAFA]">{t("new.projectSection")}</h2>

          {!createNewProject ? (
            <>
              <div>
                <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                  {t("new.existingProjectLabel")}
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#27272A] rounded-lg text-sm bg-[#0F0F11] text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#F97316]/20"
                  disabled={loadingProjects}
                >
                  <option value="">
                    {loadingProjects ? t("new.loadingProjects") : t("new.selectProjectPlaceholder")}
                  </option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.code ? `(${p.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => { setCreateNewProject(true); setProjectId(""); }}
                className="text-xs text-[#F97316] hover:text-[#EA580C] flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> {t("new.createProjectCta")}
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                  {t("new.projectNameLabel")}
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder={t("new.projectNamePlaceholder")}
                  className="w-full px-3 py-2 border border-[#27272A] rounded-lg text-sm bg-[#0F0F11] text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:ring-2 focus:ring-[#F97316]/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                    {t("new.clientLabel")}
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder={t("new.clientPlaceholder")}
                    className="w-full px-3 py-2 border border-[#27272A] rounded-lg text-sm bg-[#0F0F11] text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:ring-2 focus:ring-[#F97316]/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#A1A1AA] mb-1">
                    {t("new.cityLabel")}
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder={t("new.cityPlaceholder")}
                    className="w-full px-3 py-2 border border-[#27272A] rounded-lg text-sm bg-[#0F0F11] text-[#FAFAFA] placeholder-[#71717A] focus:outline-none focus:ring-2 focus:ring-[#F97316]/20"
                  />
                </div>
              </div>
              <button
                onClick={() => { setCreateNewProject(false); setNewProjectName(""); }}
                className="text-xs text-[#A1A1AA] hover:text-[#FAFAFA]"
              >
                {t("new.useExistingProject")}
              </button>
            </>
          )}
        </div>

        {/* Deadline */}
        <div className="bg-[#0F0F11] border border-[#27272A] rounded-xl p-6 space-y-2">
          <h2 className="text-sm font-semibold text-[#FAFAFA]">{t("new.deadlineTitle")}</h2>
          <p className="text-xs text-[#A1A1AA]">
            {t("new.deadlineHint")}
          </p>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            min={todayLocal}
            className="w-full sm:w-64 px-3 py-2 border border-[#27272A] rounded-lg text-sm bg-[#0F0F11] text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 [color-scheme:dark]"
          />
        </div>

        {/* File upload */}
        <div
          className={`bg-[#0F0F11] border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
            dragOver ? "border-[#F97316] bg-[#F97316]/5" :
            file ? "border-green-300 bg-green-500/10" :
            "border-[#27272A] hover:border-[#F97316]/50"
          }`}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => !submitting && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.xlsx,.xls"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            className="hidden"
          />
          {file ? (
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center mb-3">
                {file.name.toLowerCase().endsWith(".pdf") ? (
                  <FileText className="h-6 w-6 text-red-500" />
                ) : (
                  <FileSpreadsheet className="h-6 w-6 text-green-600" />
                )}
              </div>
              <p className="text-sm font-medium text-[#FAFAFA]">{file.name}</p>
              <p className="text-xs text-[#A1A1AA] mt-1">
                {t("new.fileSize", { size: (file.size / 1024).toFixed(0) })}
              </p>
              {/* Warning for large files */}
              {isLargeFile && (
                <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {t("new.largeFileWarning")}
                </p>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-xs text-[#A1A1AA] hover:text-red-500 mt-2"
              >
                {t("new.removeFile")}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-xl bg-[#27272A] flex items-center justify-center mb-3">
                <Upload className="h-6 w-6 text-[#A1A1AA]" />
              </div>
              <p className="text-sm font-medium text-[#FAFAFA]">
                {t("new.dropZoneTitle")}
              </p>
              <p className="text-xs text-[#A1A1AA] mt-1">{t("new.dropZoneFormats")}</p>
            </div>
          )}
        </div>

        {/* Upload progress indicator */}
        {submitting && uploadStep !== "idle" && (
          <div className="bg-[#18181B] border border-[#27272A] rounded-xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <Loader2 className="h-4 w-4 animate-spin text-[#F97316]" />
              <p className="text-sm font-medium text-[#FAFAFA]">{stepLabel[uploadStep]}</p>
            </div>
            {/* Step progress dots */}
            <div className="flex items-center gap-2">
              {(["getting-url", "uploading", "creating"] as const).map((step, i) => {
                const stepOrder = ["getting-url", "uploading", "creating", "done"];
                const currentIdx = stepOrder.indexOf(uploadStep);
                const thisIdx = stepOrder.indexOf(step);
                const isDone = currentIdx > thisIdx;
                const isActive = currentIdx === thisIdx;
                return (
                  <div key={step} className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full transition-colors ${
                        isDone ? "bg-green-500" :
                        isActive ? "bg-[#F97316] animate-pulse" :
                        "bg-[#27272A]"
                      }`}
                    />
                    {i < 2 && <div className="w-6 h-px bg-[#27272A]" />}
                  </div>
                );
              })}
              <span className="text-xs text-[#A1A1AA] ml-2">
                {uploadStep === "getting-url" && t("new.stepHintGettingUrl")}
                {uploadStep === "uploading" && t("new.stepHintUploading")}
                {uploadStep === "creating" && t("new.stepHintCreating")}
              </span>
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Link
            href="/submissions"
            className="px-4 py-2 border border-[#27272A] rounded-lg text-sm text-[#FAFAFA] hover:bg-[#27272A]"
          >
            {t("new.cancel")}
          </Link>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="px-6 py-2 bg-[#F97316] text-[#0F0F11] rounded-lg text-sm font-medium hover:bg-[#EA580C] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? stepLabel[uploadStep] : t("new.stepIdle")}
          </button>
        </div>
      </div>
    </div>
  );
}
