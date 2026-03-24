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
} from "lucide-react";

interface ProjectOption {
  id: string;
  name: string;
  code: string | null;
  status: string;
}

export default function NewSubmissionPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectId, setProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [city, setCity] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
    if (f.size > 20 * 1024 * 1024) {
      setError("Fichier trop volumineux (20 Mo max).");
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

  const handleSubmit = useCallback(async () => {
    if (!file) return;
    if (!projectId && !newProjectName) {
      setError("Sélectionnez un projet ou créez-en un nouveau.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (projectId) {
        formData.append("project_id", projectId);
      } else {
        formData.append("project_name", newProjectName);
        if (clientName) formData.append("client_name", clientName);
        if (city) formData.append("city", city);
      }

      const res = await fetch("/api/submissions", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Erreur lors de la création");
      }

      const submissionId = json.submission.id;

      // Trigger analysis in background
      fetch(`/api/submissions/${submissionId}/analyze`, { method: "POST" }).catch(() => {});

      // Redirect to detail page
      router.push(`/submissions/${submissionId}`);
    } catch (err: any) {
      setError(err.message || "Erreur inattendue");
      setSubmitting(false);
    }
  }, [file, projectId, newProjectName, clientName, city, router]);

  const isValid = file && (projectId || newProjectName);

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
          <div className="bg-red-500/10 border border-red-200 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-700 dark:text-red-400 float-right">&times;</button>
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
              <button
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
              <p className="text-xs text-[#71717A] mt-1">PDF, XLSX, XLS — 20 Mo max</p>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Link
            href="/submissions"
            className="px-4 py-2 border border-[#27272A] rounded-lg text-sm text-[#FAFAFA] hover:bg-[#27272A]"
          >
            Annuler
          </Link>
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="px-6 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Envoi..." : "Importer et analyser"}
          </button>
        </div>
      </div>
    </div>
  );
}
