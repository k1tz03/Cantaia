"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  StickyNote,
  RefreshCw,
  Loader2,
  Ruler,
  PenTool,
  FileText,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import type { VisitPhoto, HandwrittenNotesAnalysis } from "@cantaia/database";
import { createClient } from "@/lib/supabase/client";

interface HandwrittenNotesResultProps {
  photo: VisitPhoto;
  onAnalysisComplete?: () => void;
}

export function HandwrittenNotesResult({ photo, onAnalysisComplete }: HandwrittenNotesResultProps) {
  const t = useTranslations("visits.photos");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analysis = photo.ai_analysis_result as HandwrittenNotesAnalysis | null;
  const status = photo.ai_analysis_status;

  function getPublicUrl(fileUrl: string) {
    const supabase = createClient();
    const { data } = supabase.storage.from("audio").getPublicUrl(fileUrl);
    return data.publicUrl;
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setError(null);

    try {
      const res = await fetch("/api/visits/analyze-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo_id: photo.id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Analysis failed" }));
        throw new Error(data.error);
      }

      onAnalysisComplete?.();
    } catch (err: any) {
      setError(err.message || "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  const statusIcon = {
    pending: <StickyNote className="h-4 w-4 text-gray-400" />,
    processing: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
    completed: <CheckCircle className="h-4 w-4 text-green-500" />,
    failed: <XCircle className="h-4 w-4 text-red-500" />,
  }[status] || <StickyNote className="h-4 w-4 text-gray-400" />;

  const statusLabel = {
    pending: t("pending"),
    processing: t("analyzing"),
    completed: t("analysisComplete"),
    failed: t("analysisFailed"),
  }[status] || status;

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex gap-4 p-4">
        {/* Photo preview */}
        <div className="h-32 w-32 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          <img
            src={getPublicUrl(photo.file_url)}
            alt={photo.caption || "Notes manuscrites"}
            className="h-full w-full object-cover"
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {statusIcon}
              <span className="text-sm font-medium text-gray-700">{statusLabel}</span>
              {analysis?.confidence && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                  {Math.round(analysis.confidence * 100)}%
                </span>
              )}
            </div>
            {(status === "pending" || status === "failed") && (
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={analyzing}
                className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {analyzing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                {status === "failed" ? t("reanalyze") : t("analyze")}
              </button>
            )}
          </div>

          {error && (
            <div className="mb-2 flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-1.5 text-xs text-red-700">
              <AlertTriangle className="h-3 w-3" />
              {error}
            </div>
          )}

          {status === "completed" && analysis && (
            <div className="space-y-3">
              {/* Transcribed text */}
              {analysis.transcribed_text && (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-gray-500">
                    <FileText className="h-3 w-3" />
                    {t("transcribedText")}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                    {analysis.transcribed_text}
                  </p>
                </div>
              )}

              {/* Sketches */}
              {analysis.sketches && analysis.sketches.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-gray-500">
                    <PenTool className="h-3 w-3" />
                    {t("sketchesFound")} ({analysis.sketches.length})
                  </div>
                  <ul className="space-y-1">
                    {analysis.sketches.map((sketch, i) => (
                      <li key={i} className="text-sm text-gray-600">
                        <span className="font-medium">{sketch.location && `[${sketch.location}] `}</span>
                        {sketch.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Measurements */}
              {analysis.measurements_found && analysis.measurements_found.length > 0 && (
                <div>
                  <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-gray-500">
                    <Ruler className="h-3 w-3" />
                    {t("measurementsFound")} ({analysis.measurements_found.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.measurements_found.map((m, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                        title={m.context}
                      >
                        {m.value} {m.unit} — {m.context}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {status === "processing" && (
            <p className="text-sm text-gray-400">{t("analyzingDesc")}</p>
          )}

          {status === "pending" && !analyzing && (
            <p className="text-sm text-gray-400">{t("pendingDesc")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
