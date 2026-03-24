"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Mail,
  Shield,
  Plus,
  X,
  Settings,
  Globe,
  ArrowRight,
  Check,
  ChevronDown,
} from "lucide-react";

// ─── Types ───
interface ClassificationSettings {
  autoClassifyEnabled: boolean;
  confidenceThreshold: number;
  suggestProjectCreation: boolean;
  autoClassifyNewsletters: boolean;
  ignoredCategories: {
    newsletter: boolean;
    spam: boolean;
    internal: boolean;
  };
  ignoredDomains: string[];
  mappedDomains: { domain: string; project: string }[];
}

const DEFAULT_SETTINGS: ClassificationSettings = {
  autoClassifyEnabled: true,
  confidenceThreshold: 85,
  suggestProjectCreation: true,
  autoClassifyNewsletters: false,
  ignoredCategories: {
    newsletter: true,
    spam: true,
    internal: false,
  },
  ignoredDomains: ["hilti-promo.com", "sika-promotions.ch"],
  mappedDomains: [
    { domain: "bg-ingenieurs.ch", project: "Projet X" },
  ],
};

const CONFIDENCE_OPTIONS = [50, 60, 70, 80, 85, 90, 95];

const LS_KEY = "cantaia_classification_settings";

function loadSettings(): ClassificationSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: ClassificationSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, JSON.stringify(settings));
}

