"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Building2,
  Globe,
  Palette,
  UserPlus,
  ArrowLeft,
  ArrowRight,
  Check,
  Rocket,
  Upload,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import type { OrganizationBranding } from "@cantaia/database";

const STEPS = ["stepInfo", "stepSubdomain", "stepBranding", "stepAdmin"] as const;
const STEP_ICONS = [Building2, Globe, Palette, UserPlus];

interface FormData {
  // Step 1 - Info
  name: string;
  display_name: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  phone: string;
  website: string;
  notes: string;
  // Step 2 - Subdomain & Plan
  subdomain: string;
  plan: string;
  max_users: number;
  max_projects: number;
  // Step 3 - Branding
  branding: OrganizationBranding;
  // Step 4 - First admin
  invite_first_name: string;
  invite_last_name: string;
  invite_email: string;
  invite_job_title: string;
  invite_message: string;
}

export default function CreateOrganizationPage() {
  const t = useTranslations("superAdmin");
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [subdomainStatus, setSubdomainStatus] = useState<"idle" | "checking" | "available" | "taken" | "reserved" | "invalid">("idle");

  const [form, setForm] = useState<FormData>({
    name: "",
    display_name: "",
    address: "",
    city: "",
    postal_code: "",
    country: "CH",
    phone: "",
    website: "",
    notes: "",
    subdomain: "",
    plan: "pro",
    max_users: 20,
    max_projects: 999,
    branding: {
      color_primary: "#1E40AF",
      color_secondary: "#3B82F6",
      color_sidebar_bg: "#0F172A",
      color_sidebar_text: "#F8FAFC",
      theme: "light",
    },
    invite_first_name: "",
    invite_last_name: "",
    invite_email: "",
    invite_job_title: "",
    invite_message: "",
  });

  function updateForm<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateBranding<K extends keyof OrganizationBranding>(key: K, value: OrganizationBranding[K]) {
    setForm((prev) => ({
      ...prev,
      branding: { ...prev.branding, [key]: value },
    }));
  }

  async function checkSubdomain() {
    const sub = form.subdomain.toLowerCase().trim();
    if (!sub || sub.length < 3) {
      setSubdomainStatus("invalid");
      return;
    }
    setSubdomainStatus("checking");
    try {
      const res = await fetch(`/api/super-admin?action=check-subdomain&subdomain=${sub}`);
      const data = await res.json();
      if (data.available) {
        setSubdomainStatus("available");
      } else {
        setSubdomainStatus(data.reason === "reserved" ? "reserved" : "taken");
      }
    } catch {
      setSubdomainStatus("invalid");
    }
  }

  // Plan presets
  function applyPlanLimits(plan: string) {
    const presets: Record<string, { max_users: number; max_projects: number }> = {
      trial: { max_users: 5, max_projects: 3 },
      starter: { max_users: 5, max_projects: 10 },
      pro: { max_users: 20, max_projects: 999 },
      enterprise: { max_users: 999, max_projects: 999 },
    };
    const p = presets[plan] || presets.pro;
    setForm((prev) => ({ ...prev, plan, max_users: p.max_users, max_projects: p.max_projects }));
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/super-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-organization",
          ...form,
        }),
      });
      const data = await res.json();
      if (data.organization) {
        router.push(`/super-admin/organizations/${data.organization.id}`);
      }
    } catch (err) {
      console.error("Create org failed:", err);
    } finally {
      setCreating(false);
    }
  }

  const canGoNext = () => {
    if (step === 0) return form.name.trim().length > 0;
    if (step === 1) return form.subdomain.trim().length >= 3 && subdomainStatus === "available";
    if (step === 2) return true;
    if (step === 3) return form.invite_email.trim().length > 0;
    return true;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push("/super-admin/organizations")}
          className="mb-3 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("organizations")}
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{t("createOrganization")}</h1>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((stepKey, i) => {
          const Icon = STEP_ICONS[i];
          const isActive = i === step;
          const isDone = i < step;
          return (
            <div key={stepKey} className="flex items-center gap-2">
              {i > 0 && <div className={`h-0.5 w-8 ${isDone ? "bg-amber-400" : "bg-gray-200"}`} />}
              <button
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-amber-50 font-medium text-amber-700 ring-1 ring-amber-200"
                    : isDone
                      ? "bg-green-50 text-green-700 cursor-pointer hover:bg-green-100"
                      : "bg-gray-50 text-gray-400"
                }`}
              >
                {isDone ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">{t(stepKey)}</span>
                <span className="sm:hidden">{i + 1}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="mx-auto max-w-2xl">
        <div className="rounded-lg border border-gray-200 bg-white p-6">

          {/* STEP 1 — INFO */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">{t("stepInfo")}</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("orgName")} *</label>
                  <input
                    value={form.name}
                    onChange={(e) => updateForm("name", e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    placeholder="HRS Real Estate SA"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("orgDisplayName")}</label>
                  <input
                    value={form.display_name}
                    onChange={(e) => updateForm("display_name", e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    placeholder="HRS"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("orgAddress")}</label>
                  <input
                    value={form.address}
                    onChange={(e) => updateForm("address", e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("orgCity")}</label>
                  <input
                    value={form.city}
                    onChange={(e) => updateForm("city", e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("orgPostalCode")}</label>
                  <input
                    value={form.postal_code}
                    onChange={(e) => updateForm("postal_code", e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("orgPhone")}</label>
                  <input
                    value={form.phone}
                    onChange={(e) => updateForm("phone", e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("orgWebsite")}</label>
                  <input
                    value={form.website}
                    onChange={(e) => updateForm("website", e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    placeholder="https://"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("internalNotes")}</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => updateForm("notes", e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </div>
            </div>
          )}

          {/* STEP 2 — SUBDOMAIN & PLAN */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-800">{t("stepSubdomain")}</h2>

              {/* Subdomain */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("subdomain")} *</label>
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded-md border border-gray-300 bg-white">
                    <input
                      value={form.subdomain}
                      onChange={(e) => {
                        updateForm("subdomain", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                        setSubdomainStatus("idle");
                      }}
                      className="w-40 rounded-l-md border-0 bg-white px-3 py-2 text-sm focus:outline-none"
                      placeholder="hrs"
                    />
                    <span className="border-l border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                      .cantaia.ch
                    </span>
                  </div>
                  <button
                    onClick={checkSubdomain}
                    disabled={!form.subdomain || form.subdomain.length < 3}
                    className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    {t("subdomainCheck")}
                  </button>
                  {subdomainStatus === "checking" && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                  {subdomainStatus === "available" && (
                    <span className="flex items-center gap-1 text-sm text-green-600">
                      <CheckCircle className="h-4 w-4" /> {t("subdomainAvailable")}
                    </span>
                  )}
                  {subdomainStatus === "taken" && (
                    <span className="flex items-center gap-1 text-sm text-red-600">
                      <XCircle className="h-4 w-4" /> {t("subdomainTaken")}
                    </span>
                  )}
                  {subdomainStatus === "reserved" && (
                    <span className="flex items-center gap-1 text-sm text-orange-600">
                      <AlertTriangle className="h-4 w-4" /> {t("subdomainReserved")}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-amber-600">
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                  {t("subdomainWarning")}
                </p>
              </div>

              {/* Plan */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">{t("plan")}</label>
                <div className="space-y-2">
                  {(["trial", "starter", "pro", "enterprise"] as const).map((p) => (
                    <label
                      key={p}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                        form.plan === p
                          ? "border-amber-300 bg-amber-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="plan"
                        checked={form.plan === p}
                        onChange={() => applyPlanLimits(p)}
                        className="accent-amber-500"
                      />
                      <span className="text-sm">{t(`plan${p.charAt(0).toUpperCase() + p.slice(1)}`)}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Limits */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("maxUsers")}</label>
                  <input
                    type="number"
                    value={form.max_users}
                    onChange={(e) => updateForm("max_users", parseInt(e.target.value) || 5)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("maxProjects")}</label>
                  <input
                    type="number"
                    value={form.max_projects}
                    onChange={(e) => updateForm("max_projects", parseInt(e.target.value) || 10)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 — BRANDING */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-800">{t("stepBranding")}</h2>

              {/* Logo placeholders */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("logoMain")}</label>
                  <div className="flex h-20 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50">
                    <button className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
                      <Upload className="h-4 w-4" />
                      {t("upload")}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">{t("logoMainHint")}</p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("favicon")}</label>
                  <div className="flex h-20 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50">
                    <button className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
                      <Upload className="h-4 w-4" />
                      {t("upload")}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">{t("faviconHint")}</p>
                </div>
              </div>

              {/* Colors */}
              <div className="grid grid-cols-2 gap-4">
                {([
                  { key: "color_primary" as const, label: "colorPrimary" },
                  { key: "color_secondary" as const, label: "colorSecondary" },
                  { key: "color_sidebar_bg" as const, label: "colorSidebar" },
                  { key: "color_sidebar_text" as const, label: "colorSidebarText" },
                ]).map(({ key, label }) => (
                  <div key={key}>
                    <label className="mb-1 block text-sm font-medium text-gray-700">{t(label)}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.branding[key] || "#000000"}
                        onChange={(e) => updateBranding(key, e.target.value)}
                        className="h-9 w-9 cursor-pointer rounded border border-gray-300"
                      />
                      <input
                        value={form.branding[key] || ""}
                        onChange={(e) => updateBranding(key, e.target.value)}
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Login message */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("loginMessage")}</label>
                <input
                  value={form.branding.login_message || ""}
                  onChange={(e) => updateBranding("login_message", e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  placeholder="Bienvenue sur votre espace Cantaia"
                />
              </div>

              {/* Theme */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">{t("theme")}</label>
                <div className="flex gap-3">
                  {(["light", "dark", "auto"] as const).map((th) => (
                    <label
                      key={th}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm ${
                        form.branding.theme === th
                          ? "border-amber-300 bg-amber-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="theme"
                        checked={form.branding.theme === th}
                        onChange={() => updateBranding("theme", th)}
                        className="accent-amber-500"
                      />
                      {t(`theme${th.charAt(0).toUpperCase() + th.slice(1)}`)}
                    </label>
                  ))}
                </div>
              </div>

              {/* Mini preview */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">{t("livePreview")}</label>
                <div className="flex overflow-hidden rounded-lg border border-gray-200">
                  {/* Mini sidebar */}
                  <div
                    className="w-16 p-2"
                    style={{ backgroundColor: form.branding.color_sidebar_bg }}
                  >
                    <div className="mb-3 h-2 w-8 rounded" style={{ backgroundColor: form.branding.color_sidebar_text, opacity: 0.8 }} />
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="mb-1.5 h-2 rounded"
                        style={{
                          backgroundColor: form.branding.color_sidebar_text,
                          opacity: i === 1 ? 0.9 : 0.4,
                          width: `${60 + i * 5}%`,
                        }}
                      />
                    ))}
                  </div>
                  {/* Mini content */}
                  <div className="flex-1 bg-gray-50 p-3">
                    <div className="mb-2 h-3 w-24 rounded" style={{ backgroundColor: form.branding.color_primary }} />
                    <div className="mb-1 h-2 w-full rounded bg-gray-200" />
                    <div className="mb-1 h-2 w-3/4 rounded bg-gray-200" />
                    <div className="mt-3 inline-block rounded px-3 py-1 text-[10px] text-white" style={{ backgroundColor: form.branding.color_primary }}>
                      Button
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4 — FIRST ADMIN */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">{t("firstAdmin")}</h2>
              <p className="text-sm text-gray-500">{t("firstAdminDesc")}</p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("firstName")}</label>
                  <input
                    value={form.invite_first_name}
                    onChange={(e) => updateForm("invite_first_name", e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">{t("lastName")}</label>
                  <input
                    value={form.invite_last_name}
                    onChange={(e) => updateForm("invite_last_name", e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("email")} *</label>
                <input
                  type="email"
                  value={form.invite_email}
                  onChange={(e) => updateForm("invite_email", e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("jobTitle")}</label>
                <input
                  value={form.invite_job_title}
                  onChange={(e) => updateForm("invite_job_title", e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t("inviteMessage")}</label>
                <textarea
                  value={form.invite_message}
                  onChange={(e) => updateForm("invite_message", e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  placeholder={`Bonjour, votre espace Cantaia est prêt !\nConnectez-vous sur ${form.subdomain}.cantaia.ch pour commencer.`}
                />
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
            <div>
              {step > 0 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t("previous")}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">
                {t("step")} {step + 1} {t("stepOf")} {STEPS.length}
              </span>
              {step < STEPS.length - 1 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={!canGoNext()}
                  className="flex items-center gap-1.5 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t("next")}
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={handleCreate}
                  disabled={!canGoNext() || creating}
                  className="flex items-center gap-1.5 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
                  {t("createOrg")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
