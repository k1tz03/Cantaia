"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  Clipboard,
  Loader2,
  CheckCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { mockParseSubmission, getConfidenceStats, type ParsedSubmission } from "@cantaia/core/submissions";

// Data will come from Supabase — empty arrays until wired
const mockProjects: any[] = [];

type ImportStep = "upload" | "parsing" | "validation";

export default function NewSubmissionPage() {
  const t = useTranslations("submissions");
  const router = useRouter();
  const [step, setStep] = useState<ImportStep>("upload");
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [reference, setReference] = useState("");
  const [fileName, setFileName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [parsed, setParsed] = useState<ParsedSubmission | null>(null);
  const [expandedLots, setExpandedLots] = useState<Set<string>>(new Set());

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "));
    }
  }, [title]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setFileName(file.name);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "));
    }
  }, [title]);

  const handleParse = useCallback(() => {
    if (!projectId || (!fileName && !pasteText)) return;
    setStep("parsing");

    // Simulate parsing delay
    setTimeout(() => {
      const result = mockParseSubmission(fileName || "soumission");
      setParsed(result);
      // Expand all lots by default
      const allLotIds = new Set(result.lots.map((_, i) => `lot-${i}`));
      setExpandedLots(allLotIds);
      setStep("validation");
    }, 2000);
  }, [projectId, fileName, pasteText]);

  const handleValidate = useCallback(() => {
    console.log("Submission validated:", { projectId, title, reference, parsed });
    router.push("/submissions");
  }, [projectId, title, reference, parsed, router]);

  const confidenceStats = parsed ? getConfidenceStats(parsed) : null;

  function toggleLot(lotKey: string) {
    setExpandedLots((prev) => {
      const next = new Set(prev);
      if (next.has(lotKey)) next.delete(lotKey);
      else next.add(lotKey);
      return next;
    });
  }

  const confidenceColor = (c: string) => {
    if (c === "high") return "bg-green-100 text-green-700";
    if (c === "medium") return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-700";
  };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-4xl mx-auto overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/submissions" className="p-1 hover:bg-gray-100 rounded">
          <ArrowLeft className="h-4 w-4 text-gray-500" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">{t("newSubmission")}</h1>
      </div>

      {step === "upload" && (
        <div className="space-y-6">
          {/* Project & basic info */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("filterProject")} *</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                  required
                >
                  <option value="">{t("allProjects")}</option>
                  {mockProjects.filter((p) => p.status === "active" || p.status === "planning").map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t("reference")}</label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="CED-2026-GO-001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("title")} *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Soumission Gros-œuvre Cèdres"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                required
              />
            </div>
          </div>

          {/* File upload */}
          <div
            className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <input
              type="file"
              accept=".pdf,.xlsx,.xls,.docx,.doc,.txt,.csv"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">{t("dragDropZone")}</p>
              <p className="text-xs text-gray-400 mt-1">{t("dragDropFormats")}</p>
              {fileName && (
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md text-sm">
                  <FileSpreadsheet className="h-4 w-4" />
                  {fileName}
                </div>
              )}
            </label>
          </div>

          {/* Paste zone */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Clipboard className="h-4 w-4 inline mr-1" />
              {t("pasteZone")}
            </label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white resize-y font-mono"
              placeholder="1.1.1  Béton C30/37 XC3  m³  360&#10;1.1.2  Béton C25/30 XC2  m³  520&#10;..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Link href="/submissions" className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50">
              {t("title") === "Soumissions" ? "Annuler" : "Cancel"}
            </Link>
            <button
              onClick={handleParse}
              disabled={!projectId || (!fileName && !pasteText)}
              className="px-6 py-2 bg-[#1E3A5F] text-white rounded-md text-sm font-medium hover:bg-[#162d4a] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("parsing").replace("...", "")} IA
            </button>
          </div>
        </div>
      )}

      {step === "parsing" && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-10 w-10 text-[#1E3A5F] animate-spin mb-4" />
          <h2 className="text-lg font-medium text-gray-900">{t("parsing")}</h2>
          <p className="text-sm text-gray-500 mt-1">{t("parsingDesc")}</p>
          <div className="w-64 h-1.5 bg-gray-200 rounded-full mt-6 overflow-hidden">
            <div className="h-full bg-[#1E3A5F] rounded-full animate-pulse" style={{ width: "60%" }} />
          </div>
        </div>
      )}

      {step === "validation" && parsed && confidenceStats && (
        <div className="space-y-6">
          {/* AI confidence summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">
                {t("aiParsed")} — {parsed.total_items} {t("items")} · {parsed.lots.length} {t("lots")}
              </span>
              <span className="ml-auto text-xs text-blue-600">
                {t("aiConfidence")} : {Math.round(parsed.overall_confidence * 100)}%
              </span>
            </div>
            <div className="flex gap-4 text-xs">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                {t("confidenceHigh")} : {confidenceStats.high}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {t("confidenceMedium")} : {confidenceStats.medium}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                {t("confidenceLow")} : {confidenceStats.low}
              </span>
            </div>
          </div>

          {/* Parsed lots */}
          {parsed.lots.map((lot, lotIdx) => {
            const lotKey = `lot-${lotIdx}`;
            const expanded = expandedLots.has(lotKey);
            return (
              <div key={lotKey} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleLot(lotKey)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">CFC {lot.cfc_code}</span>
                    <span className="text-sm font-medium text-gray-900">{lot.name}</span>
                    <span className="text-xs text-gray-400">{lot.chapters.reduce((acc, ch) => acc + ch.items.length, 0)} {t("items")}</span>
                  </div>
                </button>
                {expanded && (
                  <div className="border-t border-gray-200">
                    {lot.chapters.map((ch, chIdx) => (
                      <div key={chIdx}>
                        <div className="bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600 border-b border-gray-100">
                          {ch.code} — {ch.name}
                        </div>
                        <div className="overflow-x-auto">
                        <table className="w-full min-w-[500px]">
                          <tbody className="divide-y divide-gray-50">
                            {ch.items.map((item, itemIdx) => (
                              <tr key={itemIdx} className="hover:bg-gray-50 text-sm">
                                <td className="px-4 py-2 w-16 text-xs font-mono text-gray-500">{item.code}</td>
                                <td className="px-4 py-2 text-gray-900">{item.description}</td>
                                <td className="px-4 py-2 w-16 text-center text-xs text-gray-500">{item.unit}</td>
                                <td className="px-4 py-2 w-20 text-right text-gray-600">{item.quantity?.toLocaleString("fr-CH") || "—"}</td>
                                <td className="px-4 py-2 w-24 text-right">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${confidenceColor(item.confidence)}`}>
                                    {item.confidence === "high" ? t("confidenceHigh") : item.confidence === "medium" ? t("confidenceMedium") : t("confidenceLow")}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
            <button onClick={() => setStep("upload")} className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 sm:w-auto">
              ← Modifier
            </button>
            <button
              onClick={handleValidate}
              className="w-full px-6 py-2 bg-[#1E3A5F] text-white rounded-md text-sm font-medium hover:bg-[#162d4a] sm:w-auto"
            >
              {t("validateAll")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
