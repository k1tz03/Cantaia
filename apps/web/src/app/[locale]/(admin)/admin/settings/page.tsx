"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Settings, Save, RotateCcw } from "lucide-react";

interface ConfigSection {
  key: string;
  titleKey: string;
  fields: ConfigField[];
}

interface ConfigField {
  key: string;
  label: string;
  type: "number" | "text";
  unit?: string;
  value: string;
}

const DEFAULT_CONFIG: ConfigSection[] = [
  {
    key: "api_pricing",
    titleKey: "configAPIPricing",
    fields: [
      { key: "anthropic_input_1k", label: "Anthropic — input / 1K tokens", type: "number", unit: "USD", value: "0.003" },
      { key: "anthropic_output_1k", label: "Anthropic — output / 1K tokens", type: "number", unit: "USD", value: "0.015" },
      { key: "whisper_per_min", label: "OpenAI Whisper / minute", type: "number", unit: "USD", value: "0.006" },
      { key: "usd_to_chf", label: "Taux USD → CHF", type: "number", value: "0.89" },
    ],
  },
  {
    key: "plan_pricing",
    titleKey: "configPlanPricing",
    fields: [
      { key: "trial_price", label: "Trial", type: "number", unit: "CHF/mois", value: "0" },
      { key: "trial_days", label: "Durée trial", type: "number", unit: "jours", value: "14" },
      { key: "starter_price", label: "Starter", type: "number", unit: "CHF/mois", value: "149" },
      { key: "starter_max_users", label: "Starter — max users", type: "number", value: "5" },
      { key: "pro_price", label: "Pro", type: "number", unit: "CHF/mois", value: "349" },
      { key: "pro_max_users", label: "Pro — max users", type: "number", value: "15" },
      { key: "enterprise_price", label: "Enterprise", type: "number", unit: "CHF/mois", value: "990" },
      { key: "enterprise_max_users", label: "Enterprise — max users", type: "number", value: "999" },
    ],
  },
  {
    key: "alert_thresholds",
    titleKey: "configAlertThresholds",
    fields: [
      { key: "margin_warning_pct", label: "Seuil marge basse", type: "number", unit: "%", value: "80" },
      { key: "inactive_days_warning", label: "Inactivité warning", type: "number", unit: "jours", value: "7" },
      { key: "trial_expiry_alert_days", label: "Alerte trial expiry", type: "number", unit: "jours avant", value: "3" },
      { key: "api_error_threshold", label: "Seuil erreurs API / heure", type: "number", value: "10" },
      { key: "monthly_cost_danger", label: "Coût mensuel danger", type: "number", unit: "CHF", value: "50" },
      { key: "monthly_cost_warning", label: "Coût mensuel warning", type: "number", unit: "CHF", value: "20" },
    ],
  },
];

export default function AdminSettingsPage() {
  const t = useTranslations("admin");
  const [config, setConfig] = useState<ConfigSection[]>(
    JSON.parse(JSON.stringify(DEFAULT_CONFIG))
  );
  const [saved, setSaved] = useState(false);

  function handleChange(sectionIdx: number, fieldIdx: number, value: string) {
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      next[sectionIdx].fields[fieldIdx].value = value;
      return next;
    });
    setSaved(false);
  }

  function handleSave() {
    // In production, POST to /api/admin/config
    console.log("[admin/settings] Saving config:", config);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function handleReset() {
    setConfig(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
    setSaved(false);
  }

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-gray-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              {t("configTitle")}
            </h1>
            <p className="text-sm text-gray-500">
              Paramètres globaux de la plateforme
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <button
            onClick={handleSave}
            className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium text-white transition-colors ${
              saved
                ? "bg-green-500"
                : "bg-gray-800 hover:bg-gray-700"
            }`}
          >
            <Save className="h-3.5 w-3.5" />
            {saved ? "Sauvegardé" : t("configUpdate")}
          </button>
        </div>
      </div>

      {/* Config sections */}
      <div className="space-y-6">
        {config.map((section, sIdx) => (
          <div
            key={section.key}
            className="rounded-lg border border-gray-200 bg-white p-5"
          >
            <h2 className="mb-4 text-sm font-semibold text-gray-800">
              {t(section.titleKey as any)}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {section.fields.map((field, fIdx) => (
                <div key={field.key}>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {field.label}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type={field.type}
                      value={field.value}
                      onChange={(e) =>
                        handleChange(sIdx, fIdx, e.target.value)
                      }
                      step={field.type === "number" ? "any" : undefined}
                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-gray-300"
                    />
                    {field.unit && (
                      <span className="shrink-0 text-xs text-gray-400">
                        {field.unit}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
