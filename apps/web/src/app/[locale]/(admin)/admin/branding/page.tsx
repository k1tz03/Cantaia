"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Palette,
  Upload,
  RotateCcw,
  Loader2,
  Check,
  AlertCircle,
  Eye,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface BrandingState {
  // Identity
  display_name: string;
  // Logos
  logo_url: string;
  favicon_url: string;
  // Colors
  color_primary: string;
  color_secondary: string;
  color_sidebar_bg: string;
  color_sidebar_text: string;
  theme: "light" | "dark" | "auto";
  // Login
  login_bg_url: string;
  login_message: string;
}

const DEFAULT_BRANDING: BrandingState = {
  display_name: "",
  logo_url: "",
  favicon_url: "",
  color_primary: "#1E40AF",
  color_secondary: "#3B82F6",
  color_sidebar_bg: "#0F172A",
  color_sidebar_text: "#F8FAFC",
  theme: "light",
  login_bg_url: "",
  login_message: "",
};

function useSectionForm<T extends Record<string, unknown>>(
  initial: T,
  saveFn: (data: T) => Promise<void>
) {
  const [data, setData] = useState<T>(initial);
  const [savedData, setSavedData] = useState<T>(initial);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const updateField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setData((prev) => {
      const next = { ...prev, [field]: value };
      setIsDirty(JSON.stringify(next) !== JSON.stringify(savedData));
      return next;
    });
  }, [savedData]);

  const save = useCallback(async () => {
    setIsSaving(true);
    try {
      await saveFn(data);
      setSavedData({ ...data });
      setIsDirty(false);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    } catch {
      // Error handled in parent
    } finally {
      setIsSaving(false);
    }
  }, [data, saveFn]);

  const reset = useCallback((newData: T) => {
    setData(newData);
    setSavedData(newData);
    setIsDirty(false);
  }, []);

  return { data, updateField, isDirty, isSaving, showSaved, save, reset };
}

