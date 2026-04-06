"use client";

import { useState, useEffect } from "react";
import { Settings, Loader2, CheckCircle, AlertCircle, Server, Key, Shield, Check, X, Minus } from "lucide-react";
import { PLAN_FEATURES } from "@cantaia/config/plan-features";
import type { PlanName } from "@cantaia/config/plan-features";

interface PlatformConfig {
  supabaseUrl: string;
  hasAnthropicKey: boolean;
  hasCronSecret: boolean;
  hasStripeKey: boolean;
  nodeEnv: string;
  vercelEnv: string;
}

export default function SuperAdminConfigPage() {
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUrl, setShowUrl] = useState(false);

  useEffect(() => {
    fetch("/api/super-admin?action=platform-config")
      .then((r) => r.json())
      .then((d) => setConfig(d.config || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    );
  }

  const checks = [
    { label: "NEXT_PUBLIC_SUPABASE_URL", ok: !!config?.supabaseUrl, value: config?.supabaseUrl || "Non défini" },
    { label: "ANTHROPIC_API_KEY", ok: config?.hasAnthropicKey, value: config?.hasAnthropicKey ? "Configuré" : "Manquant" },
    { label: "CRON_SECRET", ok: config?.hasCronSecret, value: config?.hasCronSecret ? "Configuré" : "Manquant" },
    { label: "STRIPE_SECRET_KEY", ok: config?.hasStripeKey, value: config?.hasStripeKey ? "Configuré" : "Non configuré" },
    { label: "NODE_ENV", ok: true, value: config?.nodeEnv || "development" },
    { label: "VERCEL_ENV", ok: true, value: config?.vercelEnv || "local" },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-[#FAFAFA]">
          <Settings className="h-6 w-6 text-amber-500" />
          Configuration plateforme
        </h1>
        <p className="mt-1 text-sm text-[#A1A1AA]">
          Variables d'environnement et état du système
        </p>
      </div>

      {/* Environment checks */}
      <div className="rounded-lg border border-[#27272A] bg-[#18181B]">
        <div className="border-b border-[#27272A] px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#FAFAFA]">
            <Key className="h-4 w-4 text-[#71717A]" />
            Variables d'environnement
          </h2>
        </div>
        <div className="divide-y divide-[#27272A]">
          {checks.map((check) => (
            <div key={check.label} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-2">
                {check.ok ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm font-mono text-[#A1A1AA]">{check.label}</span>
              </div>
              <span className={`text-xs ${check.ok ? "text-green-600" : "text-red-600"}`}>
                {check.label === "NEXT_PUBLIC_SUPABASE_URL" && check.ok ? (
                  <span className="flex items-center gap-2">
                    {showUrl ? check.value : check.value.replace(/\/\/([^.]+)/, "//•••••")}
                    <button
                      type="button"
                      onClick={() => setShowUrl(!showUrl)}
                      className="text-[10px] text-blue-500 hover:text-blue-700 underline"
                    >
                      {showUrl ? "Masquer" : "Afficher"}
                    </button>
                  </span>
                ) : (
                  check.value
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* System info */}
      <div className="mt-6 rounded-lg border border-[#27272A] bg-[#18181B]">
        <div className="border-b border-[#27272A] px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#FAFAFA]">
            <Server className="h-4 w-4 text-[#71717A]" />
            Informations système
          </h2>
        </div>
        <div className="divide-y divide-[#27272A]">
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-[#A1A1AA]">Framework</span>
            <span className="text-xs text-[#71717A]">Next.js 15</span>
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-[#A1A1AA]">Base de données</span>
            <span className="text-xs text-[#71717A]">Supabase (PostgreSQL)</span>
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-[#A1A1AA]">IA</span>
            <span className="text-xs text-[#71717A]">Anthropic Claude</span>
          </div>
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-sm text-[#A1A1AA]">Paiements</span>
            <span className="text-xs text-[#71717A]">{config?.hasStripeKey ? "Stripe (actif)" : "Stripe (non configuré)"}</span>
          </div>
        </div>
      </div>

      {/* Plan limits */}
      <div className="mt-6 rounded-lg border border-[#27272A] bg-[#18181B]">
        <div className="border-b border-[#27272A] px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#FAFAFA]">
            <Shield className="h-4 w-4 text-[#71717A]" />
            Limites par plan
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#1C1C1F] text-left text-xs font-medium text-[#A1A1AA]">
              <tr>
                <th className="px-4 py-2.5">Plan</th>
                <th className="px-4 py-2.5 text-right">Appels IA</th>
                <th className="px-4 py-2.5 text-right">Max Utilisateurs</th>
                <th className="px-4 py-2.5 text-right">Max Projets</th>
                <th className="px-4 py-2.5 text-center">Budget IA</th>
                <th className="px-4 py-2.5 text-center">Planning</th>
                <th className="px-4 py-2.5 text-center">Data Intel</th>
                <th className="px-4 py-2.5 text-center">Branding</th>
                <th className="px-4 py-2.5 text-center">Export</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#27272A]">
              {(["trial", "starter", "pro", "enterprise"] as PlanName[]).map((planName) => {
                const limits = PLAN_FEATURES[planName];
                const formatLimit = (v: number) => v === Infinity ? "Illimité" : String(v);
                const boolIcon = (v: boolean | string) => {
                  if (v === false) return <X className="mx-auto h-3.5 w-3.5 text-[#52525B]" />;
                  if (v === true || typeof v === "string") return <Check className="mx-auto h-3.5 w-3.5 text-green-500" />;
                  return <Minus className="mx-auto h-3.5 w-3.5 text-[#52525B]" />;
                };
                const planningLabel = (v: false | "basic" | "full") => {
                  if (v === false) return <X className="mx-auto h-3.5 w-3.5 text-[#52525B]" />;
                  return (
                    <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      v === "full" ? "bg-green-900/30 text-green-400" : "bg-blue-900/30 text-blue-400"
                    }`}>
                      {v === "full" ? "Complet" : "Basique"}
                    </span>
                  );
                };

                return (
                  <tr key={planName} className="hover:bg-[#27272A]">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-[#FAFAFA]">
                        {planName.charAt(0).toUpperCase() + planName.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#A1A1AA]">
                      {formatLimit(limits.aiCalls)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#A1A1AA]">
                      {formatLimit(limits.maxUsers)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#A1A1AA]">
                      {formatLimit(limits.maxProjects)}
                    </td>
                    <td className="px-4 py-2.5 text-center">{boolIcon(limits.budgetAI)}</td>
                    <td className="px-4 py-2.5 text-center">{planningLabel(limits.planning)}</td>
                    <td className="px-4 py-2.5 text-center">{boolIcon(limits.dataIntel)}</td>
                    <td className="px-4 py-2.5 text-center">{boolIcon(limits.branding)}</td>
                    <td className="px-4 py-2.5 text-center">{boolIcon(limits.export)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
