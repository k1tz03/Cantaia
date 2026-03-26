"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  House,
  Building2,
  Construction,
  Wrench,
  Factory,
  Palette,
} from "lucide-react";

interface FirstProjectStepProps {
  onContinue: (project: {
    name: string;
    code: string;
    client: string;
    city: string;
    type: string;
    color: string;
  }) => void;
  onSkip: () => void;
}

const PROJECT_COLORS = [
  "#6366F1",
  "#F97316",
  "#10B981",
  "#3B82F6",
  "#EF4444",
  "#F59E0B",
  "#8B5CF6",
  "#EC4899",
];

const PROJECT_TYPES_CONFIG = [
  { key: "residential", icon: House },
  { key: "commercial", icon: Building2 },
  { key: "infrastructure", icon: Construction },
  { key: "renovation", icon: Wrench },
  { key: "industrial", icon: Factory },
] as const;

const PLACEHOLDER_KEYS = ["p1", "p2", "p3", "p4"] as const;

const CITY_KEYS = [
  "lausanne",
  "geneve",
  "zurich",
  "bern",
  "basel",
  "lucerne",
  "sion",
  "fribourg",
  "neuchatel",
  "montreux",
  "nyon",
  "yverdon",
  "vevey",
  "morges",
  "renens",
  "prilly",
  "bienne",
  "thun",
  "winterthur",
  "stgallen",
] as const;

export function FirstProjectStep({ onContinue, onSkip }: FirstProjectStepProps) {
  const t = useTranslations("onboarding.project");
  const tTypes = useTranslations("onboarding.profile.types");
  const tProgress = useTranslations("onboarding.progress");

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [client, setClient] = useState("");
  const [city, setCity] = useState("");
  const [type, setType] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  // Rotate placeholder every 3s
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((prev) => (prev + 1) % PLACEHOLDER_KEYS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!name.trim()) return;
    onContinue({ name: name.trim(), code: code.trim(), client: client.trim(), city: city.trim(), type, color });
  }, [name, code, client, city, type, color, onContinue]);

  const inputClass =
    "w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#52525B] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316] transition-colors";

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Form */}
      <motion.div
        className="space-y-5"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div>
          <h2 className="font-display text-2xl font-bold text-[#FAFAFA]">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-[#A1A1AA]">{t("subtitle")}</p>
        </div>

        {/* Project name with rotating placeholder */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
            {t("projectName")} <span className="text-[#EF4444]">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
            {!name && (
              <div className="pointer-events-none absolute inset-0 flex items-center px-4">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={placeholderIdx}
                    className="text-sm text-[#52525B]"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3 }}
                  >
                    {t(`placeholders.${PLACEHOLDER_KEYS[placeholderIdx]}`)}
                  </motion.span>
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        {/* Internal reference */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
            {t("code")}
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t("codePlaceholder")}
            className={inputClass}
          />
        </div>

        {/* Client */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
            {t("clientName")}
          </label>
          <input
            type="text"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* City with datalist */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
            {t("city")}
          </label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            list="swiss-cities"
            className={inputClass}
          />
          <datalist id="swiss-cities">
            {CITY_KEYS.map((key) => (
              <option key={key} value={t(`cities.${key}`)} />
            ))}
          </datalist>
        </div>

        {/* Project type radio cards */}
        <div>
          <label className="mb-2 block text-xs font-medium text-[#A1A1AA]">
            {t("projectType")}
          </label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {PROJECT_TYPES_CONFIG.map(({ key, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setType(key)}
                className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all ${
                  type === key
                    ? "border-[#F97316] bg-[#F97316]/10 text-[#F97316]"
                    : "border-[#27272A] bg-[#0F0F11] text-[#71717A] hover:border-[#3F3F46]"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium leading-tight">
                  {tTypes(key)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div>
          <label className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[#A1A1AA]">
            <Palette className="h-3.5 w-3.5" />
            {t("color")}
          </label>
          <div className="flex gap-2">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full transition-all ${
                  color === c ? "ring-2 ring-[#F97316] ring-offset-2 ring-offset-[#0F0F11]" : ""
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="w-full rounded-xl bg-gradient-to-r from-[#F97316] to-[#EA580C] px-8 py-3 font-medium text-white transition-shadow hover:shadow-lg hover:shadow-[#F97316]/25 disabled:opacity-40"
        >
          {tProgress("continue")}
        </button>

        <button
          type="button"
          onClick={onSkip}
          className="w-full text-center text-sm text-[#52525B] transition-colors hover:text-[#A1A1AA]"
        >
          {t("skipNote")}
        </button>
      </motion.div>

      {/* Live preview (desktop) */}
      <motion.div
        className="hidden lg:block"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-6">
          <div className="mb-4 flex items-center gap-3">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <p className="font-display font-semibold text-[#FAFAFA]">
              {name || t(`placeholders.${PLACEHOLDER_KEYS[0]}`)}
            </p>
          </div>
          <div className="space-y-2 text-sm text-[#A1A1AA]">
            {client && <p>{client}</p>}
            {city && <p>{city}</p>}
            {type && (
              <span className="inline-block rounded-full bg-[#F97316]/10 px-2.5 py-0.5 text-xs font-medium text-[#F97316]">
                {tTypes(type as typeof PROJECT_TYPES_CONFIG[number]["key"])}
              </span>
            )}
          </div>
          {/* Mini mock stats */}
          <div className="mt-6 grid grid-cols-4 gap-2 border-t border-[#27272A] pt-4">
            {["0", "0", "0", "0"].map((val, i) => (
              <div key={i} className="text-center">
                <p className="text-lg font-bold text-[#FAFAFA]">{val}</p>
                <p className="text-[10px] text-[#71717A]">
                  {["Emails", "Plans", "Tasks", "PV"][i]}
                </p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
