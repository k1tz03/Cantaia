"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  User,
  Globe,
  Bell,
  Mail,
  Shield,
  Loader2,
  Camera,
  Sparkles,
  Bug,
  AlertCircle,
  CheckCircle,
  Layers,
  Lock,
  Key,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useFormSection } from "@/lib/hooks/use-form-section";
import { SaveButton } from "@/components/settings/SaveButton";
import { updateProfileAction } from "@/app/[locale]/(app)/settings/actions";
import { IntegrationsTab } from "@/components/settings/IntegrationsTab";
import { OrganisationTab } from "@/components/settings/OrganisationTab";
import { SubscriptionTab } from "@/components/settings/SubscriptionTab";
import { ClassificationSettingsTab } from "@/components/settings/ClassificationSettingsTab";
import { EmailPreferencesTab } from "@/components/settings/EmailPreferencesTab";

type SettingsTab =
  | "profile"
  | "language"
  | "notifications"
  | "outlook"
  | "email_prefs"
  | "security"
  | "classification"
  | "organisation"
  | "subscription";

const TABS: { id: SettingsTab; icon: React.ElementType }[] = [
  { id: "profile", icon: User },
  { id: "language", icon: Globe },
  { id: "notifications", icon: Bell },
  { id: "outlook", icon: Mail },
  { id: "email_prefs", icon: SlidersHorizontal },
  { id: "classification", icon: Settings },
  { id: "security", icon: Shield },
  { id: "organisation", icon: Layers },
  { id: "subscription", icon: Key },
];

export default function SettingsPage() {
  const t = useTranslations("settings");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = (searchParams.get("tab") as SettingsTab) || "profile";

  function setTab(tab: SettingsTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-64px)]">
      {/* Left navigation */}
      <nav className="w-[200px] shrink-0 border-r border-gray-200 bg-gray-50 p-4">
        <h1 className="mb-4 px-2 text-sm font-semibold text-gray-900">
          {t("title")}
        </h1>
        <ul className="space-y-0.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => setTab(tab.id)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors ${
                    isActive
                      ? "border-l-2 border-blue-600 bg-white font-medium text-blue-600 shadow-sm"
                      : "text-gray-600 hover:bg-white hover:text-gray-900"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-blue-600" : "text-gray-400"}`} />
                  {t(`tab_${tab.id}`)}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-lg font-semibold text-gray-900">
            {t(`tab_${activeTab}`)}
          </h2>

          {activeTab === "profile" && <ProfileSection />}
          {activeTab === "language" && <LanguageSection />}
          {activeTab === "notifications" && <NotificationsSection />}
          {activeTab === "outlook" && <IntegrationsTab />}
          {activeTab === "email_prefs" && <EmailPreferencesTab />}
          {activeTab === "classification" && <ClassificationSettingsTab />}
          {activeTab === "security" && <SecuritySection />}
          {activeTab === "organisation" && <OrganisationTab />}
          {activeTab === "subscription" && <SubscriptionTab />}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Profile Section — with [Save] button
   ═══════════════════════════════════════════════ */
