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
      <div className="flex items-center gap-2 rounded-[10px] border border-[#EF444430] bg-[#EF444410] p-4 text-[11px] text-[#F87171]">
        <AlertCircle className="h-4 w-4" />
        {fetchError}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Outlook Integration */}
      <div>
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] mb-3 pb-2 border-b border-[#27272A] flex items-center gap-2">
          <Mail className="h-4 w-4 text-[#3B82F6]" />
          {t("emailPrefs_outlookTitle")}
        </div>
        <p className="text-[12px] text-[#71717A] mb-4">{t("emailPrefs_outlookDesc")}</p>

        <ToggleRow
          label={t("emailPrefs_autoMoveOutlook")}
          description={t("emailPrefs_autoMoveOutlookDesc")}
          checked={form.data.auto_move_outlook as boolean}
          onChange={(v) => form.update({ auto_move_outlook: v })}
        />

        <div className="mt-[14px]">
          <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-1">
            {t("emailPrefs_rootFolderName")}
          </label>
          <p className="text-[10px] text-[#52525B] mb-1">{t("emailPrefs_rootFolderNameDesc")}</p>
          <input
            type="text"
            value={form.data.outlook_root_folder_name as string}
            onChange={(e) => form.update({ outlook_root_folder_name: e.target.value })}
            placeholder="Cantaia"
            className="w-64 bg-[#18181B] border border-[#3F3F46] rounded-lg px-[14px] py-[9px] text-[13px] text-[#D4D4D8] placeholder-[#52525B] outline-none focus:border-[#F97316]"
          />
        </div>
      </div>

      {/* Auto-dismiss */}
      <div>
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] mb-3 pb-2 border-b border-[#27272A] flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-[#F59E0B]" />
          {t("emailPrefs_filteringTitle")}
        </div>
        <p className="text-[12px] text-[#71717A] mb-4">{t("emailPrefs_filteringDesc")}</p>

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

      {/* Snooze defaults */}
      <div>
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] mb-3 pb-2 border-b border-[#27272A] flex items-center gap-2">
          <Clock className="h-4 w-4 text-[#A855F7]" />
          {t("emailPrefs_snoozeTitle")}
        </div>
        <p className="text-[12px] text-[#71717A] mb-4">{t("emailPrefs_snoozeDesc")}</p>

        <div>
          <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-1">
            {t("emailPrefs_defaultSnooze")}
          </label>
          <select
            value={form.data.default_snooze_hours as number}
            onChange={(e) => form.update({ default_snooze_hours: Number(e.target.value) })}
            className="w-48 bg-[#18181B] border border-[#3F3F46] rounded-lg px-[14px] py-[9px] text-[13px] text-[#D4D4D8] outline-none focus:border-[#F97316] appearance-none"
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
      <div>
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] mb-3 pb-2 border-b border-[#27272A] flex items-center gap-2">
          <Archive className="h-4 w-4 text-[#34D399]" />
          {t("emailPrefs_archiveTitle")}
        </div>
        <p className="text-[12px] text-[#71717A] mb-4">{t("emailPrefs_archiveDesc")}</p>

        <ToggleRow
          label={t("emailPrefs_archiveEnabled")}
          description={t("emailPrefs_archiveEnabledDesc")}
          checked={form.data.archive_enabled as boolean}
          onChange={(v) => form.update({ archive_enabled: v })}
        />

        {(form.data.archive_enabled as boolean) && (
          <div className="mt-[14px]">
            <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-1">
              {t("emailPrefs_archivePath")}
            </label>
            <p className="text-[10px] text-[#52525B] mb-1">{t("emailPrefs_archivePathDesc")}</p>
            <input
              type="text"
              value={form.data.archive_path as string}
              onChange={(e) => form.update({ archive_path: e.target.value })}
              placeholder="C:\Chantiers"
              className="w-full bg-[#18181B] border border-[#3F3F46] rounded-lg px-[14px] py-[9px] text-[13px] text-[#D4D4D8] placeholder-[#52525B] outline-none focus:border-[#F97316]"
            />
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="pt-2">
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
    <div className="flex items-center justify-between py-[10px] border-b border-[#1C1C1F] last:border-b-0">
      <div className="flex-1">
        <p className="text-[13px] font-medium text-[#D4D4D8]">{label}</p>
        {description && <p className="text-[11px] text-[#71717A] mt-[1px]">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full transition-colors ${
          checked ? "bg-[#F97316]" : "bg-[#3F3F46]"
        }`}
      >
        <span
          className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-[20px] mt-[2px]" : "translate-x-[2px] mt-[2px]"
          }`}
        />
      </button>
    </div>
  );
}
