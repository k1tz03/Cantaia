"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
      setError("Format non supporté. Utilisez PDF, XLSX ou XLS.");
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError("Fichier trop volumineux (50 Mo max).");
      return;
    }
    setFile(f);
    setError(null);
  }, []);

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
          `Fichier trop volumineux pour le serveur (${(file?.size ? (file.size / 1024 / 1024).toFixed(1) : "?") } Mo). Réessayez — l'upload direct est maintenant activé.`
        );
      }
      throw new Error(
        text.replace(/^\s*(<!DOCTYPE|<html)/i, "").slice(0, 200) ||
          `Erreur serveur (${res.status})`
      );
    }
    return res.json();
  }

  const handleSubmit = useCallback(async () => {
    if (!file) return;
    if (!projectId && !newProjectName) {
      setError("Sélectionnez un projet ou créez-en un nouveau.");
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
        throw new Error(`Échec de l'upload vers le stockage (${uploadRes.status}): ${errText.slice(0, 200)}`);
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
        throw new Error(json.error || "Erreur lors de la création");
      }

      setUploadStep("done");
      const submissionId = json.submission.id;

      // Trigger analysis in background (fire-and-forget — polling handles status)
      fetch(`/api/submissions/${submissionId}/analyze`, { method: "POST" }).catch(() => {});

      // Redirect to detail page
      router.push(`/submissions/${submissionId}`);
    } catch (err: any) {
      setError(err.message || "Erreur inattendue");
      setSubmitting(false);
      setUploadStep("idle");
    }
  }, [file, projectId, newProjectName, clientName, city, deadline, router]);

  // Human-readable step labels
  const stepLabel: Record<UploadStep, string> = {
    idle: "Importer et analyser",
    "getting-url": "Préparation...",
    uploading: "Envoi du fichier...",
    creating: "Création de la soumission...",
    done: "Redirection...",
  };

  const isValid = file && (projectId || newProjectName);
  const isLargeFile = file && file.size > 4 * 1024 * 1024;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-3xl mx-auto overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/submissions" className="p-1 hover:bg-[#27272A] rounded">
          <ArrowLeft className="h-4 w-4 text-[#71717A]" />
        </Link>
        <h1 className="text-xl font-bold text-[#FAFAFA]">Nouvelle soumission</h1>
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
          <h2 className="text-sm font-semibold text-[#FAFAFA]">Projet</h2>

          {!createNewProject ? (
            <>
              <div>
                <label className="block text-xs font-medium text-[#71717A] mb-1">
                  Projet existant
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-[#27272A] rounded-lg text-sm bg-[#0F0F11] focus:outline-none focus:ring-2 focus:ring-brand/20"
                  disabled={loadingProjects}
                >
                  <option value="">
                    {loadingProjects ? "Chargement..." : "Sélectionner un projet"}
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
                className="text-xs text-brand hover:text-brand/80 flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Créer un nouveau projet
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-[#71717A] mb-1">
                  Nom du projet *
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Les Cèdres — Gros-œuvre"
                  className="w-full px-3 py-2 border border-[#27272A] rounded-lg text-sm bg-[#0F0F11] focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#71717A] mb-1">
                    Maître d'ouvrage
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="SA Immobilière"
                    className="w-full px-3 py-2 border border-[#27272A] rounded-lg text-sm bg-[#0F0F11] focus:outline-none focus:ring-2 focus:ring-brand/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#71717A] mb-1">
                    Ville
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Lausanne"
                    className="w-full px-3 py-2 border border-[#27272A] rounded-lg text-sm bg-[#0F0F11] focus:outline-none focus:ring-2 focus:ring-brand/20"
                  />
                </div>
              </div>
              <button
                onClick={() => { setCreateNewProject(false); setNewProjectName(""); }}
                className="text-xs text-[#71717A] hover:text-[#FAFAFA]"
              >
                Utiliser un projet existant
              </button>
            </>
          )}
        </div>

        {/* Deadline */}
        <div className="bg-[#0F0F11] border border-[#27272A] rounded-xl p-6 space-y-2">
          <h2 className="text-sm font-semibold text-[#FAFAFA]">Deadline demandes de prix</h2>
          <p className="text-xs text-[#71717A]">
            Date limite pour recevoir les offres fournisseurs. Sera mentionnée dans les emails de demande de prix.
          </p>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
            className="w-full sm:w-64 px-3 py-2 border border-[#27272A] rounded-lg text-sm bg-[#0F0F11] text-[#FAFAFA] focus:outline-none focus:ring-2 focus:ring-brand/20 [color-scheme:dark]"
          />
        </div>

        {/* File upload */}
        <div
          className={`bg-[#0F0F11] border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
            dragOver ? "border-brand bg-brand/5" :
            file ? "border-green-300 bg-green-500/10" :
            "border-[#27272A] hover:border-brand/50"
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
              <p className="text-xs text-[#71717A] mt-1">{(file.size / 1024).toFixed(0)} KB</p>
              {/* Warning for large files */}
              {isLargeFile && (
                <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Fichier volumineux — l&apos;envoi peut prendre quelques secondes
                </p>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-xs text-[#71717A] hover:text-red-500 mt-2"
              >
                Supprimer
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-xl bg-[#27272A] flex items-center justify-center mb-3">
                <Upload className="h-6 w-6 text-[#71717A]" />
              </div>
              <p className="text-sm font-medium text-[#FAFAFA]">
                Glissez un descriptif ici ou cliquez pour parcourir
              </p>
              <p className="text-xs text-[#71717A] mt-1">PDF, XLSX, XLS — 50 Mo max</p>
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
              <span className="text-xs text-[#71717A] ml-2">
                {uploadStep === "getting-url" && "Préparation de l'espace de stockage"}
                {uploadStep === "uploading" && "Envoi direct vers Supabase"}
                {uploadStep === "creating" && "Enregistrement en base de données"}
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
            Annuler
          </Link>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="px-6 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? stepLabel[uploadStep] : "Importer et analyser"}
          </button>
        </div>
      </div>
    </div>
  );
}
