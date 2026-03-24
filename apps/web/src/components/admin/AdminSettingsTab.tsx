"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Upload,
  RotateCcw,
  Loader2,
  Check,
  AlertCircle,
  Eye,
  Building2,
  Palette,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const DEFAULT_COLORS = {
  primary: "#1E40AF",
  secondary: "#3B82F6",
};

export default function AdminSettingsTab() {
  const t = useTranslations("admin");
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState("");

  // Form state
  const [orgInfo, setOrgInfo] = useState({
    name: "",
    address: "",
    city: "",
    country: "Suisse",
  });
  const [savedOrgInfo, setSavedOrgInfo] = useState(orgInfo);
  const [orgInfoDirty, setOrgInfoDirty] = useState(false);
  const [savingOrgInfo, setSavingOrgInfo] = useState(false);
  const [orgInfoSaved, setOrgInfoSaved] = useState(false);

  const [branding, setBranding] = useState({
    logo_url: "",
    primary_color: DEFAULT_COLORS.primary,
    secondary_color: DEFAULT_COLORS.secondary,
  });
  const [savedBranding, setSavedBranding] = useState(branding);
  const [brandingDirty, setBrandingDirty] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    loadOrgData();
  }, []);

  async function loadOrgData() {
    try {
      const profileRes = await fetch("/api/user/profile");
      const profileData = await profileRes.json();
      const userOrgId = profileData?.profile?.organization_id;
      if (!userOrgId) {
        setLoading(false);
        return;
      }
      setOrgId(userOrgId);

      const supabase = createClient();
      const { data: org } = await (supabase.from("organizations") as any)
        .select("*")
        .eq("id", userOrgId)
        .maybeSingle();

      if (org) {
        const info = {
          name: org.name || "",
          address: org.address || "",
          city: org.city || "",
          country: org.country || "Suisse",
        };
        setOrgInfo(info);
        setSavedOrgInfo(info);

        const brand = {
          logo_url: org.logo_url || "",
          primary_color: org.primary_color || DEFAULT_COLORS.primary,
          secondary_color: org.secondary_color || DEFAULT_COLORS.secondary,
        };
        setBranding(brand);
        setSavedBranding(brand);
      }
    } catch (err) {
      console.error("Failed to load org data:", err);
    } finally {
      setLoading(false);
    }
  }

  function updateOrgInfo(field: string, value: string) {
    setOrgInfo((prev) => {
      const next = { ...prev, [field]: value };
      setOrgInfoDirty(JSON.stringify(next) !== JSON.stringify(savedOrgInfo));
      return next;
    });
  }

  function updateBranding(field: string, value: string) {
    setBranding((prev) => {
      const next = { ...prev, [field]: value };
      setBrandingDirty(JSON.stringify(next) !== JSON.stringify(savedBranding));
      return next;
    });
  }

  async function saveOrgInfo() {
    setSavingOrgInfo(true);
    try {
      const supabase = createClient();
      await (supabase.from("organizations") as any)
        .update({
          name: orgInfo.name,
          address: orgInfo.address,
          city: orgInfo.city,
          country: orgInfo.country,
        })
        .eq("id", orgId);

      setSavedOrgInfo({ ...orgInfo });
      setOrgInfoDirty(false);
      setOrgInfoSaved(true);
      setTimeout(() => setOrgInfoSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save org info:", err);
    } finally {
      setSavingOrgInfo(false);
    }
  }

  async function saveBranding() {
    setSavingBranding(true);
    try {
      await fetch("/api/organization/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primary_color: branding.primary_color,
          secondary_color: branding.secondary_color,
          branding_enabled: true,
        }),
      });

      setSavedBranding({ ...branding });
      setBrandingDirty(false);
      setBrandingSaved(true);
      setTimeout(() => setBrandingSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save branding:", err);
    } finally {
      setSavingBranding(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);

      const res = await fetch("/api/organization/upload-logo", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.logo_url) {
          setBranding((prev) => ({ ...prev, logo_url: data.logo_url }));
          setSavedBranding((prev) => ({ ...prev, logo_url: data.logo_url }));
        }
      }
    } catch (err) {
      console.error("Failed to upload logo:", err);
    } finally {
      setUploadingLogo(false);
    }
  }

  function resetColors() {
    updateBranding("primary_color", DEFAULT_COLORS.primary);
    updateBranding("secondary_color", DEFAULT_COLORS.secondary);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Organization Info */}
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#FAFAFA]">
          <Building2 className="h-4 w-4 text-[#F97316]" />
          {t("orgName")}
        </h3>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#FAFAFA]">
              {t("orgName")}
            </label>
            <input
              value={orgInfo.name}
              onChange={(e) => updateOrgInfo("name", e.target.value)}
              className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#FAFAFA]">
              {t("orgAddress")}
            </label>
            <input
              value={orgInfo.address}
              onChange={(e) => updateOrgInfo("address", e.target.value)}
              className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[#FAFAFA]">
                Ville
              </label>
              <input
                value={orgInfo.city}
                onChange={(e) => updateOrgInfo("city", e.target.value)}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[#FAFAFA]">
                Pays
              </label>
              <input
                value={orgInfo.country}
                onChange={(e) => updateOrgInfo("country", e.target.value)}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>
        </div>

        {/* Save footer */}
        <div className="mt-5 flex items-center justify-between border-t border-[#27272A] pt-4">
          <div className="flex items-center gap-3">
            {orgInfoDirty && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <AlertCircle className="h-3.5 w-3.5" />
                Modifications non enregistrees
              </span>
            )}
            {orgInfoSaved && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <Check className="h-3.5 w-3.5" />
                {t("saved")}
              </span>
            )}
          </div>
          <button
            onClick={saveOrgInfo}
            disabled={!orgInfoDirty || savingOrgInfo}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {savingOrgInfo && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("save")}
          </button>
        </div>
      </div>

      {/* Branding */}
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#FAFAFA]">
          <Palette className="h-4 w-4 text-[#F97316]" />
          {t("branding")}
        </h3>

        {/* Logo upload */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-[#FAFAFA]">
            {t("uploadLogo")}
          </label>
          <div className="flex items-center gap-4">
            {branding.logo_url ? (
              <img
                src={branding.logo_url}
                alt="Logo"
                className="h-16 w-16 rounded-lg border border-[#27272A] object-contain"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed border-[#27272A] bg-[#27272A]">
                <Upload className="h-5 w-5 text-[#71717A]" />
              </div>
            )}
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <span className="flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-2 text-sm font-medium text-[#71717A] hover:bg-[#27272A]">
                {uploadingLogo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {t("uploadLogo")}
              </span>
            </label>
          </div>
          <p className="mt-1 text-xs text-[#71717A]">
            PNG, JPEG ou WebP. Max 2 MB.
          </p>
        </div>

        {/* Colors */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#FAFAFA]">
              {t("primaryColor")}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={branding.primary_color}
                onChange={(e) =>
                  updateBranding("primary_color", e.target.value)
                }
                className="h-9 w-9 cursor-pointer rounded border border-[#27272A]"
              />
              <input
                value={branding.primary_color}
                onChange={(e) =>
                  updateBranding("primary_color", e.target.value)
                }
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#FAFAFA]">
              Couleur secondaire
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={branding.secondary_color}
                onChange={(e) =>
                  updateBranding("secondary_color", e.target.value)
                }
                className="h-9 w-9 cursor-pointer rounded border border-[#27272A]"
              />
              <input
                value={branding.secondary_color}
                onChange={(e) =>
                  updateBranding("secondary_color", e.target.value)
                }
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="mt-4">
          <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[#FAFAFA]">
            <Eye className="h-4 w-4" />
            Apercu
          </label>
          <div className="flex overflow-hidden rounded-lg border border-[#27272A]">
            <div
              className="w-16 p-2"
              style={{ backgroundColor: branding.primary_color }}
            >
              <div
                className="mb-2 h-2 w-10 rounded"
                style={{ backgroundColor: "#ffffff", opacity: 0.8 }}
              />
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="mb-1.5 h-1.5 rounded"
                  style={{
                    backgroundColor: "#ffffff",
                    opacity: i === 1 ? 0.9 : 0.35,
                    width: `${50 + i * 12}%`,
                  }}
                />
              ))}
            </div>
            <div className="flex-1 bg-[#27272A] p-3">
              <div
                className="mb-2 h-3 w-24 rounded"
                style={{ backgroundColor: branding.primary_color }}
              />
              <div className="mb-1 h-1.5 w-full rounded bg-[#27272A]" />
              <div className="mb-1 h-1.5 w-4/5 rounded bg-[#27272A]" />
              <div className="mt-3 flex gap-2">
                <div
                  className="rounded px-2.5 py-1 text-[9px] text-white"
                  style={{ backgroundColor: branding.primary_color }}
                >
                  Primary
                </div>
                <div
                  className="rounded px-2.5 py-1 text-[9px] text-white"
                  style={{ backgroundColor: branding.secondary_color }}
                >
                  Secondary
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save footer */}
        <div className="mt-5 flex items-center justify-between border-t border-[#27272A] pt-4">
          <div className="flex items-center gap-3">
            {brandingDirty && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <AlertCircle className="h-3.5 w-3.5" />
                Modifications non enregistrees
              </span>
            )}
            {brandingSaved && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <Check className="h-3.5 w-3.5" />
                {t("saved")}
              </span>
            )}
            <button
              onClick={resetColors}
              className="flex items-center gap-1.5 text-xs text-[#71717A] hover:text-[#FAFAFA]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reinitialiser
            </button>
          </div>
          <button
            onClick={saveBranding}
            disabled={!brandingDirty || savingBranding}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {savingBranding && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