// ─── Checkbox ───
function Checkbox({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <div className="pt-0.5">
        <button
          type="button"
          onClick={() => onChange(!checked)}
          className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
            checked
              ? "border-[#F97316] bg-[#F97316] text-white"
              : "border-[#27272A] bg-[#18181B] hover:border-[#27272A]"
          }`}
        >
          {checked && <Check className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="flex-1" onClick={() => onChange(!checked)}>
        <p className="text-sm font-medium text-[#FAFAFA]">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-[#71717A]">{description}</p>
        )}
      </div>
    </label>
  );
}

// ─── Main Component ───
export function ClassificationSettingsTab() {
  const t = useTranslations("settings");

  const [settings, setSettings] = useState<ClassificationSettings>(DEFAULT_SETTINGS);
  const [mounted, setMounted] = useState(false);

  // Ignored domain input
  const [showIgnoredDomainInput, setShowIgnoredDomainInput] = useState(false);
  const [newIgnoredDomain, setNewIgnoredDomain] = useState("");

  // Mapped domain input
  const [showMappedDomainInput, setShowMappedDomainInput] = useState(false);
  const [newMappedDomain, setNewMappedDomain] = useState("");
  const [newMappedProject, setNewMappedProject] = useState("");

  // Load from localStorage on mount
  useEffect(() => {
    setSettings(loadSettings());
    setMounted(true);
  }, []);

  // Auto-save on change
  useEffect(() => {
    if (mounted) {
      saveSettings(settings);
    }
  }, [settings, mounted]);

  // Update helpers
  const update = (partial: Partial<ClassificationSettings>) =>
    setSettings((prev) => ({ ...prev, ...partial }));

  const updateIgnoredCategory = (
    key: keyof ClassificationSettings["ignoredCategories"],
    value: boolean
  ) =>
    setSettings((prev) => ({
      ...prev,
      ignoredCategories: { ...prev.ignoredCategories, [key]: value },
    }));

  // Add/remove ignored domains
  const addIgnoredDomain = () => {
    const domain = newIgnoredDomain.trim().toLowerCase();
    if (domain && !settings.ignoredDomains.includes(domain)) {
      update({ ignoredDomains: [...settings.ignoredDomains, domain] });
      setNewIgnoredDomain("");
      setShowIgnoredDomainInput(false);
    }
  };

  const removeIgnoredDomain = (domain: string) => {
    update({
      ignoredDomains: settings.ignoredDomains.filter((d) => d !== domain),
    });
  };

  // Add/remove mapped domains
  const addMappedDomain = () => {
    const domain = newMappedDomain.trim().toLowerCase();
    const project = newMappedProject.trim();
    if (
      domain &&
      project &&
      !settings.mappedDomains.some((m) => m.domain === domain)
    ) {
      update({
        mappedDomains: [...settings.mappedDomains, { domain, project }],
      });
      setNewMappedDomain("");
      setNewMappedProject("");
      setShowMappedDomainInput(false);
    }
  };

  const removeMappedDomain = (domain: string) => {
    update({
      mappedDomains: settings.mappedDomains.filter((m) => m.domain !== domain),
    });
  };

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      {/* ─── Section 1: Automatic Classification ─── */}
      <div>
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] mb-3 pb-2 border-b border-[#27272A] flex items-center gap-2">
          <Settings className="h-4 w-4 text-[#71717A]" />
          {t("classificationAutoTitle")}
        </div>

        <div className="space-y-4">
          {/* Auto-classify toggle + confidence threshold */}
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Checkbox
                checked={settings.autoClassifyEnabled}
                onChange={(v) => update({ autoClassifyEnabled: v })}
                label={t("classificationAutoClassify")}
                description={t("classificationAutoClassifyDesc")}
              />
            </div>
            {settings.autoClassifyEnabled && (
              <div className="relative ml-4">
                <select
                  value={settings.confidenceThreshold}
                  onChange={(e) =>
                    update({ confidenceThreshold: Number(e.target.value) })
                  }
                  className="appearance-none rounded-lg border border-[#3F3F46] bg-[#18181B] py-[9px] pl-[14px] pr-8 text-[13px] text-[#D4D4D8] focus:border-[#F97316] outline-none"
                >
                  {CONFIDENCE_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}%
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717A]" />
              </div>
            )}
          </div>

          {/* Suggest project creation */}
          <Checkbox
            checked={settings.suggestProjectCreation}
            onChange={(v) => update({ suggestProjectCreation: v })}
            label={t("classificationSuggestProject")}
            description={t("classificationSuggestProjectDesc")}
          />

          {/* Auto-classify newsletters */}
          <Checkbox
            checked={settings.autoClassifyNewsletters}
            onChange={(v) => update({ autoClassifyNewsletters: v })}
            label={t("classificationAutoNewsletters")}
            description={t("classificationAutoNewslettersDesc")}
          />
        </div>
      </div>

      {/* ─── Section 2: Ignored Categories ─── */}
      <div>
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] mb-3 pb-2 border-b border-[#27272A] flex items-center gap-2">
          <Shield className="h-4 w-4 text-[#71717A]" />
          {t("classificationIgnoredCategories")}
        </div>
        <p className="mb-4 text-[12px] text-[#71717A]">
          {t("classificationIgnoredCategoriesDesc")}
        </p>

        <div className="space-y-3">
          <Checkbox
            checked={settings.ignoredCategories.newsletter}
            onChange={(v) => updateIgnoredCategory("newsletter", v)}
            label={t("classificationCatNewsletter")}
          />
          <Checkbox
            checked={settings.ignoredCategories.spam}
            onChange={(v) => updateIgnoredCategory("spam", v)}
            label={t("classificationCatSpam")}
          />
          <Checkbox
            checked={settings.ignoredCategories.internal}
            onChange={(v) => updateIgnoredCategory("internal", v)}
            label={t("classificationCatInternal")}
            description={t("classificationCatInternalDesc")}
          />
        </div>
      </div>

      {/* ─── Section 3: Ignored Domains ─── */}
      <div>
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] mb-3 pb-2 border-b border-[#27272A] flex items-center gap-2">
          <Globe className="h-4 w-4 text-[#71717A]" />
          {t("classificationIgnoredDomains")}
        </div>
        <p className="mb-4 text-[12px] text-[#71717A]">
          {t("classificationIgnoredDomainsDesc")}
        </p>

        <div className="flex flex-wrap gap-2">
          {settings.ignoredDomains.map((domain) => (
            <span
              key={domain}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#27272A] bg-[#27272A] px-3 py-1.5 text-sm text-[#FAFAFA]"
            >
              {domain}
              <button
                type="button"
                onClick={() => removeIgnoredDomain(domain)}
                className="rounded-full p-0.5 text-[#71717A] transition-colors hover:bg-[#27272A] hover:text-[#71717A]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}

          {showIgnoredDomainInput ? (
            <div className="inline-flex items-center gap-1.5">
              <input
                type="text"
                value={newIgnoredDomain}
                onChange={(e) => setNewIgnoredDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addIgnoredDomain();
                  if (e.key === "Escape") {
                    setShowIgnoredDomainInput(false);
                    setNewIgnoredDomain("");
                  }
                }}
                placeholder="exemple.com"
                className="rounded-md border border-[#3F3F46] bg-[#18181B] px-2.5 py-1.5 text-sm text-[#D4D4D8] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                autoFocus
              />
              <button
                type="button"
                onClick={addIgnoredDomain}
                className="rounded-md bg-[#F97316] px-2.5 py-1.5 text-sm font-medium text-white hover:bg-[#EA580C]"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowIgnoredDomainInput(false);
                  setNewIgnoredDomain("");
                }}
                className="rounded-md border border-[#27272A] px-2.5 py-1.5 text-sm text-[#71717A] hover:bg-[#27272A]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowIgnoredDomainInput(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[#27272A] px-3 py-1.5 text-sm text-[#71717A] transition-colors hover:border-[#27272A] hover:text-[#FAFAFA]"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("classificationAddDomain")}
            </button>
          )}
        </div>
      </div>

      {/* ─── Section 4: Mapped Domains (Site Contacts) ─── */}
      <div>
        <div className="font-display text-[14px] font-bold text-[#FAFAFA] mb-3 pb-2 border-b border-[#27272A] flex items-center gap-2">
          <Mail className="h-4 w-4 text-[#71717A]" />
          {t("classificationMappedDomains")}
        </div>
        <p className="mb-4 text-[12px] text-[#71717A]">
          {t("classificationMappedDomainsDesc")}
        </p>

        <div className="space-y-2">
          {settings.mappedDomains.map((mapping) => (
            <div
              key={mapping.domain}
              className="flex items-center gap-2 rounded-md border border-[#27272A] bg-[#27272A] px-3 py-2"
            >
              <span className="text-sm font-medium text-[#FAFAFA]">
                {mapping.domain}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-[#71717A]" />
              <span className="text-sm text-[#F97316] font-medium">
                {mapping.project}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => removeMappedDomain(mapping.domain)}
                className="rounded-full p-1 text-[#71717A] transition-colors hover:bg-[#27272A] hover:text-[#71717A]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {showMappedDomainInput ? (
            <div className="flex items-center gap-2 rounded-md border border-[#F97316]/20 bg-[#F97316]/10 px-3 py-2">
              <input
                type="text"
                value={newMappedDomain}
                onChange={(e) => setNewMappedDomain(e.target.value)}
                placeholder="domaine.ch"
                className="w-40 rounded-md border border-[#3F3F46] bg-[#18181B] px-2.5 py-1.5 text-sm text-[#D4D4D8] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                autoFocus
              />
              <ArrowRight className="h-3.5 w-3.5 text-[#71717A]" />
              <input
                type="text"
                value={newMappedProject}
                onChange={(e) => setNewMappedProject(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addMappedDomain();
                  if (e.key === "Escape") {
                    setShowMappedDomainInput(false);
                    setNewMappedDomain("");
                    setNewMappedProject("");
                  }
                }}
                placeholder={t("classificationMappedProjectPlaceholder")}
                className="w-40 rounded-md border border-[#3F3F46] bg-[#18181B] px-2.5 py-1.5 text-sm text-[#D4D4D8] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
              />
              <button
                type="button"
                onClick={addMappedDomain}
                className="rounded-md bg-[#F97316] px-2.5 py-1.5 text-sm font-medium text-white hover:bg-[#EA580C]"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMappedDomainInput(false);
                  setNewMappedDomain("");
                  setNewMappedProject("");
                }}
                className="rounded-md border border-[#27272A] px-2.5 py-1.5 text-sm text-[#71717A] hover:bg-[#27272A]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowMappedDomainInput(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[#27272A] px-3 py-2.5 text-sm text-[#71717A] transition-colors hover:border-[#27272A] hover:bg-[#27272A] hover:text-[#FAFAFA]"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("classificationAddMapping")}
            </button>
          )}
        </div>
      </div>

    </div>
  );
}
