"use client";

import { useState, useRef, useEffect } from "react";
import { FileText, Download, ExternalLink, ZoomIn, ZoomOut, Loader2 } from "lucide-react";
import { formatFileSize } from "./plan-detail-types";
import type { PlanVersion } from "./plan-detail-types";

export function PlanViewer({ version, t }: { version: PlanVersion | undefined; t: (key: string) => string }) {
  const [viewerLoading, setViewerLoading] = useState(true);
  const [zoom, setZoom] = useState(100);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fallback: hide spinner after 3s even if onLoad doesn't fire (common with PDF embeds)
  useEffect(() => {
    if (!viewerLoading) return;
    const timer = setTimeout(() => setViewerLoading(false), 3000);
    return () => clearTimeout(timer);
  }, [viewerLoading]);

  if (!version?.file_url) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-col items-center justify-center py-20">
          <FileText className="h-12 w-12 text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">{t("noFileAvailable")}</p>
        </div>
      </div>
    );
  }

  const isImage = version.file_type?.startsWith("image/");

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 bg-slate-50">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <FileText className="h-4 w-4 text-slate-400" />
          <span className="font-medium truncate max-w-[200px]">{version.file_name}</span>
          <span className="text-slate-300">&middot;</span>
          <span className="text-xs text-slate-400">{formatFileSize(version.file_size)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {isImage && (
            <>
              <button
                onClick={() => setZoom((z) => Math.max(25, z - 25))}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                title="Zoom -"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="text-xs text-slate-500 min-w-[3rem] text-center">{zoom}%</span>
              <button
                onClick={() => setZoom((z) => Math.min(400, z + 25))}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                title="Zoom +"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <div className="w-px h-4 bg-slate-200 mx-1" />
            </>
          )}
          <a
            href={version.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("openNewTab")}
          </a>
          <a
            href={version.file_url}
            download={version.file_name}
            className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            {t("download")}
          </a>
        </div>
      </div>

      <div ref={containerRef} className="relative bg-slate-100" style={{ height: "80vh" }}>
        {viewerLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 z-10">
            <Loader2 className="h-8 w-8 animate-spin text-brand mb-3" />
            <p className="text-sm text-slate-500">{t("loadingViewer")}</p>
          </div>
        )}

        {isImage ? (
          <div className="h-full overflow-auto flex items-center justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={version.file_url}
              alt={version.file_name}
              onLoad={() => setViewerLoading(false)}
              style={{ width: `${zoom}%`, maxWidth: "none" }}
              className="object-contain rounded shadow-sm"
            />
          </div>
        ) : (
          <iframe
            src={`${version.file_url}#toolbar=1&navpanes=0&view=FitH`}
            className="w-full h-full border-0"
            onLoad={() => setViewerLoading(false)}
            title={version.file_name}
          />
        )}
      </div>
    </div>
  );
}
