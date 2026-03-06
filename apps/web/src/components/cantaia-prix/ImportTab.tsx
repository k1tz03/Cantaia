"use client";

import React, { useState, useCallback } from "react";
import {
  Loader2,
  FileText,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  Upload,
  Mail,
  Database,
  Package,
} from "lucide-react";
import { cn } from "@cantaia/ui";
import { ExtractionReviewList } from "./ExtractionReviewList";

const ACCEPTED_EXTENSIONS = [".eml", ".msg", ".pdf", ".txt", ".html", ".htm"];
const BATCH_SIZE = 2;

interface ImportTabProps {
  projects: { id: string; name: string }[];
  loadBenchmark: (projectFilter?: string) => void;
}

export function ImportTab({ projects, loadBenchmark }: ImportTabProps) {
  // File upload state
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // Extraction state
  const [extractionStatus, setExtractionStatus] = useState<string | null>(null);
  const [extractionProgress, setExtractionProgress] = useState({ total: 0, processed: 0, withPrices: 0, items: 0, errors: 0 });
  const [extractionResults, setExtractionResults] = useState<any[]>([]);
  const [extractionRunning, setExtractionRunning] = useState(false);
  const [selectedExtractions, setSelectedExtractions] = useState<Set<string>>(new Set());
  const [expandedExtraction, setExpandedExtraction] = useState<string | null>(null);
  const [extractionProjectMap, setExtractionProjectMap] = useState<Record<string, string>>({});

  // Import state
  const [importResult, setImportResult] = useState<any | null>(null);
  const [importing, setImporting] = useState(false);

  // ── Handle file drop / selection ──
  const handleFilesSelected = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter((f) => {
      const ext = "." + f.name.split(".").pop()?.toLowerCase();
      return ACCEPTED_EXTENSIONS.includes(ext);
    });
    setUploadedFiles((prev) => [...prev, ...valid]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Start extraction from uploaded files ──
  const startExtraction = useCallback(async () => {
    if (uploadedFiles.length === 0) return;
    setExtractionRunning(true);
    setExtractionStatus("extracting");
    setExtractionResults([]);
    setImportResult(null);
    setSelectedExtractions(new Set());
    setExtractionProgress({ total: uploadedFiles.length, processed: 0, withPrices: 0, items: 0, errors: 0 });

    const allResults: any[] = [];
    let processed = 0;
    let withPrices = 0;
    let items = 0;
    let errors = 0;

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < uploadedFiles.length; i += BATCH_SIZE) {
      const batch = uploadedFiles.slice(i, i + BATCH_SIZE);
      const formData = new FormData();
      for (const file of batch) {
        formData.append("files", file);
      }

      try {
        const res = await fetch("/api/pricing/extract-from-files", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          errors += batch.length;
          setExtractionProgress({ total: uploadedFiles.length, processed: processed + batch.length, withPrices, items, errors });
          processed += batch.length;
          continue;
        }

        processed += data.files_processed || batch.length;
        if (data.errors?.length) errors += data.errors.length;

        for (const r of data.results || []) {
          if (r.has_prices) {
            allResults.push(r);
            withPrices++;
            items += r.line_items?.length || 0;
          }
        }

        setExtractionProgress({ total: uploadedFiles.length, processed, withPrices, items, errors });
        setExtractionResults([...allResults]);
        setSelectedExtractions(new Set(allResults.map((r: any) => r.emailId)));
      } catch (err: unknown) {
        errors += batch.length;
        processed += batch.length;
        setExtractionProgress({ total: uploadedFiles.length, processed, withPrices, items, errors });
      }
    }

    // Auto-match project_reference against existing projects
    const autoMap: Record<string, string> = {};
    for (const r of allResults) {
      if (r.project_reference && projects.length > 0) {
        const ref = r.project_reference.toLowerCase().trim();
        const match = projects.find((p) => {
          const pName = p.name.toLowerCase().trim();
          return pName === ref || pName.includes(ref) || ref.includes(pName);
        });
        if (match) {
          autoMap[r.emailId] = match.id;
        }
      }
    }
    setExtractionProjectMap(autoMap);

    setExtractionStatus("preview_ready");
    setExtractionRunning(false);
  }, [uploadedFiles, projects]);

  // ── Import confirmed results ──
  const handleImport = useCallback(async () => {
    const confirmed = extractionResults.filter((r: any) => selectedExtractions.has(r.emailId));
    if (confirmed.length === 0) return;
    setImporting(true);
    try {
      // Attach user-selected project_id to each result
      const resultsWithProjects = confirmed.map((r: any) => ({
        ...r,
        assigned_project_id: extractionProjectMap[r.emailId] || null,
      }));
      const res = await fetch("/api/pricing/extract-from-files/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results: resultsWithProjects }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setImportResult(data);
        setExtractionStatus("completed");
        // Auto-load benchmark after import
        loadBenchmark();
      } else {
        setExtractionStatus(`error: ${data.error || "Import failed"}`);
      }
    } catch (err: unknown) {
      setExtractionStatus(`error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setImporting(false);
    }
  }, [extractionResults, selectedExtractions, extractionProjectMap, loadBenchmark]);

  return (
    <div className="space-y-4">

      {/* Import completed */}
      {importResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <h3 className="text-sm font-semibold text-green-800">Import terminé</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md bg-white p-2.5 text-center">
              <p className="text-lg font-bold text-slate-900">{importResult.suppliersCreated}</p>
              <p className="text-[10px] text-slate-500">Fournisseurs créés</p>
            </div>
            <div className="rounded-md bg-white p-2.5 text-center">
              <p className="text-lg font-bold text-slate-900">{importResult.suppliersMatched}</p>
              <p className="text-[10px] text-slate-500">Fournisseurs existants</p>
            </div>
            <div className="rounded-md bg-white p-2.5 text-center">
              <p className="text-lg font-bold text-slate-900">{importResult.offersCreated}</p>
              <p className="text-[10px] text-slate-500">Offres importées</p>
            </div>
            <div className="rounded-md bg-white p-2.5 text-center">
              <p className="text-lg font-bold text-brand">{importResult.lineItemsCreated}</p>
              <p className="text-[10px] text-slate-500">Postes de prix ajoutés</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setImportResult(null);
              setExtractionStatus(null);
              setExtractionResults([]);
              setUploadedFiles([]);
              setSelectedExtractions(new Set());
            }}
            className="mt-3 text-xs text-brand hover:underline"
          >
            Importer d'autres fichiers
          </button>
        </div>
      )}

      {/* Upload zone */}
      {!extractionRunning && extractionStatus !== "preview_ready" && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10">
              <Upload className="h-5 w-5 text-brand" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-slate-800">
                Importer vos fichiers fournisseurs
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Glissez-déposez vos fichiers (.eml, .msg, .pdf, .txt, .html) contenant des offres de prix.
                L'IA extrait automatiquement les prix, descriptions et informations fournisseurs.
              </p>
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const files = Array.from(e.dataTransfer.files);
              handleFilesSelected(files);
            }}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.multiple = true;
              input.accept = ACCEPTED_EXTENSIONS.join(",");
              input.onchange = (e) => {
                const files = Array.from((e.target as HTMLInputElement).files || []);
                handleFilesSelected(files);
              };
              input.click();
            }}
            className={cn(
              "cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              dragOver
                ? "border-brand bg-brand/5"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
            )}
          >
            <Upload className={cn("mx-auto h-8 w-8", dragOver ? "text-brand" : "text-slate-300")} />
            <p className="mt-3 text-sm font-medium text-slate-600">
              Glissez vos fichiers ici ou <span className="text-brand">cliquez pour sélectionner</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              .eml, .msg, .pdf, .txt, .html — jusqu'à 25 Mo par fichier
            </p>
          </div>

          {/* File list */}
          {uploadedFiles.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-600">
                  {uploadedFiles.length} fichier{uploadedFiles.length > 1 ? "s" : ""} sélectionné{uploadedFiles.length > 1 ? "s" : ""}
                </p>
                <button
                  type="button"
                  onClick={() => setUploadedFiles([])}
                  className="text-xs text-slate-400 hover:text-red-500"
                >
                  Tout supprimer
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border border-slate-100 divide-y divide-slate-50">
                {uploadedFiles.map((file, idx) => {
                  const ext = file.name.split(".").pop()?.toLowerCase() || "";
                  return (
                    <div key={`${file.name}-${idx}`} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                      <span className={cn(
                        "inline-flex items-center justify-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                        ext === "pdf" ? "bg-purple-50 text-purple-600" :
                        ext === "eml" || ext === "msg" ? "bg-blue-50 text-blue-600" :
                        "bg-slate-50 text-slate-500"
                      )}>
                        .{ext}
                      </span>
                      <span className="flex-1 truncate text-slate-700">{file.name}</span>
                      <span className="shrink-0 text-slate-400">{(file.size / 1024).toFixed(0)} Ko</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                        className="shrink-0 text-slate-300 hover:text-red-500"
                      >
                        &times;
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={startExtraction}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand/90"
              >
                <Sparkles className="h-4 w-4" />
                Analyser {uploadedFiles.length} fichier{uploadedFiles.length > 1 ? "s" : ""}
              </button>
            </div>
          )}

          {/* Error */}
          {extractionStatus?.startsWith("error:") && (
            <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="inline h-3.5 w-3.5 mr-1" />
              {extractionStatus.replace("error: ", "")}
            </div>
          )}

          {/* Info cards */}
          {uploadedFiles.length === 0 && (
            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="rounded-md border border-slate-100 p-3 text-center">
                <Mail className="mx-auto h-6 w-6 text-blue-500" />
                <p className="mt-1.5 text-xs font-medium text-slate-600">Emails (.eml / .msg)</p>
                <p className="text-[10px] text-slate-400">Corps de texte + PJ PDF</p>
              </div>
              <div className="rounded-md border border-slate-100 p-3 text-center">
                <FileText className="mx-auto h-6 w-6 text-purple-500" />
                <p className="mt-1.5 text-xs font-medium text-slate-600">PDF / Devis</p>
                <p className="text-[10px] text-slate-400">Analyse visuelle IA</p>
              </div>
              <div className="rounded-md border border-slate-100 p-3 text-center">
                <Database className="mx-auto h-6 w-6 text-green-500" />
                <p className="mt-1.5 text-xs font-medium text-slate-600">Base enrichie</p>
                <p className="text-[10px] text-slate-400">Prix + fournisseurs</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      {extractionRunning && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-3 mb-4">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Analyse en cours…</h3>
              <p className="text-xs text-slate-400">
                {extractionProgress.processed} / {extractionProgress.total} fichier{extractionProgress.total > 1 ? "s" : ""} analysé{extractionProgress.total > 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500"
              style={{
                width: `${extractionProgress.total > 0 ? Math.round((extractionProgress.processed / extractionProgress.total) * 100) : 0}%`,
              }}
            />
          </div>
          <div className="mt-3 flex gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              {extractionProgress.withPrices} fichier{extractionProgress.withPrices > 1 ? "s" : ""} avec prix
            </span>
            <span className="flex items-center gap-1">
              <Package className="h-3.5 w-3.5" />
              {extractionProgress.items} postes extraits
            </span>
            {extractionProgress.errors > 0 && (
              <span className="flex items-center gap-1 text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                {extractionProgress.errors} erreur{extractionProgress.errors > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Review results */}
      {extractionStatus === "preview_ready" && extractionResults.length > 0 && (
        <ExtractionReviewList
          extractionResults={extractionResults}
          selectedExtractions={selectedExtractions}
          setSelectedExtractions={setSelectedExtractions}
          expandedExtraction={expandedExtraction}
          setExpandedExtraction={setExpandedExtraction}
          extractionProjectMap={extractionProjectMap}
          setExtractionProjectMap={setExtractionProjectMap}
          projects={projects}
          importing={importing}
          handleImport={handleImport}
        />
      )}

      {/* No results found */}
      {extractionStatus === "preview_ready" && extractionResults.length === 0 && !importResult && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white py-12">
          <FileText className="h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-sm font-medium text-slate-600">Aucune offre de prix trouvée</h3>
          <p className="mt-1 max-w-sm text-center text-xs text-slate-400">
            Les fichiers analysés ne contenaient pas d'informations de prix exploitables.
          </p>
          <button
            type="button"
            onClick={() => {
              setExtractionStatus(null);
              setUploadedFiles([]);
              setExtractionResults([]);
            }}
            className="mt-4 text-xs text-brand hover:underline"
          >
            Réessayer avec d'autres fichiers
          </button>
        </div>
      )}

    </div>
  );
}
