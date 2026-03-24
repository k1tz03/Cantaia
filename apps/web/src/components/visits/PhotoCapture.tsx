"use client";

import { useState, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Camera, Upload, X, Loader2, Image as ImageIcon } from "lucide-react";

interface PhotoCaptureProps {
  visitId: string;
  orgId: string;
  photoType: "site" | "handwritten_notes";
  onPhotosUploaded: () => void;
  maxPhotos?: number;
}

interface PendingFile {
  id: string;
  file: File;
  preview: string;
  uploading: boolean;
  uploaded: boolean;
  error?: string;
}

function compressImage(file: File, maxDim = 2048): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas toBlob failed"));
        },
        "image/jpeg",
        0.85
      );
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function PhotoCapture({ visitId, orgId: _orgId, photoType, onPhotosUploaded, maxPhotos = 20 }: PhotoCaptureProps) {
  const t = useTranslations("visits.photos");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFilesSelected = useCallback((files: FileList | null) => {
    if (!files) return;
    const newFiles: PendingFile[] = [];
    const remaining = maxPhotos - pendingFiles.length;

    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i];
      if (!file.type.match(/^image\/(jpeg|png|webp)$/)) continue;
      newFiles.push({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
        file,
        preview: URL.createObjectURL(file),
        uploading: false,
        uploaded: false,
      });
    }

    setPendingFiles((prev) => [...prev, ...newFiles]);
  }, [pendingFiles.length, maxPhotos]);

  const removePending = useCallback((id: string) => {
    setPendingFiles((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const uploadAll = useCallback(async () => {
    const toUpload = pendingFiles.filter((p) => !p.uploaded);
    if (toUpload.length === 0) return;

    setUploading(true);

    for (const pending of toUpload) {
      setPendingFiles((prev) =>
        prev.map((p) => (p.id === pending.id ? { ...p, uploading: true } : p))
      );

      try {
        // Compress before upload
        const compressed = await compressImage(pending.file);
        const formData = new FormData();
        formData.append("file", compressed, pending.file.name);
        formData.append("visit_id", visitId);
        formData.append("photo_type", photoType);

        const res = await fetch("/api/visits/photos/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Upload failed" }));
          throw new Error(err.error);
        }

        setPendingFiles((prev) =>
          prev.map((p) => (p.id === pending.id ? { ...p, uploading: false, uploaded: true } : p))
        );
      } catch (err: any) {
        setPendingFiles((prev) =>
          prev.map((p) =>
            p.id === pending.id ? { ...p, uploading: false, error: err.message || "Upload failed" } : p
          )
        );
      }
    }

    setUploading(false);
    onPhotosUploaded();
  }, [pendingFiles, visitId, photoType, onPhotosUploaded]);

  const hasUnuploaded = pendingFiles.some((p) => !p.uploaded);

  return (
    <div className="space-y-3">
      {/* Buttons row */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-[#27272A] px-3 py-2 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A]"
        >
          <Camera className="h-4 w-4" />
          {t("takePhoto")}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-[#27272A] px-3 py-2 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A]"
        >
          <Upload className="h-4 w-4" />
          {t("uploadPhoto")}
        </button>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />

      {/* Preview grid */}
      {pendingFiles.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {pendingFiles.map((p) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg border border-[#27272A] bg-[#27272A]">
              <img
                src={p.preview}
                alt=""
                className="h-full w-full object-cover"
              />
              {p.uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
              {p.uploaded && (
                <div className="absolute bottom-1 right-1 rounded-full bg-green-500 p-0.5">
                  <ImageIcon className="h-3 w-3 text-white" />
                </div>
              )}
              {p.error && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-500/20">
                  <span className="text-xs font-medium text-red-700">{p.error}</span>
                </div>
              )}
              {!p.uploading && !p.uploaded && (
                <button
                  type="button"
                  onClick={() => removePending(p.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/50 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5 text-white" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {hasUnuploaded && (
        <button
          type="button"
          onClick={uploadAll}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("uploading")}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              {t("uploadCount", { count: pendingFiles.filter((p) => !p.uploaded).length })}
            </>
          )}
        </button>
      )}
    </div>
  );
}
