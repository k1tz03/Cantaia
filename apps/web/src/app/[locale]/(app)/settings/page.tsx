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
  Layers,
  Lock,
  Key,
  Settings,
  SlidersHorizontal,
  Database,
  FileSignature,
  Eye,
  EyeOff,
  Check,
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
import { DataSharingTab } from "@/components/settings/DataSharingTab";
import RichSignatureEditor from "@/components/settings/RichSignatureEditor";

type SettingsTab =
  | "profile"
  | "language"
  | "notifications"
  | "outlook"
  | "email_prefs"
  | "security"
  | "classification"
  | "data_sharing"
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
  { id: "data_sharing", icon: Database },
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
      {/* Mobile: horizontal tab bar */}
      <nav className="fixed inset-x-0 top-[64px] z-30 md:hidden border-b border-[#27272A] bg-[#111113] px-4 pt-3 pb-0">
        <h1 className="mb-2 font-display text-sm font-extrabold text-[#FAFAFA]">
          {t("title")}
        </h1>
        <div className="flex gap-1 overflow-x-auto scrollbar-hide -mb-px pb-0">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? "border-[#F97316] text-[#F97316]"
                    : "border-transparent text-[#A1A1AA] hover:text-[#D4D4D8]"
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? "text-[#F97316]" : "text-[#A1A1AA]"}`} />
                {t(`tab_${tab.id}`)}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Desktop: settings nav panel (220px) */}
      <nav className="hidden md:flex md:w-[220px] shrink-0 flex-col border-r border-[#27272A] bg-[#111113] py-5 px-[10px]">
        <h1 className="font-display text-[18px] font-extrabold text-[#FAFAFA] px-2 pb-[14px]">
          {t("title")}
        </h1>
        <ul className="space-y-[1px]">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => setTab(tab.id)}
                  className={`flex w-full items-center gap-2 rounded-[7px] px-[10px] py-[7px] text-[13px] transition-colors ${
                    isActive
                      ? "bg-[#F9731612] text-[#F97316] font-medium"
                      : "text-[#A1A1AA] hover:bg-[#1C1C1F] hover:text-[#D4D4D8]"
                  }`}
                >
                  <Icon className={`h-[14px] w-[14px] ${isActive ? "text-[#F97316]" : "text-[#A1A1AA]"}`} />
                  {t(`tab_${tab.id}`)}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto bg-[#0F0F11] px-4 py-6 md:px-8 md:pt-6 mt-[72px] md:mt-0">
        <div className="max-w-[720px]">
          <h2 className="font-display text-[20px] font-bold text-[#FAFAFA] mb-1">
            {t(`tab_${activeTab}`)}
          </h2>
          <div className="mb-6" />

          {activeTab === "profile" && <ProfileSection />}
          {activeTab === "language" && <LanguageSection />}
          {activeTab === "notifications" && <NotificationsSection />}
          {activeTab === "outlook" && <IntegrationsTab />}
          {activeTab === "email_prefs" && <EmailPreferencesTab />}
          {activeTab === "classification" && <ClassificationSettingsTab />}
          {activeTab === "security" && <SecuritySection />}
          {activeTab === "data_sharing" && <DataSharingTab />}
          {activeTab === "organisation" && <OrganisationTab />}
          {activeTab === "subscription" && <SubscriptionTab />}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Profile Section
   ═══════════════════════════════════════════════ */
function ProfileSection() {
  const t = useTranslations("settings");
  const tAuth = useTranslations("auth");
  const { user } = useAuth();

  // ─── Email Signature state ───
  const [signature, setSignature] = useState("");
  const [initialSignature, setInitialSignature] = useState("");
  const [showSignaturePreview, setShowSignaturePreview] = useState(false);
  const [signatureSaving, setSignatureSaving] = useState(false);
  const [signatureSaved, setSignatureSaved] = useState(false);
  const signatureDirty = signature !== initialSignature;

  const saveProfile = useCallback(async (data: Record<string, unknown>) => {
    const result = await updateProfileAction({
      first_name: data.first_name as string,
      last_name: data.last_name as string,
      phone: data.phone as string,
      preferred_language: data.preferred_language as "fr" | "en" | "de",
      job_title: data.job_title as string,
      age_range: (data.age_range || undefined) as any,
      gender: (data.gender || undefined) as any,
    });
    if (result.error) throw new Error(result.error);
  }, []);

  const form = useFormSection(
    {
      first_name: "",
      last_name: "",
      phone: "",
      preferred_language: "fr",
      job_title: "",
      age_range: "",
      gender: "",
    },
    saveProfile
  );

  // Load user data
  useEffect(() => {
    if (!user) return;

    const metaValues = {
      first_name: user.user_metadata?.first_name || "",
      last_name: user.user_metadata?.last_name || "",
      phone: user.user_metadata?.phone || "",
      preferred_language: user.user_metadata?.preferred_language || "fr",
      job_title: user.user_metadata?.job_title || "",
      age_range: user.user_metadata?.age_range || "",
      gender: user.user_metadata?.gender || "",
    };
    form.setInitial(metaValues);

    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) {
          form.setInitial({
            first_name: data.profile.first_name || metaValues.first_name,
            last_name: data.profile.last_name || metaValues.last_name,
            phone: data.profile.phone || metaValues.phone,
            preferred_language: data.profile.preferred_language || metaValues.preferred_language,
            job_title: data.profile.job_title || metaValues.job_title,
            age_range: data.profile.age_range || metaValues.age_range,
            gender: data.profile.gender || metaValues.gender,
          });
          // Load email signature
          if (data.profile.email_signature !== undefined) {
            setSignature(data.profile.email_signature || "");
            setInitialSignature(data.profile.email_signature || "");
          }
        }
      })
      .catch(() => {});
  }, [user]);

  const userEmail = user?.email || "";
  const initials = `${(form.data.first_name as string).charAt(0)}${(form.data.last_name as string).charAt(0)}`.toUpperCase() || "?";

  return (
    <div className="space-y-6">
      {/* Photo de profil */}
      <div className="s-section">
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] mb-3 pb-2 border-b border-[#27272A]">
          {t("profilePhoto")}
        </div>
        <div className="flex items-center gap-[14px]">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#F97316] to-[#EF4444] text-[22px] font-bold text-white">
            {initials}
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-[#3F3F46] bg-[#18181B] px-3 py-[5px] text-[11px] font-medium text-[#D4D4D8] hover:bg-[#27272A]"
            >
              <Camera className="h-3 w-3" />
              {t("changePhoto")}
            </button>
            <span className="text-[10px] text-[#52525B]">JPG, PNG. Max 2 MB.</span>
          </div>
        </div>
      </div>

      {/* Informations personnelles */}
      <div className="s-section">
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] mb-3 pb-2 border-b border-[#27272A]">
          {t("personalInfo") || "Informations personnelles"}
        </div>

        {/* Prenom / Nom */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-[14px]">
          <div>
            <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-1">
              {tAuth("firstName")}
            </label>
            <input
              type="text"
              value={form.data.first_name as string}
              onChange={(e) => form.update({ first_name: e.target.value })}
              className="w-full bg-[#18181B] border border-[#3F3F46] rounded-lg px-[14px] py-[9px] text-[13px] text-[#D4D4D8] placeholder-[#52525B] outline-none focus:border-[#F97316]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-1">
              {tAuth("lastName")}
            </label>
            <input
              type="text"
              value={form.data.last_name as string}
              onChange={(e) => form.update({ last_name: e.target.value })}
              className="w-full bg-[#18181B] border border-[#3F3F46] rounded-lg px-[14px] py-[9px] text-[13px] text-[#D4D4D8] placeholder-[#52525B] outline-none focus:border-[#F97316]"
            />
          </div>
        </div>

        {/* Email / Telephone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-[14px]">
          <div>
            <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-1">
              {tAuth("email")}
            </label>
            <input
              type="email"
              value={userEmail}
              readOnly
              className="w-full bg-[#18181B] border border-[#27272A] rounded-lg px-[14px] py-[9px] text-[13px] text-[#71717A] cursor-not-allowed outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-1">
              {t("phone")}
            </label>
            <input
              type="tel"
              value={form.data.phone as string}
              onChange={(e) => form.update({ phone: e.target.value })}
              className="w-full bg-[#18181B] border border-[#3F3F46] rounded-lg px-[14px] py-[9px] text-[13px] text-[#D4D4D8] placeholder-[#52525B] outline-none focus:border-[#F97316]"
            />
          </div>
        </div>

        {/* Fonction / Langue */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-1">
              {t("jobTitle")}
            </label>
            <input
              type="text"
              value={form.data.job_title as string}
              onChange={(e) => form.update({ job_title: e.target.value })}
              placeholder={t("jobTitlePlaceholder")}
              className="w-full bg-[#18181B] border border-[#3F3F46] rounded-lg px-[14px] py-[9px] text-[13px] text-[#D4D4D8] placeholder-[#52525B] outline-none focus:border-[#F97316]"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-1">
              {t("language")}
            </label>
            <select
              value={form.data.preferred_language as string}
              onChange={(e) => form.update({ preferred_language: e.target.value })}
              className="w-full bg-[#18181B] border border-[#3F3F46] rounded-lg px-[14px] py-[9px] text-[13px] text-[#D4D4D8] outline-none focus:border-[#F97316] appearance-none"
            >
              <option value="fr">Fran&ccedil;ais</option>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-2 pt-2">
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

      {/* ─── Email Signature (Rich HTML) ─── */}
      <div className="s-section border-t border-[#27272A] pt-6 mt-2">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#27272A]">
          <div className="flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-[#F97316]" />
            <span className="font-display text-[14px] font-bold text-[#FAFAFA]">Signature email</span>
          </div>
          <button
            type="button"
            onClick={() => setShowSignaturePreview(!showSignaturePreview)}
            className="flex items-center gap-1.5 text-[11px] text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
          >
            {showSignaturePreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showSignaturePreview ? "Masquer aperçu" : "Voir aperçu"}
          </button>
        </div>
        <p className="text-[11px] text-[#71717A] mb-3">
          Copiez votre signature depuis Outlook et collez-la directement ci-dessous. Les images, logos et formatage seront conservés.
        </p>

        <RichSignatureEditor
          value={signature}
          onChange={(html) => setSignature(html)}
          placeholder="Collez votre signature Outlook ici (Ctrl+V), ou créez-en une avec la barre d'outils..."
        />

        {showSignaturePreview && signature && (
          <div className="mt-3 rounded-lg border border-[#27272A] bg-white p-4">
            <p className="text-[10px] uppercase tracking-wider text-[#A1A1AA] mb-2">Aperçu dans l&apos;email (fond blanc)</p>
            <div className="border-t border-gray-200 pt-3">
              {/* Render as real HTML — same as how recipients see it */}
              <div
                className="text-[13px] text-black [&_img]:max-w-full [&_img]:h-auto [&_a]:text-blue-600 [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: signature }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            onClick={async () => {
              setSignatureSaving(true);
              setSignatureSaved(false);
              try {
                const res = await fetch("/api/user/profile", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email_signature: signature }),
                });
                if (res.ok) {
                  setInitialSignature(signature);
                  setSignatureSaved(true);
                  setTimeout(() => setSignatureSaved(false), 3000);
                }
              } catch { /* ignore */ }
              setSignatureSaving(false);
            }}
            disabled={signatureSaving || !signatureDirty}
            className={`flex items-center gap-2 rounded-lg px-4 py-[7px] text-[12px] font-semibold text-white transition-colors disabled:opacity-50 ${
              signatureDirty
                ? "bg-[#F97316] hover:bg-[#EA580C]"
                : "bg-[#27272A] cursor-not-allowed"
            }`}
          >
            {signatureSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Enregistrer la signature
          </button>
          {signatureSaved && (
            <span className="flex items-center gap-1 text-[11px] text-green-400">
              <Check className="h-3.5 w-3.5" /> Signature enregistrée
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Language & Region Section
   ═══════════════════════════════════════════════ */
function LanguageSection() {
  const t = useTranslations("settings");
  const { user } = useAuth();

  const saveLanguage = useCallback(async (data: Record<string, unknown>) => {
    const result = await updateProfileAction({
      first_name: "",
      last_name: "",
      phone: "",
      preferred_language: data.preferred_language as "fr" | "en" | "de",
    });
    if (result.error) throw new Error(result.error);
    try {
      localStorage.setItem("cantaia_date_format", data.date_format as string);
      localStorage.setItem("cantaia_timezone", data.timezone as string);
    } catch { /* localStorage unavailable */ }
  }, []);

  const form = useFormSection(
    {
      preferred_language: "fr",
      date_format: "dd.MM.yyyy",
      timezone: "Europe/Zurich",
    },
    saveLanguage
  );

  useEffect(() => {
    if (!user) return;

    const metaLang = user.user_metadata?.preferred_language || "fr";
    const storedDateFormat = typeof window !== "undefined" ? localStorage.getItem("cantaia_date_format") : null;
    const storedTimezone = typeof window !== "undefined" ? localStorage.getItem("cantaia_timezone") : null;

    form.setInitial({
      preferred_language: metaLang,
      date_format: storedDateFormat || "dd.MM.yyyy",
      timezone: storedTimezone || "Europe/Zurich",
    });

    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile?.preferred_language) {
          form.setInitial({
            preferred_language: data.profile.preferred_language,
            date_format: storedDateFormat || "dd.MM.yyyy",
            timezone: storedTimezone || "Europe/Zurich",
          });
        }
      })
      .catch(() => {});
  }, [user]);

  return (
    <div className="space-y-6">
      <div className="s-section">
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] mb-3 pb-2 border-b border-[#27272A]">
          {t("languageTitle")}
        </div>

        <div className="space-y-[14px]">
          <div>
            <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-1">
              {t("language")}
            </label>
            <select
              value={form.data.preferred_language as string}
              onChange={(e) => form.update({ preferred_language: e.target.value })}
              className="w-full bg-[#18181B] border border-[#3F3F46] rounded-lg px-[14px] py-[9px] text-[13px] text-[#D4D4D8] outline-none focus:border-[#F97316] appearance-none"
            >
              <option value="fr">Fran&ccedil;ais</option>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-1">
              {t("dateFormat")}
            </label>
            <select
              value={form.data.date_format as string}
              onChange={(e) => form.update({ date_format: e.target.value })}
              className="w-full bg-[#18181B] border border-[#3F3F46] rounded-lg px-[14px] py-[9px] text-[13px] text-[#D4D4D8] outline-none focus:border-[#F97316] appearance-none"
            >
              <option value="dd.MM.yyyy">22.02.2026 (Suisse)</option>
              <option value="dd/MM/yyyy">22/02/2026 (France)</option>
              <option value="yyyy-MM-dd">2026-02-22 (ISO)</option>
              <option value="MM/dd/yyyy">02/22/2026 (US)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#A1A1AA] uppercase tracking-wider mb-1">
              {t("timezone")}
            </label>
            <select
              value={form.data.timezone as string}
              onChange={(e) => form.update({ timezone: e.target.value })}
              className="w-full bg-[#18181B] border border-[#3F3F46] rounded-lg px-[14px] py-[9px] text-[13px] text-[#D4D4D8] outline-none focus:border-[#F97316] appearance-none"
            >
              <option value="Europe/Zurich">Europe/Zurich (CET)</option>
              <option value="Europe/Paris">Europe/Paris (CET)</option>
              <option value="Europe/London">Europe/London (GMT)</option>
              <option value="America/New_York">America/New_York (EST)</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-2">
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

/* ═══════════════════════════════════════════════
   Notifications Section
   ═══════════════════════════════════════════════ */
function NotificationsSection() {
  const t = useTranslations("settings");
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const saveBriefing = useCallback(async (data: Record<string, unknown>) => {
    const res = await fetch("/api/user/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        briefing_enabled: data.briefingEnabled,
        briefing_time: data.briefingTime,
        briefing_email: data.briefingEmail,
        briefing_projects: selectedProjects,
      }),
    });
    if (!res.ok) throw new Error("Failed to save");
  }, [selectedProjects]);

  const briefingForm = useFormSection(
    {
      briefingEnabled: true,
      briefingTime: "07:00",
      briefingEmail: false,
    },
    saveBriefing
  );

  useEffect(() => {
    async function loadPrefs() {
      try {
        const res = await fetch("/api/user/profile");
        if (!res.ok) return;
        const { profile } = await res.json();
        if (!profile) return;

        briefingForm.setInitial({
          briefingEnabled: profile.briefing_enabled ?? true,
          briefingTime: profile.briefing_time ?? "07:00",
          briefingEmail: profile.briefing_email ?? false,
        });
        setSelectedProjects(profile.briefing_projects || []);

        if (profile.organization_id) {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          const { data } = await (supabase.from("projects") as any)
            .select("id, name")
            .eq("organization_id", profile.organization_id)
            .in("status", ["active", "planning"])
            .order("name");
          setProjects(data || []);
        }
      } catch {
        // use defaults
      } finally {
        setPrefsLoaded(true);
      }
    }
    loadPrefs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveNotifs = useCallback(async (data: Record<string, unknown>) => {
    try {
      localStorage.setItem("cantaia_notif_prefs", JSON.stringify(data));
    } catch { /* localStorage unavailable */ }
  }, []);

  const defaultNotifs = {
    emailNotif: true,
    pushNotif: false,
    desktopNotif: false,
    weeklyReport: true,
  };

  const notifsForm = useFormSection(defaultNotifs, saveNotifs);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("cantaia_notif_prefs");
      if (saved) {
        const parsed = JSON.parse(saved);
        notifsForm.setInitial({ ...defaultNotifs, ...parsed });
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      {/* Briefing preferences */}
      <div className="s-section">
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] mb-3 pb-2 border-b border-[#27272A] flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-500" />
          {t("briefingPrefsTitle")}
        </div>
        <p className="text-[12px] text-[#71717A] mb-4">{t("briefingPrefsDesc")}</p>

        <div className="space-y-4">
          <ToggleRow
            label={t("briefingEnable")}
            description={t("briefingEnableDesc")}
            checked={briefingForm.data.briefingEnabled as boolean}
            onChange={(v) => briefingForm.update({ briefingEnabled: v })}
          />

          {briefingForm.data.briefingEnabled && (
            <>
              <div className="flex items-center justify-between py-[10px] border-b border-[#1C1C1F]">
                <div>
                  <p className="text-[13px] font-medium text-[#D4D4D8]">{t("briefingTime")}</p>
                  <p className="text-[11px] text-[#71717A] mt-[1px]">{t("briefingTimeDesc")}</p>
                </div>
                <input
                  type="time"
                  value={briefingForm.data.briefingTime as string}
                  onChange={(e) => briefingForm.update({ briefingTime: e.target.value })}
                  className="bg-[#18181B] border border-[#3F3F46] rounded-lg px-3 py-[5px] text-[13px] text-[#D4D4D8] outline-none focus:border-[#F97316]"
                />
              </div>

              <ToggleRow
                label={t("briefingEmailToggle")}
                description={t("briefingEmailDesc")}
                checked={briefingForm.data.briefingEmail as boolean}
                onChange={(v) => briefingForm.update({ briefingEmail: v })}
              />

              {projects.length > 0 && (
                <div>
                  <p className="text-[13px] font-medium text-[#D4D4D8]">{t("briefingProjects")}</p>
                  <p className="text-[11px] text-[#71717A] mt-[1px]">{t("briefingProjectsDesc")}</p>
                  <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-[#27272A] bg-[#18181B] p-3">
                    {projects.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-[13px] text-[#D4D4D8] cursor-pointer hover:text-[#FAFAFA]">
                        <input
                          type="checkbox"
                          checked={selectedProjects.includes(p.id)}
                          onChange={(e) => {
                            setSelectedProjects((prev) =>
                              e.target.checked
                                ? [...prev, p.id]
                                : prev.filter((id) => id !== p.id)
                            );
                            briefingForm.update({});
                          }}
                          className="rounded border-[#3F3F46] accent-[#F97316]"
                        />
                        {p.name}
                      </label>
                    ))}
                  </div>
                  {selectedProjects.length === 0 && (
                    <p className="mt-1 text-[10px] text-[#52525B]">{t("briefingAllProjects")}</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-[#27272A]">
          <SaveButton
            isDirty={briefingForm.isDirty || !prefsLoaded}
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
      <div className="s-section">
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] mb-3 pb-2 border-b border-[#27272A]">
          {t("notifications")}
        </div>
        <p className="text-[12px] text-[#71717A] mb-4">{t("notificationsDesc")}</p>

        <div className="space-y-0">
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

        <div className="mt-4 pt-4 border-t border-[#27272A]">
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
   Security Section
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
      const locale = window.location.pathname.match(/^\/(fr|en|de)/)?.[1] || "fr";
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/${locale}/reset-password`,
      });
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
      <div className="s-section">
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] mb-3 pb-2 border-b border-[#27272A] flex items-center gap-2">
          <Lock className="h-4 w-4 text-[#71717A]" />
          {t("securityPassword")}
        </div>
        <p className="text-[12px] text-[#71717A] mb-4">{t("securityPasswordDesc")}</p>

        <button
          type="button"
          onClick={handlePasswordReset}
          disabled={changingPassword}
          className="flex items-center gap-2 rounded-[7px] border border-[#3F3F46] bg-[#27272A] px-[14px] py-[6px] text-[11px] font-medium text-[#D4D4D8] hover:bg-[#3F3F46] disabled:opacity-50"
        >
          {changingPassword ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Key className="h-3.5 w-3.5" />
          )}
          {t("securityChangePassword")}
        </button>

        {passwordMessage && (
          <p className={`mt-3 text-[11px] ${passwordMessage.type === "success" ? "text-[#34D399]" : "text-[#F87171]"}`}>
            {passwordMessage.text}
          </p>
        )}
      </div>

      {/* Active sessions */}
      <div className="s-section">
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] mb-3 pb-2 border-b border-[#27272A] flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#71717A]" />
          {t("securitySessions")}
        </div>
        <p className="text-[12px] text-[#71717A] mb-4">{t("securitySessionsDesc")}</p>

        <div className="rounded-[10px] border border-[#27272A] bg-[#18181B] p-[14px]">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-[#34D399]" />
            <div>
              <p className="text-[13px] font-medium text-[#FAFAFA]">{t("securityCurrentSession")}</p>
              <p className="text-[11px] text-[#71717A]">{t("securityBrowserSession")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-[10px] border border-[#EF444430] bg-[#EF444410] p-[14px]">
        <h3 className="text-[13px] font-semibold text-[#F87171] mb-1">{t("dangerZone")}</h3>
        <p className="text-[11px] text-[#F8717180] mb-3">{t("dangerZoneDesc")}</p>
        <button
          type="button"
          disabled
          className="rounded-[7px] border border-[#EF444430] bg-[#18181B] px-[14px] py-[6px] text-[11px] font-medium text-[#F87171] opacity-50"
        >
          {t("deleteAccount")}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Toggle Row (reusable, maquette-style)
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
            checked ? "translate-x-[20px] mt-[2px] ml-0" : "translate-x-[2px] mt-[2px]"
          }`}
        />
      </button>
    </div>
  );
}
