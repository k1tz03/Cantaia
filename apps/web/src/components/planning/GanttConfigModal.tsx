"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Calendar,
  Building2,
  MapPin,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";
import type { ProjectType } from "./planning-types";
import { SWISS_CANTONS } from "./planning-types";

interface GanttConfigModalProps {
  onGenerate: (config: PlanningConfig) => void;
  onCancel: () => void;
  isGenerating?: boolean;
}

export interface PlanningConfig {
  startDate: string;
  endDate?: string;
  projectType: ProjectType;
  canton: string;
  constraints?: string;
}

const PROJECT_TYPES: { value: ProjectType; labelKey: string; icon: string }[] =
  [
    { value: "neuf", labelKey: "config.typeNeuf", icon: "🏗️" },
    { value: "renovation", labelKey: "config.typeRenovation", icon: "🔧" },
    { value: "extension", labelKey: "config.typeExtension", icon: "📐" },
    {
      value: "amenagement",
      labelKey: "config.typeAmenagement",
      icon: "🏠",
    },
  ];

export default function GanttConfigModal({
  onGenerate,
  onCancel,
  isGenerating,
}: GanttConfigModalProps) {
  const t = useTranslations("planning");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("neuf");
  const [canton, setCanton] = useState("VD");
  const [constraints, setConstraints] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!startDate) {
      setError(t("config.errorStartDate"));
      return;
    }

    onGenerate({
      startDate,
      endDate: endDate || undefined,
      projectType,
      canton,
      constraints: constraints.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">
              {t("config.title")}
            </h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1 text-muted-foreground hover:text-muted-foreground transition-colors rounded-md hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Start date */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t("config.startDate")}{" "}
              <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          </div>

          {/* End date (optional) */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t("config.endDate")}
              <span className="ml-1 text-xs text-muted-foreground font-normal">
                ({t("config.optional")})
              </span>
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || undefined}
                className="w-full pl-10 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Project type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              <Building2 className="inline h-4 w-4 mr-1 text-muted-foreground" />
              {t("config.projectType")}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PROJECT_TYPES.map((pt) => (
                <button
                  key={pt.value}
                  type="button"
                  onClick={() => setProjectType(pt.value)}
                  className={[
                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left",
                    projectType === pt.value
                      ? "border-blue-500 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-border hover:bg-muted",
                  ].join(" ")}
                >
                  <span>{pt.icon}</span>
                  <span>{t(pt.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Canton */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              <MapPin className="inline h-4 w-4 mr-1 text-muted-foreground" />
              {t("config.canton")}
            </label>
            <select
              value={canton}
              onChange={(e) => setCanton(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-background"
            >
              {SWISS_CANTONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Constraints */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t("config.constraints")}
              <span className="ml-1 text-xs text-muted-foreground font-normal">
                ({t("config.optional")})
              </span>
            </label>
            <textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              rows={3}
              placeholder={t("config.constraintsPlaceholder")}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              disabled={isGenerating}
            >
              {t("config.cancel")}
            </button>
            <button
              type="submit"
              disabled={isGenerating}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("config.generating")}
                </>
              ) : (
                t("config.generate")
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
