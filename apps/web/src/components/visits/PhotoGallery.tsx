"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  X,
  Download,
  Trash2,
  ChevronLeft,
  ChevronRight,
  StickyNote,
  Camera,
  Edit3,
} from "lucide-react";
import type { VisitPhoto } from "@cantaia/database";
import { createClient } from "@/lib/supabase/client";

interface PhotoGalleryProps {
  photos: VisitPhoto[];
  onDelete?: (photoId: string) => void;
  onUpdateCaption?: (photoId: string, caption: string) => void;
  readOnly?: boolean;
}

export function PhotoGallery({ photos, onDelete, onUpdateCaption, readOnly = false }: PhotoGalleryProps) {
  const t = useTranslations("visits.photos");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [editingCaption, setEditingCaption] = useState<string | null>(null);
  const [captionValue, setCaptionValue] = useState("");

  if (photos.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#27272A] py-12 text-center">
        <Camera className="mx-auto mb-2 h-8 w-8 text-[#71717A]" />
        <p className="text-sm text-[#71717A]">{t("noPhotos")}</p>
      </div>
    );
  }

  function getPublicUrl(fileUrl: string) {
    const supabase = createClient();
    const { data } = supabase.storage.from("audio").getPublicUrl(fileUrl);
    return data.publicUrl;
  }

  function openLightbox(index: number) {
    setLightboxIndex(index);
  }

  function closeLightbox() {
    setLightboxIndex(null);
  }

  function navigate(delta: number) {
    if (lightboxIndex === null) return;
    const newIndex = lightboxIndex + delta;
    if (newIndex >= 0 && newIndex < photos.length) {
      setLightboxIndex(newIndex);
    }
  }

  function startEditCaption(photo: VisitPhoto) {
    setEditingCaption(photo.id);
    setCaptionValue(photo.caption || "");
  }

  function saveCaption(photoId: string) {
    if (onUpdateCaption) {
      onUpdateCaption(photoId, captionValue);
    }
    setEditingCaption(null);
  }

  async function handleDownload(photo: VisitPhoto) {
    const supabase = createClient();
    const { data } = await supabase.storage.from("audio").download(photo.file_url);
    if (!data) return;
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = photo.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {/* Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, index) => (
          <div key={photo.id} className="group relative">
            <button
              type="button"
              onClick={() => openLightbox(index)}
              className="relative aspect-square w-full overflow-hidden rounded-lg border border-[#27272A] bg-[#27272A] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getPublicUrl(photo.file_url)}
                alt={photo.caption || photo.file_name}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
              {/* Type badge */}
              <div className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                photo.photo_type === "handwritten_notes"
                  ? "bg-purple-500/10 text-purple-700 dark:text-purple-400"
                  : "bg-[#F97316]/10 text-[#F97316]"
              }`}>
                {photo.photo_type === "handwritten_notes" ? (
                  <span className="flex items-center gap-0.5"><StickyNote className="h-2.5 w-2.5" /> {t("notes")}</span>
                ) : (
                  <span className="flex items-center gap-0.5"><Camera className="h-2.5 w-2.5" /> {t("site")}</span>
                )}
              </div>
            </button>

            {/* Caption */}
            <div className="mt-1.5">
              {editingCaption === photo.id ? (
                <div className="flex gap-1">
                  <input
                    value={captionValue}
                    onChange={(e) => setCaptionValue(e.target.value)}
                    className="flex-1 rounded border border-[#27272A] px-2 py-1 text-xs"
                    placeholder={t("addCaption")}
                    onKeyDown={(e) => e.key === "Enter" && saveCaption(photo.id)}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => saveCaption(photo.id)}
                    className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <p className="flex-1 truncate text-xs text-[#71717A]">
                    {photo.caption || (
                      <span className="italic text-[#71717A]">{t("addCaption")}</span>
                    )}
                  </p>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => startEditCaption(photo)}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Edit3 className="h-3 w-3 text-[#71717A]" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Delete button */}
            {!readOnly && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(photo.id)}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3 text-white" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={closeLightbox}
        >
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute right-4 top-4 rounded-full bg-[#0F0F11]/10 p-2 text-white hover:bg-[#0F0F11]/20"
          >
            <X className="h-5 w-5" />
          </button>

          {lightboxIndex > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate(-1); }}
              className="absolute left-4 rounded-full bg-[#0F0F11]/10 p-2 text-white hover:bg-[#0F0F11]/20"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {lightboxIndex < photos.length - 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate(1); }}
              className="absolute right-4 rounded-full bg-[#0F0F11]/10 p-2 text-white hover:bg-[#0F0F11]/20"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          <div className="max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getPublicUrl(photos[lightboxIndex].file_url)}
              alt={photos[lightboxIndex].caption || ""}
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
            />
            <div className="mt-3 flex items-center justify-between text-white">
              <div>
                <p className="text-sm font-medium">
                  {photos[lightboxIndex].caption || photos[lightboxIndex].file_name}
                </p>
                <p className="text-xs text-white/60">
                  {lightboxIndex + 1} / {photos.length}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDownload(photos[lightboxIndex!])}
                className="rounded-lg bg-[#0F0F11]/10 px-3 py-1.5 text-sm text-white hover:bg-[#0F0F11]/20"
              >
                <Download className="mr-1 inline h-3.5 w-3.5" />
                {t("download")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