function ProfileSection() {
  const t = useTranslations("settings");
  const tAuth = useTranslations("auth");
  const { user } = useAuth();

  const saveProfile = useCallback(async (data: Record<string, unknown>) => {
    const result = await updateProfileAction({
      first_name: data.first_name as string,
      last_name: data.last_name as string,
      phone: data.phone as string,
      preferred_language: data.preferred_language as "fr" | "en" | "de",
    });
    if (result.error) throw new Error(result.error);
  }, []);

  const form = useFormSection(
    {
      first_name: "",
      last_name: "",
      phone: "",
      preferred_language: "fr",
    },
    saveProfile
  );

  // Load user data
  useEffect(() => {
    if (user) {
      form.setInitial({
        first_name: user.user_metadata?.first_name || "",
        last_name: user.user_metadata?.last_name || "",
        phone: user.user_metadata?.phone || "",
        preferred_language: user.user_metadata?.preferred_language || "fr",
      });
    }
  }, [user]);

  const userEmail = user?.email || "";
  const initials = `${(form.data.first_name as string).charAt(0)}${(form.data.last_name as string).charAt(0)}`.toUpperCase() || "?";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-xl font-bold text-white">
            {initials}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{t("profilePhoto")}</p>
            <button
              type="button"
              className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <Camera className="h-3.5 w-3.5" />
              {t("changePhoto")}
            </button>
          </div>
        </div>

        {/* First name / Last name */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">{tAuth("firstName")}</label>
            <input
              type="text"
              value={form.data.first_name as string}
              onChange={(e) => form.update({ first_name: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">{tAuth("lastName")}</label>
            <input
              type="text"
              value={form.data.last_name as string}
              onChange={(e) => form.update({ last_name: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Phone / Email */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">{t("phone")}</label>
            <input
              type="tel"
              value={form.data.phone as string}
              onChange={(e) => form.update({ phone: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">{tAuth("email")}</label>
            <input
              type="email"
              value={userEmail}
              readOnly
              className="mt-1 block w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500"
            />
            <p className="mt-1 text-xs text-gray-400">{t("emailReadOnly")}</p>
          </div>
        </div>

        {/* Save */}
        <div className="border-t border-gray-100 pt-4">
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
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Language & Region Section — with [Save] button
   ═══════════════════════════════════════════════ */
function LanguageSection() {
  const t = useTranslations("settings");
  const { user } = useAuth();

  const saveLanguage = useCallback(async (data: Record<string, unknown>) => {
    const result = await updateProfileAction({
      first_name: user?.user_metadata?.first_name || "",
      last_name: user?.user_metadata?.last_name || "",
      phone: user?.user_metadata?.phone || "",
      preferred_language: data.preferred_language as "fr" | "en" | "de",
    });
    if (result.error) throw new Error(result.error);
  }, [user]);

  const form = useFormSection(
    {
      preferred_language: "fr",
      date_format: "dd.MM.yyyy",
      timezone: "Europe/Zurich",
    },
    saveLanguage
  );

  useEffect(() => {
    if (user) {
      form.setInitial({
        preferred_language: user.user_metadata?.preferred_language || "fr",
        date_format: "dd.MM.yyyy",
        timezone: "Europe/Zurich",
      });
    }
  }, [user]);

  return (
    <div className="space-y-6">
      {/* Language */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Globe className="h-4 w-4 text-gray-400" />
          {t("languageTitle")}
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">{t("language")}</label>
            <select
              value={form.data.preferred_language as string}
              onChange={(e) => form.update({ preferred_language: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="fr">Fran&ccedil;ais</option>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">{t("dateFormat")}</label>
            <select
              value={form.data.date_format as string}
              onChange={(e) => form.update({ date_format: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="dd.MM.yyyy">22.02.2026 (Suisse)</option>
              <option value="dd/MM/yyyy">22/02/2026 (France)</option>
              <option value="yyyy-MM-dd">2026-02-22 (ISO)</option>
              <option value="MM/dd/yyyy">02/22/2026 (US)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">{t("timezone")}</label>
            <select
              value={form.data.timezone as string}
              onChange={(e) => form.update({ timezone: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="Europe/Zurich">Europe/Zurich (CET)</option>
              <option value="Europe/Paris">Europe/Paris (CET)</option>
              <option value="Europe/London">Europe/London (GMT)</option>
              <option value="America/New_York">America/New_York (EST)</option>
            </select>
          </div>
        </div>

        <div className="mt-5 border-t border-gray-100 pt-4">
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
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Notifications Section — with [Save] button
   ═══════════════════════════════════════════════ */
function NotificationsSection() {
  const t = useTranslations("settings");

  const saveBriefing = useCallback(async (_data: Record<string, unknown>) => {
    // TODO: POST /api/user/preferences when connected to Supabase
    await new Promise((r) => setTimeout(r, 500));
  }, []);

  const briefingForm = useFormSection(
    {
      briefingEnabled: true,
      briefingTime: "07:00",
      briefingEmail: false,
    },
    saveBriefing
  );

  const saveNotifs = useCallback(async (_data: Record<string, unknown>) => {
    await new Promise((r) => setTimeout(r, 500));
  }, []);

  const notifsForm = useFormSection(
    {
      emailNotif: true,
      pushNotif: false,
      desktopNotif: false,
      weeklyReport: true,
    },
    saveNotifs
  );

  return (
    <div className="space-y-6">
      {/* Briefing preferences */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-900">{t("briefingPrefsTitle")}</h3>
        </div>
        <p className="mt-1 text-sm text-gray-500">{t("briefingPrefsDesc")}</p>

        <div className="mt-4 space-y-4">
          <ToggleRow
            label={t("briefingEnable")}
            description={t("briefingEnableDesc")}
            checked={briefingForm.data.briefingEnabled as boolean}
            onChange={(v) => briefingForm.update({ briefingEnabled: v })}
          />

          {briefingForm.data.briefingEnabled && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">{t("briefingTime")}</p>
                  <p className="text-xs text-gray-500">{t("briefingTimeDesc")}</p>
                </div>
                <input
                  type="time"
                  value={briefingForm.data.briefingTime as string}
                  onChange={(e) => briefingForm.update({ briefingTime: e.target.value })}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
                />
              </div>

              <ToggleRow
                label={t("briefingEmailToggle")}
                description={t("briefingEmailDesc")}
                checked={briefingForm.data.briefingEmail as boolean}
                onChange={(v) => briefingForm.update({ briefingEmail: v })}
              />
            </>
          )}
        </div>

        <div className="mt-5 border-t border-gray-100 pt-4">
          <SaveButton
            isDirty={briefingForm.isDirty}
            saving={briefingForm.saving}
            showSaved={briefingForm.showSaved}
            error={briefingForm.error}
            onClick={briefingForm.save}
            label={t("saveChanges")}
            savedLabel={t("savedSuccessfully")}
          />
        </div>
      </div>

      {/* General notifications */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-1 text-sm font-semibold text-gray-900">{t("notifications")}</h3>
        <p className="mb-4 text-sm text-gray-500">{t("notificationsDesc")}</p>

        <div className="space-y-4">
          <ToggleRow
            label={t("emailNotifications")}
            description={t("emailNotifDesc")}
            checked={notifsForm.data.emailNotif as boolean}
            onChange={(v) => notifsForm.update({ emailNotif: v })}
          />
          <ToggleRow
            label={t("pushNotifications")}
            description={t("pushNotifDesc")}
            checked={notifsForm.data.pushNotif as boolean}
            onChange={(v) => notifsForm.update({ pushNotif: v })}
          />
          <ToggleRow
            label={t("desktopNotifications")}
            description={t("desktopNotifDesc")}
            checked={notifsForm.data.desktopNotif as boolean}
            onChange={(v) => notifsForm.update({ desktopNotif: v })}
          />
          <ToggleRow
            label={t("weeklyReport")}
            description={t("weeklyReportDesc")}
            checked={notifsForm.data.weeklyReport as boolean}
            onChange={(v) => notifsForm.update({ weeklyReport: v })}
          />
        </div>

        <div className="mt-5 border-t border-gray-100 pt-4">
          <SaveButton
            isDirty={notifsForm.isDirty}
            saving={notifsForm.saving}
            showSaved={notifsForm.showSaved}
            error={notifsForm.error}
            onClick={notifsForm.save}
            label={t("saveChanges")}
            savedLabel={t("savedSuccessfully")}
          />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Security Section — with [Save] button
   ═══════════════════════════════════════════════ */
function SecuritySection() {
  const t = useTranslations("settings");
  const { user } = useAuth();

  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handlePasswordReset() {
    if (!user?.email) return;
    setChangingPassword(true);
    setPasswordMessage(null);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(user.email);
      if (error) throw error;
      setPasswordMessage({ type: "success", text: t("passwordResetSent") });
    } catch {
      setPasswordMessage({ type: "error", text: t("passwordResetError") });
    } finally {
      setChangingPassword(false);
      setTimeout(() => setPasswordMessage(null), 5000);
    }
  }

  return (
    <div className="space-y-6">
      {/* Password */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Lock className="h-4 w-4 text-gray-400" />
          {t("securityPassword")}
        </h3>
        <p className="mb-4 text-sm text-gray-500">{t("securityPasswordDesc")}</p>

        <button
          type="button"
          onClick={handlePasswordReset}
          disabled={changingPassword}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {changingPassword ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Key className="h-4 w-4" />
          )}
          {t("securityChangePassword")}
        </button>

        {passwordMessage && (
          <p className={`mt-3 text-sm ${passwordMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
            {passwordMessage.text}
          </p>
        )}
      </div>

      {/* Active sessions */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Shield className="h-4 w-4 text-gray-400" />
          {t("securitySessions")}
        </h3>
        <p className="mb-4 text-sm text-gray-500">{t("securitySessionsDesc")}</p>

        <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <div>
              <p className="text-sm font-medium text-gray-700">{t("securityCurrentSession")}</p>
              <p className="text-xs text-gray-500">{t("securityBrowserSession")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-lg border border-red-200 bg-red-50/50 p-6">
        <h3 className="mb-1 text-sm font-semibold text-red-800">{t("dangerZone")}</h3>
        <p className="mb-4 text-sm text-red-600">{t("dangerZoneDesc")}</p>
        <button
          type="button"
          disabled
          className="rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-600 opacity-50"
        >
          {t("deleteAccount")}
        </button>
      </div>

      {/* Diagnostics */}
      <DiagnosticsSection />
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Toggle Row (reusable)
   ═══════════════════════════════════════════════ */
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
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? "bg-brand" : "bg-gray-200"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Diagnostics (kept from previous)
   ═══════════════════════════════════════════════ */
function DiagnosticsSection() {
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugResult, setDebugResult] = useState<Record<string, unknown> | null>(null);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Bug className="h-4 w-4 text-gray-400" />
        Diagnostics
      </h3>
      <p className="mb-3 text-sm text-gray-500">
        V&eacute;rifier la connexion Supabase, les projets, les emails et les tokens.
      </p>
      <button
        type="button"
        onClick={async () => {
          setDebugLoading(true);
          setDebugResult(null);
          try {
            const res = await fetch("/api/debug/supabase-test");
            const data = await res.json();
            setDebugResult(data);
          } catch (err) {
            setDebugResult({ error: err instanceof Error ? err.message : "Erreur" });
          } finally {
            setDebugLoading(false);
          }
        }}
        disabled={debugLoading}
        className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        {debugLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bug className="h-3.5 w-3.5" />}
        Lancer le diagnostic
      </button>
      {debugResult && (
        <div className="mt-4 space-y-2">
          {Object.entries(debugResult).map(([key, value]) => {
            if (key === "error") {
              return (
                <div key={key} className="flex items-center gap-2 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {String(value)}
                </div>
              );
            }
            const val = value as Record<string, unknown> | null;
            const isOk = val?.ok === true;
            const errMsg = val?.error ? String(val.error) : null;
            const dataVal = val?.data;
            return (
              <div
                key={key}
                className={`rounded-md border p-3 text-xs ${
                  isOk ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  {isOk ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                  )}
                  <span className="font-medium">{key}</span>
                </div>
                {errMsg && <p className="mt-1 text-red-600">{errMsg}</p>}
                {dataVal !== undefined && (
                  <pre className="mt-1 max-h-32 overflow-auto text-[10px] text-gray-500">
                    {typeof dataVal === "object" ? JSON.stringify(dataVal, null, 2) : String(dataVal)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
