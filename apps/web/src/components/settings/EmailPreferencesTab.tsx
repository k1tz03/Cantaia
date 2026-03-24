"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Mail,
  FolderOpen,
  Clock,
  Archive,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useFormSection } from "@/lib/hooks/use-form-section";
import { SaveButton } from "@/components/settings/SaveButton";

interface EmailPrefsData {
  auto_move_outlook: boolean;
  auto_dismiss_spam: boolean;
  auto_dismiss_newsletters: boolean;
  show_dismissed: boolean;
  outlook_root_folder_name: string;
  default_snooze_hours: number;
  archive_enabled: boolean;
  archive_path: string;
}

const DEFAULTS: EmailPrefsData = {
  auto_move_outlook: false,
  auto_dismiss_spam: true,
  auto_dismiss_newsletters: false,
  show_dismissed: false,
  outlook_root_folder_name: "Cantaia",
  default_snooze_hours: 4,
  archive_enabled: false,
  archive_path: "",
};

export function EmailPreferencesTab() {
  const t = useTranslations("settings");
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const savePrefs = useCallback(async (data: Record<string, unknown>) => {
    const res = await fetch("/api/emails/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to save");
    }
  }, []);

  const form = useFormSection(DEFAULTS as unknown as Record<string, unknown>, savePrefs);

  // Load existing preferences
  useEffect(() => {
    async function loadPrefs() {
      try {
        const res = await fetch("/api/emails/preferences");
        if (!res.ok) throw new Error("Failed to load");
        const { preferences } = await res.json();
        form.setInitial({
          auto_move_outlook: preferences.auto_move_outlook ?? false,
          auto_dismiss_spam: preferences.auto_dismiss_spam ?? true,
          auto_dismiss_newsletters: preferences.auto_dismiss_newsletters ?? false,
          show_dismissed: preferences.show_dismissed ?? false,
          outlook_root_folder_name: preferences.outlook_root_folder_name || "Cantaia",
          default_snooze_hours: preferences.default_snooze_hours ?? 4,
          archive_enabled: preferences.archive_enabled ?? false,
          archive_path: preferences.archive_path || "",
        });
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : "Error");
      } finally {
        setLoading(false);
      }
    }
    loadPrefs();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-[#71717A]" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
        <AlertCircle className="h-4 w-4" />
        {fetchError}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Outlook Integration */}
      <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-6">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[#FAFAFA]">
          <Mail className="h-4 w-4 text-blue-500" />
          {t("emailPrefs_outlookTitle")}
        </h3>
        <p className="mb-4 text-sm text-[#71717A]">{t("emailPrefs_outlookDesc")}</p>

        <div className="space-y-4">
          <ToggleRow
            label={t("emailPrefs_autoMoveOutlook")}
            description={t("emailPrefs_autoMoveOutlookDesc")}
            checked={form.data.auto_move_outlook as boolean}
            onChange={(v) => form.update({ auto_move_outlook: v })}
          />

          <div>
            <label className="block text-sm font-medium text-[#FAFAFA]">
              {t("emailPrefs_rootFolderName")}
            </label>
            <p className="mb-1 text-xs text-[#71717A]">{t("emailPrefs_rootFolderNameDesc")}</p>
            <input
              type="text"
              value={form.data.outlook_root_folder_name as string}
              onChange={(e) => form.update({ outlook_root_folder_name: e.target.value })}
              placeholder="Cantaia"
              className="mt-1 block w-64 rounded-lg border border-[#3F3F46] bg-[#18181B] px-3 py-2 text-sm text-[#D4D4D8] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
            />
          </div>
        </div>
      </div>

      {/* Auto-dismiss */}
      <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-6">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[#FAFAFA]">
          <FolderOpen className="h-4 w-4 text-amber-500" />
          {t("emailPrefs_filteringTitle")}
        </h3>
        <p className="mb-4 text-sm text-[#71717A]">{t("emailPrefs_filteringDesc")}</p>

        <div className="space-y-4">
          <ToggleRow
            label={t("emailPrefs_autoDismissSpam")}
            description={t("emailPrefs_autoDismissSpamDesc")}
            checked={form.data.auto_dismiss_spam as boolean}
            onChange={(v) => form.update({ auto_dismiss_spam: v })}
          />

          <ToggleRow
            label={t("emailPrefs_autoDismissNewsletters")}
            description={t("emailPrefs_autoDismissNewslettersDesc")}
            checked={form.data.auto_dismiss_newsletters as boolean}
            onChange={(v) => form.update({ auto_dismiss_newsletters: v })}
          />

          <ToggleRow
            label={t("emailPrefs_showDismissed")}
            description={t("emailPrefs_showDismissedDesc")}
            checked={form.data.show_dismissed as boolean}
            onChange={(v) => form.update({ show_dismissed: v })}
          />
        </div>
      </div>

      {/* Snooze defaults */}
      <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-6">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[#FAFAFA]">
          <Clock className="h-4 w-4 text-purple-500" />
          {t("emailPrefs_snoozeTitle")}
        </h3>
        <p className="mb-4 text-sm text-[#71717A]">{t("emailPrefs_snoozeDesc")}</p>

        <div>
          <label className="block text-sm font-medium text-[#FAFAFA]">
            {t("emailPrefs_defaultSnooze")}
          </label>
          <select
            value={form.data.default_snooze_hours as number}
            onChange={(e) => form.update({ default_snooze_hours: Number(e.target.value) })}
            className="mt-1 block w-48 rounded-lg border border-[#3F3F46] bg-[#18181B] px-3 py-2 text-sm text-[#D4D4D8] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
          >
            <option value={1}>1 {t("emailPrefs_hour")}</option>
            <option value={2}>2 {t("emailPrefs_hours")}</option>
            <option value={4}>4 {t("emailPrefs_hours")}</option>
            <option value={8}>8 {t("emailPrefs_hours")}</option>
            <option value={24}>24 {t("emailPrefs_hours")}</option>
          </select>
        </div>
      </div>

      {/* Archive settings */}
      <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-6">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[#FAFAFA]">
          <Archive className="h-4 w-4 text-green-500" />
          {t("emailPrefs_archiveTitle")}
        </h3>
        <p className="mb-4 text-sm text-[#71717A]">{t("emailPrefs_archiveDesc")}</p>

        <div className="space-y-4">
          <ToggleRow
            label={t("emailPrefs_archiveEnabled")}
            description={t("emailPrefs_archiveEnabledDesc")}
            checked={form.data.archive_enabled as boolean}
            onChange={(v) => form.update({ archive_enabled: v })}
          />

          {(form.data.archive_enabled as boolean) && (
            <div>
              <label className="block text-sm font-medium text-[#FAFAFA]">
                {t("emailPrefs_archivePath")}
              </label>
              <p className="mb-1 text-xs text-[#71717A]">{t("emailPrefs_archivePathDesc")}</p>
              <input
                type="text"
                value={form.data.archive_path as string}
                onChange={(e) => form.update({ archive_path: e.target.value })}
                placeholder="C:\Chantiers"
                className="mt-1 block w-full rounded-lg border border-[#3F3F46] bg-[#18181B] px-3 py-2 text-sm text-[#D4D4D8] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
              />
            </div>
          )}
        </div>
      </div>

      {/* Save button */}
      <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
        <SaveButton
          isDirty={form.isDirty}
          saving={form.saving}
          showSaved={form.showSaved}
          error={form.error}
          onClick={form.save}
          label={t("saveChanges")}
          savedLabel={t("savedSuccessfully")}
        />
      </div>
    </div>
  );
}

/* ToggleRow — local copy to avoid circular import */
function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-[#FAFAFA]">{label}</p>
        {description && <p className="text-xs text-[#71717A]">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? "bg-[#F97316]" : "bg-[#27272A]"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-[#18181B] shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
