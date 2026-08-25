"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  LayoutTemplate,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { withFallback } from "./pv-i18n";
import type { PVTemplateSection } from "./types";

interface PVTemplateModalProps {
  onClose: () => void;
}

/**
 * "Modèle de PV" — the org's own séance outline.
 *
 * Deliberately lives on the PV screen and not in Settings: the need is felt
 * while reading a generated PV whose sections are in the wrong order, and
 * Settings is another agent's surface.
 */
export function PVTemplateModal({ onClose }: PVTemplateModalProps) {
  const t = withFallback(useTranslations("pv"));

  const [sections, setSections] = useState<PVTemplateSection[]>([]);
  const [defaults, setDefaults] = useState<PVTemplateSection[]>([]);
  const [isCustom, setIsCustom] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/pv/template");
        const data = await res.json();
        if (cancelled) return;
        if (data.success) {
          setSections(data.sections || []);
          setDefaults(data.default_sections || []);
          setIsCustom(!!data.is_custom);
          setCanEdit(!!data.can_edit);
        } else {
          setError(data.error || t("template_load_error"));
        }
      } catch {
        if (!cancelled) setError(t("template_load_error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Renumbers `ordre` so it always matches the visible order. */
  const reindex = (list: PVTemplateSection[]) =>
    list.map((s, i) => ({ ...s, ordre: i + 1 }));

  const update = (index: number, patch: Partial<PVTemplateSection>) => {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s))
    );
    setSaved(false);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    setSections(reindex(next));
    setSaved(false);
  };

  const remove = (index: number) => {
    setSections((prev) => reindex(prev.filter((_, i) => i !== index)));
    setSaved(false);
  };

  const add = () => {
    setSections((prev) =>
      reindex([...prev, { titre: "", ordre: prev.length + 1, obligatoire: false }])
    );
    setSaved(false);
  };

  const persist = async (payload: { sections: PVTemplateSection[] | null; reset?: boolean }) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/pv/template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error || `${t("template_save_error")} (${res.status})`);
        return;
      }
      setSections(data.sections || []);
      setIsCustom(!!data.is_custom);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError(t("template_save_error"));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    const cleaned = reindex(
      sections.filter((s) => s.titre.trim()).map((s) => ({ ...s, titre: s.titre.trim() }))
    );
    if (cleaned.length === 0) {
      setError(t("template_title_required"));
      return;
    }
    persist({ sections: cleaned });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-lg border border-[#27272A] bg-[#18181B] shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#27272A] px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#F97316]/10">
              <LayoutTemplate className="h-4 w-4 text-[#F97316]" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#FAFAFA]">
                {t("template_title")}
              </h3>
              <p className="mt-0.5 text-xs text-[#A1A1AA]">
                {isCustom ? t("template_custom_in_use") : t("template_default_in_use")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-xs leading-relaxed text-[#A1A1AA]">
            {t("template_intro")}
          </p>

          {!canEdit && !loading && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t("template_readonly")}</span>
            </div>
          )}

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[#A1A1AA]" />
            </div>
          ) : (
            <div className="space-y-2">
              {sections.map((section, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md border border-[#27272A] bg-[#0F0F11] px-2.5 py-2"
                >
                  <span className="w-5 shrink-0 text-center text-xs font-medium text-[#A1A1AA]">
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    value={section.titre}
                    onChange={(e) => update(i, { titre: e.target.value })}
                    disabled={!canEdit || saving}
                    placeholder={t("template_section_title")}
                    className="min-w-0 flex-1 rounded border border-[#27272A] bg-[#18181B] px-2 py-1.5 text-sm text-[#FAFAFA] placeholder:text-[#52525B] focus:border-[#F97316] focus:outline-none disabled:opacity-60"
                  />
                  <label
                    className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-[#A1A1AA]"
                    title={t("template_required")}
                  >
                    <input
                      type="checkbox"
                      checked={section.obligatoire}
                      onChange={(e) => update(i, { obligatoire: e.target.checked })}
                      disabled={!canEdit || saving}
                      className="h-3.5 w-3.5 accent-[#F97316]"
                    />
                    <span className="hidden sm:inline">{t("template_required")}</span>
                  </label>
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={!canEdit || saving || i === 0}
                      className="rounded p-1 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA] disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={!canEdit || saving || i === sections.length - 1}
                      className="rounded p-1 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA] disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      disabled={!canEdit || saving}
                      className="rounded p-1 text-[#A1A1AA] hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {canEdit && (
                <button
                  type="button"
                  onClick={add}
                  disabled={saving}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[#27272A] py-2 text-xs text-[#A1A1AA] hover:border-[#3F3F46] hover:text-[#FAFAFA] disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("template_add")}
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        {canEdit && (
          <div className="flex items-center justify-between gap-3 border-t border-[#27272A] px-5 py-4">
            <button
              type="button"
              onClick={() => {
                setSections(defaults);
                persist({ sections: null, reset: true });
              }}
              disabled={saving || !isCustom}
              className="inline-flex items-center gap-1.5 text-xs text-[#A1A1AA] hover:text-[#FAFAFA] disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("template_reset")}
            </button>
            <div className="flex items-center gap-2">
              {saved && (
                <span className="text-xs text-green-400">{t("template_saved")}</span>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-[#0F0F11] hover:bg-[#EA580C] disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t("template_save")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
