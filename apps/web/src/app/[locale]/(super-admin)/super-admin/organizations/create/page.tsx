"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Building2,
  Globe,
  UserPlus,
  ArrowLeft,
  ArrowRight,
  Check,
  Rocket,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";

const STEPS = ["stepInfo", "stepSubdomain", "stepAdmin"] as const;
const STEP_ICONS = [Building2, Globe, UserPlus];

function suggestSubdomain(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}

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
  // Step 3 - First admin
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
  const [createError, setCreateError] = useState<string | null>(null);
  const [subdomainStatus, setSubdomainStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "reserved" | "invalid"
  >("idle");
  const [subdomainManuallyEdited, setSubdomainManuallyEdited] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    invite_first_name: "",
    invite_last_name: "",
    invite_email: "",
    invite_job_title: "",
    invite_message: "",
  });

  function updateForm<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Auto-generate subdomain when org name changes (unless manually edited)
  useEffect(() => {
    if (!subdomainManuallyEdited && form.name.trim().length > 0) {
      const suggested = suggestSubdomain(form.name);
      setForm((prev) => ({ ...prev, subdomain: suggested }));
      // Auto-check availability with debounce
      if (suggested.length >= 3) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          checkSubdomainAvailability(suggested);
        }, 500);
      } else {
        setSubdomainStatus("idle");
      }
    }
  }, [form.name, subdomainManuallyEdited]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const checkSubdomainAvailability = useCallback(async (sub: string) => {
    const cleaned = sub.toLowerCase().trim();
    if (!cleaned || cleaned.length < 3) {
      setSubdomainStatus("invalid");
      return;
    }
    setSubdomainStatus("checking");
    try {
      const res = await fetch(
        `/api/super-admin?action=check-subdomain&subdomain=${cleaned}`
      );
      const data = await res.json();
      if (data.available) {
        setSubdomainStatus("available");
      } else {
        setSubdomainStatus(data.reason === "reserved" ? "reserved" : "taken");
      }
    } catch {
      setSubdomainStatus("invalid");
    }
  }, []);

  function handleSubdomainManualChange(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    updateForm("subdomain", cleaned);
    setSubdomainManuallyEdited(true);
    setSubdomainStatus("idle");

    // Debounced availability check
    if (cleaned.length >= 3) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        checkSubdomainAvailability(cleaned);
      }, 500);
    }
  }

  // Plan presets
  function applyPlanLimits(plan: string) {
    const presets: Record<
      string,
      { max_users: number; max_projects: number }
    > = {
      trial: { max_users: 5, max_projects: 3 },
      starter: { max_users: 5, max_projects: 10 },
      pro: { max_users: 20, max_projects: 999 },
      enterprise: { max_users: 999, max_projects: 999 },
    };
    const p = presets[plan] || presets.pro;
    setForm((prev) => ({
      ...prev,
      plan,
      max_users: p.max_users,
      max_projects: p.max_projects,
    }));
  }

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
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
      if (!res.ok || data.error) {
        setCreateError(data.error || `Erreur serveur (${res.status})`);
        console.error("[create-org] API error:", res.status, data);
        return;
      }
      if (data.organization) {
        router.push(`/super-admin/organizations/${data.organization.id}`);
      } else {
        setCreateError("Réponse inattendue du serveur — organisation non créée.");
      }
    } catch (err) {
      console.error("Create org failed:", err);
      setCreateError(err instanceof Error ? err.message : "Erreur réseau — veuillez réessayer.");
    } finally {
      setCreating(false);
    }
  }

  const canGoNext = () => {
    if (step === 0) return form.name.trim().length > 0;
    if (step === 1)
      return (
        form.subdomain.trim().length >= 3 && subdomainStatus === "available"
      );
    if (step === 2) return form.invite_email.trim().length > 0;
    return true;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push("/super-admin/organizations")}
          className="mb-3 flex items-center gap-1.5 text-sm text-[#A1A1AA] hover:text-[#FAFAFA] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("organizations")}
        </button>
        <h1 className="text-2xl font-bold text-[#FAFAFA]">
          {t("createOrganization")}
        </h1>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((stepKey, i) => {
          const Icon = STEP_ICONS[i];
          const isActive = i === step;
          const isDone = i < step;
          return (
            <div key={stepKey} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`h-0.5 w-8 ${isDone ? "bg-[#F97316]" : "bg-[#27272A]"}`}
                />
              )}
              <button
                onClick={() => i < step && setStep(i)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-[#F97316]/10 font-medium text-[#F97316] ring-1 ring-[#F97316]/30"
                    : isDone
                      ? "bg-[#10B981]/10 text-[#10B981] cursor-pointer hover:bg-[#10B981]/20"
                      : "bg-[#27272A]/50 text-[#71717A]"
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
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-6">
          {/* STEP 1 — INFO */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-[#FAFAFA]">
                {t("stepInfo")}
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">
                    {t("orgName")} *
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => updateForm("name", e.target.value)}
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                    placeholder="HRS Real Estate SA"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">
                    {t("orgDisplayName")}
                  </label>
                  <input
                    value={form.display_name}
                    onChange={(e) => updateForm("display_name", e.target.value)}
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                    placeholder="HRS"
                  />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">
                    {t("orgAddress")}
                  </label>
                  <input
                    value={form.address}
                    onChange={(e) => updateForm("address", e.target.value)}
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">
                    {t("orgCity")}
                  </label>
                  <input
                    value={form.city}
                    onChange={(e) => updateForm("city", e.target.value)}
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">
                    {t("orgPostalCode")}
                  </label>
                  <input
                    value={form.postal_code}
                    onChange={(e) => updateForm("postal_code", e.target.value)}
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">
                    {t("orgPhone")}
                  </label>
                  <input
                    value={form.phone}
                    onChange={(e) => updateForm("phone", e.target.value)}
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">
                    {t("orgWebsite")}
                  </label>
                  <input
                    value={form.website}
                    onChange={(e) => updateForm("website", e.target.value)}
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                    placeholder="https://"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">
                  {t("internalNotes")}
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => updateForm("notes", e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                />
              </div>
            </div>
          )}

          {/* STEP 2 — SUBDOMAIN & PLAN */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-[#FAFAFA]">
                {t("stepSubdomain")}
              </h2>

              {/* Subdomain */}
              <div>
                <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">
                  {t("subdomain")} *
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center rounded-md border border-[#27272A] bg-[#0F0F11]">
                    <input
                      value={form.subdomain}
                      onChange={(e) =>
                        handleSubdomainManualChange(e.target.value)
                      }
                      className="w-40 rounded-l-md border-0 bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:outline-none"
                      placeholder="hrs"
                    />
                    <span className="border-l border-[#27272A] bg-[#1C1C1F] px-3 py-2 text-sm text-[#71717A]">
                      .cantaia.io
                    </span>
                  </div>
                  {subdomainStatus === "checking" && (
                    <Loader2 className="h-4 w-4 animate-spin text-[#71717A]" />
                  )}
                  {subdomainStatus === "available" && (
                    <span className="flex items-center gap-1 text-sm text-[#10B981]">
                      <CheckCircle className="h-4 w-4" />{" "}
                      {t("subdomainAvailable")}
                    </span>
                  )}
                  {subdomainStatus === "taken" && (
                    <span className="flex items-center gap-1 text-sm text-[#EF4444]">
                      <XCircle className="h-4 w-4" /> {t("subdomainTaken")}
                    </span>
                  )}
                  {subdomainStatus === "reserved" && (
                    <span className="flex items-center gap-1 text-sm text-[#F59E0B]">
                      <AlertTriangle className="h-4 w-4" />{" "}
                      {t("subdomainReserved")}
                    </span>
                  )}
                </div>
                {/* Live preview */}
                {form.subdomain.length >= 3 && (
                  <p className="mt-2 text-xs text-[#A1A1AA]">
                    URL :{" "}
                    <span className="font-mono text-[#F97316]">
                      {form.subdomain}.cantaia.io
                    </span>
                  </p>
                )}
                <p className="mt-1.5 text-xs text-[#F59E0B]">
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                  {t("subdomainWarning")}
                </p>
              </div>

              {/* Plan */}
              <div>
                <label className="mb-2 block text-sm font-medium text-[#A1A1AA]">
                  {t("plan")}
                </label>
                <div className="space-y-2">
                  {(["trial", "starter", "pro", "enterprise"] as const).map(
                    (p) => (
                      <label
                        key={p}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                          form.plan === p
                            ? "border-[#F97316]/50 bg-[#F97316]/5"
                            : "border-[#27272A] hover:border-[#3F3F46]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="plan"
                          checked={form.plan === p}
                          onChange={() => applyPlanLimits(p)}
                          className="accent-[#F97316]"
                        />
                        <span className="text-sm text-[#FAFAFA]">
                          {t(
                            `plan${p.charAt(0).toUpperCase() + p.slice(1)}`
                          )}
                        </span>
                      </label>
                    )
                  )}
                </div>
              </div>

              {/* Limits */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">
                    {t("maxUsers")}
                  </label>
                  <input
                    type="number"
                    value={form.max_users}
                    onChange={(e) =>
                      updateForm("max_users", parseInt(e.target.value) || 5)
                    }
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">
                    {t("maxProjects")}
                  </label>
                  <input
                    type="number"
                    value={form.max_projects}
                    onChange={(e) =>
                      updateForm(
                        "max_projects",
                        parseInt(e.target.value) || 10
                      )
                    }
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 — FIRST ADMIN */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-[#FAFAFA]">
                {t("firstAdmin")}
              </h2>
              <p className="text-sm text-[#A1A1AA]">{t("firstAdminDesc")}</p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">
                    {t("firstName")}
                  </label>
                  <input
                    value={form.invite_first_name}
                    onChange={(e) =>
                      updateForm("invite_first_name", e.target.value)
                    }
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">
                    {t("lastName")}
                  </label>
                  <input
                    value={form.invite_last_name}
                    onChange={(e) =>
                      updateForm("invite_last_name", e.target.value)
                    }
                    className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">
                  {t("email")} *
                </label>
                <input
                  type="email"
                  value={form.invite_email}
                  onChange={(e) => updateForm("invite_email", e.target.value)}
                  className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">
                  {t("jobTitle")}
                </label>
                <input
                  value={form.invite_job_title}
                  onChange={(e) =>
                    updateForm("invite_job_title", e.target.value)
                  }
                  className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#A1A1AA]">
                  {t("inviteMessage")}
                </label>
                <textarea
                  value={form.invite_message}
                  onChange={(e) =>
                    updateForm("invite_message", e.target.value)
                  }
                  rows={3}
                  className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                  placeholder={`Bonjour, votre espace Cantaia est pret !\nConnectez-vous sur ${form.subdomain}.cantaia.io pour commencer.`}
                />
              </div>
            </div>
          )}

          {/* Error banner */}
          {createError && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
              <p className="text-sm text-red-300">{createError}</p>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="mt-6 flex items-center justify-between border-t border-[#27272A] pt-4">
            <div>
              {step > 0 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-[#A1A1AA] hover:bg-[#27272A] transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t("previous")}
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#71717A]">
                {t("step")} {step + 1} {t("stepOf")} {STEPS.length}
              </span>
              {step < STEPS.length - 1 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={!canGoNext()}
                  className="flex items-center gap-1.5 rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#EA580C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {t("next")}
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={handleCreate}
                  disabled={!canGoNext() || creating}
                  className="flex items-center gap-1.5 rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#EA580C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
