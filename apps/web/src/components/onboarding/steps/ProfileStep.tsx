"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Users, Building2 } from "lucide-react";

export interface ProfileData {
  firstName: string;
  lastName: string;
  jobTitle: string;
  companySize: string;
  projectTypes: string[];
  orgName: string;
}

interface ProfileStepProps {
  profile: ProfileData;
  onContinue: (data: ProfileData) => void;
}

const SIZE_OPTIONS = ["xs", "sm", "md", "lg", "xl"] as const;
const JOB_OPTIONS = [
  "projectManager",
  "technicalDirector",
  "siteManager",
  "engineer",
  "architect",
  "other",
] as const;
const PROJECT_TYPES = [
  "residential",
  "commercial",
  "infrastructure",
  "renovation",
  "industrial",
] as const;

export function ProfileStep({ profile, onContinue }: ProfileStepProps) {
  const t = useTranslations("onboarding.profile");
  const tProgress = useTranslations("onboarding.progress");

  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [jobTitle, setJobTitle] = useState(profile.jobTitle);
  const [companySize, setCompanySize] = useState(profile.companySize);
  const [projectTypes, setProjectTypes] = useState<string[]>(profile.projectTypes);
  const [orgName] = useState(profile.orgName);

  const toggleProjectType = (type: string) => {
    setProjectTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSubmit = () => {
    onContinue({
      firstName,
      lastName,
      jobTitle,
      companySize,
      projectTypes,
      orgName,
    });
  };

  const inputClass =
    "w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#52525B] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316] transition-colors";

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Form */}
      <motion.div
        className="space-y-6"
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

        {/* Name fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
              {t("firstName")}
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
              {t("lastName")}
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Job title */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
            {t("jobTitle")}
          </label>
          <select
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            className={inputClass}
          >
            <option value="">—</option>
            {JOB_OPTIONS.map((job) => (
              <option key={job} value={job}>
                {t(`jobs.${job}`)}
              </option>
            ))}
          </select>
        </div>

        {/* Team size */}
        <div>
          <label className="mb-2 block text-xs font-medium text-[#A1A1AA]">
            {t("teamSize")}
          </label>
          <div className="flex flex-wrap gap-2">
            {SIZE_OPTIONS.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setCompanySize(size)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                  companySize === size
                    ? "border-[#F97316] bg-[#F97316]/10 text-[#F97316]"
                    : "border-[#27272A] bg-[#0F0F11] text-[#A1A1AA] hover:border-[#3F3F46]"
                }`}
              >
                {t(`sizes.${size}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Project types */}
        <div>
          <label className="mb-2 block text-xs font-medium text-[#A1A1AA]">
            {t("projectTypes")}
          </label>
          <div className="flex flex-wrap gap-2">
            {PROJECT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleProjectType(type)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                  projectTypes.includes(type)
                    ? "bg-[#F97316] text-white"
                    : "bg-[#27272A] text-[#A1A1AA] hover:bg-[#3F3F46]"
                }`}
              >
                {t(`types.${type}`)}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          className="w-full rounded-xl bg-gradient-to-r from-[#F97316] to-[#EA580C] px-8 py-3 font-medium text-white transition-shadow hover:shadow-lg hover:shadow-[#F97316]/25"
        >
          {tProgress("continue")}
        </button>
      </motion.div>

      {/* Live preview (desktop only) */}
      <motion.div
        className="hidden lg:block"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F97316]/10">
              <Building2 className="h-5 w-5 text-[#F97316]" />
            </div>
            <div>
              <p className="font-display font-semibold text-[#FAFAFA]">
                {orgName || "Mon entreprise"}
              </p>
              <p className="text-xs text-[#71717A]">
                {jobTitle ? t(`jobs.${jobTitle as typeof JOB_OPTIONS[number]}`) : "—"}
              </p>
            </div>
          </div>

          <div className="space-y-3 border-t border-[#27272A] pt-4">
            <div className="flex items-center gap-2 text-sm text-[#A1A1AA]">
              <Users className="h-4 w-4 text-[#71717A]" />
              <span>
                {companySize
                  ? t(`sizes.${companySize as typeof SIZE_OPTIONS[number]}`)
                  : "—"}{" "}
                {t("teamSize").toLowerCase()}
              </span>
            </div>
            {projectTypes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {projectTypes.map((type) => (
                  <span
                    key={type}
                    className="rounded-full bg-[#F97316]/10 px-2.5 py-0.5 text-xs font-medium text-[#F97316]"
                  >
                    {t(`types.${type as typeof PROJECT_TYPES[number]}`)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