export default function AdminBrandingPage() {
  const t = useTranslations("superAdmin");
  const [loading, setLoading] = useState(true);
  const [orgSubdomain, setOrgSubdomain] = useState("");

  // Identity section
  const identity = useSectionForm(
    { display_name: "" },
    async (data) => {
      await fetch("/api/super-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-organization", id: orgId, display_name: data.display_name }),
      });
    }
  );

  // Colors section
  const colors = useSectionForm(
    {
      color_primary: DEFAULT_BRANDING.color_primary,
      color_secondary: DEFAULT_BRANDING.color_secondary,
      color_sidebar_bg: DEFAULT_BRANDING.color_sidebar_bg,
      color_sidebar_text: DEFAULT_BRANDING.color_sidebar_text,
      theme: DEFAULT_BRANDING.theme as string,
    },
    async (data) => {
      await fetch("/api/organization/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primary_color: data.color_primary,
          secondary_color: data.color_secondary,
          sidebar_color: data.color_sidebar_bg,
          accent_color: data.color_sidebar_text,
          branding_enabled: true,
        }),
      });
    }
  );

  // Login section
  const login = useSectionForm(
    { login_message: "" },
    async (data) => {
      await fetch("/api/super-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-organization",
          id: orgId,
          branding: { login_message: data.login_message },
        }),
      });
    }
  );

  const [orgId, setOrgId] = useState("");

  useEffect(() => {
    async function loadBranding() {
      // Use API route to get org_id (bypasses RLS recursion on users table)
      const profileRes = await fetch("/api/user/profile");
      const profileData = await profileRes.json();
      const userOrgId = profileData?.profile?.organization_id;
      if (!userOrgId) { setLoading(false); return; }
      setOrgId(userOrgId);

      const supabase = createClient();
      const { data: org } = await (supabase.from("organizations") as any)
        .select("*")
        .eq("id", userOrgId)
        .maybeSingle();

      if (org) {
        setOrgSubdomain(org.subdomain || "");
        identity.reset({ display_name: org.display_name || org.name || "" });

        const b = (org.branding || {}) as Record<string, string>;
        colors.reset({
          color_primary: b.color_primary || org.primary_color || DEFAULT_BRANDING.color_primary,
          color_secondary: b.color_secondary || org.secondary_color || DEFAULT_BRANDING.color_secondary,
          color_sidebar_bg: b.color_sidebar_bg || org.sidebar_color || DEFAULT_BRANDING.color_sidebar_bg,
          color_sidebar_text: b.color_sidebar_text || DEFAULT_BRANDING.color_sidebar_text,
          theme: b.theme || "light",
        });
        login.reset({ login_message: b.login_message || "" });
      }
      setLoading(false);
    }
    loadBranding();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Palette className="h-6 w-6 text-blue-600" />
          {t("customization")}
        </h1>
        <p className="mt-1 text-sm text-gray-500">Personnalisez l&apos;apparence de votre espace Cantaia</p>
      </div>

      <div className="mx-auto max-w-2xl space-y-6">
        {/* Identity Section */}
        <Section
          title="Identité"
          isDirty={identity.isDirty}
          isSaving={identity.isSaving}
          showSaved={identity.showSaved}
          onSave={identity.save}
          saveLabel={t("saveChanges")}
          savingLabel={t("saving")}
          unsavedLabel={t("unsavedChanges")}
          savedLabel={t("changesSaved")}
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nom affiché</label>
            <input
              value={identity.data.display_name}
              onChange={(e) => identity.updateField("display_name", e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          {orgSubdomain && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t("subdomain")}</label>
              <p className="text-sm text-gray-500">{orgSubdomain}.cantaia.io <span className="text-xs text-gray-400">(non modifiable — contacter le support)</span></p>
            </div>
          )}
        </Section>

        {/* Logos Section */}
        <Section
          title="Logos"
          isDirty={false}
          isSaving={false}
          showSaved={false}
          onSave={async () => {}}
          saveLabel={t("saveChanges")}
          savingLabel={t("saving")}
          unsavedLabel={t("unsavedChanges")}
          savedLabel={t("changesSaved")}
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">{t("logoMain")}</label>
              <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50">
                <button className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
                  <Upload className="h-4 w-4" />
                  {t("upload")}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400">{t("logoMainHint")}</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">{t("favicon")}</label>
              <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50">
                <button className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
                  <Upload className="h-4 w-4" />
                  {t("upload")}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400">{t("faviconHint")}</p>
            </div>
          </div>
        </Section>

        {/* Colors Section */}
        <Section
          title="Couleurs"
          isDirty={colors.isDirty}
          isSaving={colors.isSaving}
          showSaved={colors.showSaved}
          onSave={colors.save}
          saveLabel={t("saveChanges")}
          savingLabel={t("saving")}
          unsavedLabel={t("unsavedChanges")}
          savedLabel={t("changesSaved")}
          extraActions={
            <button
              onClick={() => colors.reset({
                color_primary: DEFAULT_BRANDING.color_primary,
                color_secondary: DEFAULT_BRANDING.color_secondary,
                color_sidebar_bg: DEFAULT_BRANDING.color_sidebar_bg,
                color_sidebar_text: DEFAULT_BRANDING.color_sidebar_text,
                theme: "light",
              })}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("resetDefaults")}
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            {([
              { key: "color_primary" as const, label: t("colorPrimary") },
              { key: "color_secondary" as const, label: t("colorSecondary") },
              { key: "color_sidebar_bg" as const, label: t("colorSidebar") },
              { key: "color_sidebar_text" as const, label: t("colorSidebarText") },
            ]).map(({ key, label }) => (
              <div key={key}>
                <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colors.data[key]}
                    onChange={(e) => colors.updateField(key, e.target.value)}
                    className="h-9 w-9 cursor-pointer rounded border border-gray-300"
                  />
                  <input
                    value={colors.data[key]}
                    onChange={(e) => colors.updateField(key, e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:border-blue-400 focus:outline-none"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Theme */}
          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">{t("theme")}</label>
            <div className="flex gap-3">
              {(["light", "dark", "auto"] as const).map((th) => (
                <label
                  key={th}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm ${
                    colors.data.theme === th
                      ? "border-blue-300 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="theme"
                    checked={colors.data.theme === th}
                    onChange={() => colors.updateField("theme", th)}
                    className="accent-blue-500"
                  />
                  {t(`theme${th.charAt(0).toUpperCase() + th.slice(1)}`)}
                </label>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="mt-4">
            <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <Eye className="h-4 w-4" />
              {t("preview")}
            </label>
            <div className="flex overflow-hidden rounded-lg border border-gray-200">
              <div className="w-20 p-2" style={{ backgroundColor: colors.data.color_sidebar_bg }}>
                <div className="mb-3 h-2.5 w-12 rounded" style={{ backgroundColor: colors.data.color_sidebar_text, opacity: 0.8 }} />
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="mb-1.5 h-2 rounded" style={{
                    backgroundColor: colors.data.color_sidebar_text,
                    opacity: i === 1 ? 0.9 : 0.35,
                    width: `${55 + i * 8}%`,
                  }} />
                ))}
              </div>
              <div className="flex-1 bg-gray-50 p-3">
                <div className="mb-2 h-3.5 w-28 rounded" style={{ backgroundColor: colors.data.color_primary }} />
                <div className="mb-1 h-2 w-full rounded bg-gray-200" />
                <div className="mb-1 h-2 w-4/5 rounded bg-gray-200" />
                <div className="mb-1 h-2 w-3/5 rounded bg-gray-200" />
                <div className="mt-3 flex gap-2">
                  <div className="rounded px-3 py-1.5 text-[10px] text-white" style={{ backgroundColor: colors.data.color_primary }}>
                    Primary
                  </div>
                  <div className="rounded px-3 py-1.5 text-[10px] text-white" style={{ backgroundColor: colors.data.color_secondary }}>
                    Secondary
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* Login Page Section */}
        <Section
          title="Page de connexion"
          isDirty={login.isDirty}
          isSaving={login.isSaving}
          showSaved={login.showSaved}
          onSave={login.save}
          saveLabel={t("saveChanges")}
          savingLabel={t("saving")}
          unsavedLabel={t("unsavedChanges")}
          savedLabel={t("changesSaved")}
        >
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">{t("loginBgImage")}</label>
            <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50">
              <button className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
                <Upload className="h-4 w-4" />
                {t("upload")}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-400">{t("loginBgImageHint")}</p>
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("loginMessage")}</label>
            <input
              value={login.data.login_message}
              onChange={(e) => login.updateField("login_message", e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              placeholder="Bienvenue sur votre espace Cantaia"
            />
          </div>
        </Section>
      </div>
    </div>
  );
}

/** Reusable section wrapper with save button */
function Section({
  title,
  children,
  isDirty,
  isSaving,
  showSaved,
  onSave,
  saveLabel,
  savingLabel,
  unsavedLabel,
  savedLabel,
  extraActions,
}: {
  title: string;
  children: React.ReactNode;
  isDirty: boolean;
  isSaving: boolean;
  showSaved: boolean;
  onSave: () => void;
  saveLabel: string;
  savingLabel: string;
  unsavedLabel: string;
  savedLabel: string;
  extraActions?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-semibold text-gray-800">{title}</h3>
      {children}
      <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
        <div className="flex items-center gap-3">
          {isDirty && (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {unsavedLabel}
            </span>
          )}
          {showSaved && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3.5 w-3.5" />
              {savedLabel}
            </span>
          )}
          {extraActions}
        </div>
        <button
          onClick={onSave}
          disabled={!isDirty || isSaving}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSaving ? savingLabel : saveLabel}
        </button>
      </div>
    </div>
  );
}
