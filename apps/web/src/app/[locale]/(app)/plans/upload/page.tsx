"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  ArrowLeft,
  Upload,
  FileText,
  X,
  Sparkles,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@cantaia/ui";
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

export default function UploadPlanPage() {
  const t = useTranslations("plans");
  const tc = useTranslations("common");
  const router = useRouter();

  // Projects from API
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  // Form state
  const [projectId, setProjectId] = useState("");
  const [planNumber, setPlanNumber] = useState("");
  const [planTitle, setPlanTitle] = useState("");
  const [planType, setPlanType] = useState<PlanType>("execution");
  const [discipline, setDiscipline] = useState<PlanDiscipline | "">("");
  const [lotName, setLotName] = useState("");
  const [zone, setZone] = useState("");
  const [scale, setScale] = useState("");
  const [format, setFormat] = useState("");
  const [authorCompany, setAuthorCompany] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [versionCode, setVersionCode] = useState("A");
  const [notes, setNotes] = useState("");

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // Load projects on mount
  useEffect(() => {
    fetch("/api/projects/list")
      .then((res) => res.json())
      .then((data) => {
        if (data.projects) {
          setProjects(
            data.projects.map((p: any) => ({ id: p.id, name: p.name, code: p.code }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setProjectsLoading(false));
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) {
      setFile(f);
      simulateAiAnalysis(f);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      simulateAiAnalysis(f);
    }
  };

  const simulateAiAnalysis = (f: File) => {
    setAiAnalyzing(true);
    setTimeout(() => {
      const name = f.name;
      const numMatch = name.match(/(\d{3}[-_][A-Z0-9]+[-_]\d{2})/i) || name.match(/([A-Z]{2,4}[-_]\d{2,4})/i);
      if (numMatch && !planNumber) {
        setPlanNumber(numMatch[1].replace(/_/g, "-"));
      }
      const verMatch = name.match(/[Vv][-_.]?([A-Z])/i) || name.match(/[Rr]ev[-_.]?([A-Z])/i) || name.match(/[Ii]nd[-_.]?([A-Z])/i);
      if (verMatch) {
        setVersionCode(verMatch[1].toUpperCase());
      }
      setAiAnalyzing(false);
    }, 1200);
  };

  const removeFile = () => {
    setFile(null);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !projectId || !planNumber || !planTitle) return;

    setUploading(true);
    setUploadError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("project_id", projectId);
      formData.append("plan_number", planNumber);
      formData.append("plan_title", planTitle);
      formData.append("plan_type", planType);
      if (discipline) formData.append("discipline", discipline);
      if (versionCode) formData.append("version_code", versionCode);
      if (lotName) formData.append("lot_name", lotName);
      if (zone) formData.append("zone", zone);
      if (scale) formData.append("scale", scale);
      if (format) formData.append("format", format);
      if (authorCompany) formData.append("author_company", authorCompany);
      if (authorName) formData.append("author_name", authorName);
      if (notes) formData.append("notes", notes);

      const res = await fetch("/api/plans/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (data.success && data.plan_id) {
        router.push(`/plans/${data.plan_id}`);
      } else {
        setUploadError(data.error || "Erreur lors de l'upload");
        setUploading(false);
      }
    } catch (err) {
      console.error("Upload error:", err);
      setUploadError("Erreur réseau");
      setUploading(false);
    }
  };

  const isValid = file && projectId && planNumber && planTitle;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* Back link */}
        <Link href="/plans" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="h-4 w-4" />
          {t("title")}
        </Link>

        <h1 className="text-xl font-bold text-slate-900 mb-1">{t("uploadPlan")}</h1>
        <p className="text-sm text-slate-500 mb-6">{t("uploadDescription")}</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error banner */}
          {uploadError && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {uploadError}
            </div>
          )}

          {/* File upload zone */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 block">
              {t("planFile")} *
            </label>
            {!file ? (
              <div
                className={cn(
                  "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
                  dragging ? "border-brand bg-blue-50" : "border-slate-300 bg-slate-50 hover:border-slate-400"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <Upload className="h-10 w-10 text-slate-400 mb-3" />
                <p className="text-sm font-medium text-slate-600">{t("dropPlanHere")}</p>
                <p className="text-xs text-slate-400 mt-1">{t("acceptedPlanFormats")}</p>
                <label className="mt-3 cursor-pointer rounded-md bg-white border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  {t("browsePlanFiles")}
                  <input type="file" className="hidden" accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg" onChange={handleFileSelect} />
                </label>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-50">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
                  <p className="text-xs text-slate-400">{formatFileSize(file.size)}</p>
                </div>
                {aiAnalyzing && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-1 text-[10px] font-medium text-purple-600">
                    <Sparkles className="h-3 w-3 animate-pulse" />
                    {t("aiAnalyzing")}
                  </span>
                )}
                <button type="button" onClick={removeFile} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Project + Plan number row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">
                {t("filterProject")} *
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={projectsLoading}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
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
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">
                {t("colNumber")} *
              </label>
              <input
                type="text"
                value={planNumber}
                onChange={(e) => setPlanNumber(e.target.value)}
                placeholder="211-B2-04"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">
              {t("colTitle")} *
            </label>
            <input
              type="text"
              value={planTitle}
              onChange={(e) => setPlanTitle(e.target.value)}
              placeholder={t("planTitlePlaceholder")}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Type + Discipline + Version */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">
                {t("planType")}
              </label>
              <select
                value={planType}
                onChange={(e) => setPlanType(e.target.value as PlanType)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                {PLAN_TYPES.map((pt) => (
                  <option key={pt} value={pt}>{t(TYPE_KEYS[pt])}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">
                {t("colDiscipline")}
              </label>
              <select
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value as PlanDiscipline | "")}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              >
                <option value="">—</option>
                {DISCIPLINES.map((d) => (
                  <option key={d} value={d}>{t(DISCIPLINE_KEYS[d])}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">
                {t("colVersion")}
              </label>
              <input
                type="text"
                value={versionCode}
                onChange={(e) => setVersionCode(e.target.value.toUpperCase())}
                placeholder="A"
                maxLength={2}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          {/* Lot + Zone + Scale + Format */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">
                {t("colLot")}
              </label>
              <input
                type="text"
                value={lotName}
                onChange={(e) => setLotName(e.target.value)}
                placeholder="Gros-œuvre"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">
                {t("colZone")}
              </label>
              <input
                type="text"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                placeholder="Sous-sol B2"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">
                {t("colScale")}
              </label>
              <input
                type="text"
                value={scale}
                onChange={(e) => setScale(e.target.value)}
                placeholder="1:50"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">
                {t("format")}
              </label>
              <input
                type="text"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                placeholder="A1"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          {/* Author */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">
                {t("authorCompany")}
              </label>
              <input
                type="text"
                value={authorCompany}
                onChange={(e) => setAuthorCompany(e.target.value)}
                placeholder="BG Ingénieurs"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">
                {t("authorName")}
              </label>
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Marc Dupont"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5 block">
              {t("notes")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t("notesPlaceholder")}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand resize-none"
            />
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <Link
              href="/plans"
              className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              {tc("cancel")}
            </Link>
            <button
              type="submit"
              disabled={!isValid || uploading}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors",
                isValid && !uploading
                  ? "bg-brand hover:bg-brand/90"
                  : "bg-slate-300 cursor-not-allowed"
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
                  {t("uploadPlan")}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
