"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useProject } from "@/lib/hooks/use-supabase-data";
import {
  ArrowLeft,
  Upload,
  FileText,
  Camera,
  Loader2,
  CheckCircle,
  X,
  AlertTriangle,
} from "lucide-react";

export default function UploadSignedPVPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("closure");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { project, loading: projectLoading } = useProject(params.id as string);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [receptionId, setReceptionId] = useState<string | null>(null);

  const projectId = params.id as string;

  // Fetch existing reception record via server-side API (bypasses RLS)
  useEffect(() => {
    async function fetchReception() {
      try {
        const res = await fetch(`/api/projects/${projectId}/closure/data`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.reception?.id) setReceptionId(data.reception.id);
      } catch (err) {
        console.warn("[UploadSignedPV] Failed to fetch reception:", err);
      }
    }
    fetchReception();
  }, [projectId]);

  const acceptedTypes = ["application/pdf", "image/jpeg", "image/png"];
  const maxSize = 20 * 1024 * 1024; // 20 MB
  const minSize = 10 * 1024; // 10 KB (not empty)

  const handleFile = useCallback((f: File) => {
    if (!acceptedTypes.includes(f.type)) {
      alert("Format non supporté. Utilisez PDF, JPG ou PNG.");
      return;
    }
    if (f.size > maxSize) {
      alert("Fichier trop volumineux (max 20 MB).");
      return;
    }
    if (f.size < minSize) {
      alert("Fichier trop petit (min 10 KB). Le fichier semble vide.");
      return;
    }
    setFile(f);

    // Preview for images
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  if (projectLoading) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <p className="text-[#71717A]">{t("projectNotFound")}</p>
      </div>
    );
  }

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);

    try {
      // Step 1: Get a signed upload URL from the server (admin client, bypasses policies)
      const urlRes = await fetch(`/api/projects/${projectId}/closure/data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get-upload-url",
          filename: file.name,
        }),
      });

      if (!urlRes.ok) {
        const errData = await urlRes.json().catch(() => ({}));
        throw new Error(errData.error || `Erreur serveur: ${urlRes.status}`);
      }

      const { upload_url, storage_path } = await urlRes.json();

      // Step 2: Upload directly to Supabase Storage using the signed URL
      // This bypasses the Vercel 4.5MB body size limit
      const uploadRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload échoué: ${uploadRes.status} ${uploadRes.statusText}`);
      }

      // Step 3: Get public URL and notify server to save in DB
      // Construct the public URL from the storage path
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/audio/${storage_path}`;

      await fetch(`/api/projects/${projectId}/closure/data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upload-signed",
          signed_url: publicUrl,
          reception_id: receptionId,
        }),
      });

      // Save localStorage marker for signed PV (fallback if DB save failed)
      try {
        localStorage.setItem(
          `cantaia_pv_signed_${projectId}`,
          JSON.stringify({ signed_at: new Date().toISOString(), filename: file.name })
        );
      } catch {
        // non-fatal
      }

      setUploaded(true);
      setTimeout(() => {
        router.push(`/projects/${project.id}/closure?t=${Date.now()}`);
      }, 1500);
    } catch (error) {
      console.error("[UploadSignedPV] Error:", error);
      setUploadError(error instanceof Error ? error.message : "Erreur lors de l'upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href={`/projects/${project.id}/closure`}
          className="mt-1 rounded-md p-2 text-[#71717A] hover:bg-[#27272A] hover:text-[#71717A]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-[#FAFAFA]">
            {t("uploadSignedPV")}
          </h1>
          <p className="mt-1 text-sm text-[#71717A]">{project.name}</p>
        </div>
      </div>

      <div className="mt-8 max-w-2xl">
        <p className="text-sm text-[#71717A]">
          {t("step5Description")}
        </p>

        {/* Error banner */}
        {uploadError && (
          <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-400">{uploadError}</p>
          </div>
        )}

        {/* Success state */}
        {uploaded && (
          <div className="mt-6 rounded-md border border-green-200 bg-green-500/10 p-6 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <p className="mt-3 text-sm font-medium text-green-800 dark:text-green-400">{t("fileUploaded")}</p>
          </div>
        )}

        {/* Drop zone */}
        {!uploaded && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`mt-6 cursor-pointer rounded-md border-2 border-dashed p-12 text-center transition-colors ${
                dragOver
                  ? "border-brand bg-brand/5"
                  : file
                  ? "border-green-300 bg-green-500/10"
                  : "border-[#27272A] bg-[#27272A] hover:border-brand/50 hover:bg-brand/5"
              }`}
            >
              {file ? (
                <div className="flex flex-col items-center gap-3">
                  <FileText className="h-12 w-12 text-green-500" />
                  <div>
                    <p className="text-sm font-medium text-[#FAFAFA]">{file.name}</p>
                    <p className="text-xs text-[#71717A]">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setPreview(null);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 dark:text-red-400"
                  >
                    <X className="h-3 w-3" />
                    {t("removeFile")}
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="mx-auto h-10 w-10 text-[#71717A]" />
                  <p className="mt-3 text-sm font-medium text-[#71717A]">
                    {t("dropFileHere")}
                  </p>
                  <p className="mt-1 text-xs text-[#71717A]">
                    {t("orBrowseFiles")}
                  </p>
                  <p className="mt-2 text-[10px] text-[#71717A]">
                    {t("acceptedFormats")}
                  </p>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              className="hidden"
            />

            {/* Image preview */}
            {preview && (
              <div className="mt-4 overflow-hidden rounded-md border border-[#27272A]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Preview" className="max-h-64 w-full object-contain" />
              </div>
            )}

            {/* Camera button (mobile) */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.capture = "environment";
                  input.onchange = (e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) handleFile(f);
                  };
                  input.click();
                }}
                className="inline-flex items-center gap-2 rounded-md border border-[#27272A] px-4 py-2 text-sm text-[#71717A] hover:bg-[#27272A]"
              >
                <Camera className="h-4 w-4" />
                {t("takePhoto")}
              </button>
            </div>

            {/* Upload button */}
            {file && (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("uploadingFile")}
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      {t("uploadSignedPV")}
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
