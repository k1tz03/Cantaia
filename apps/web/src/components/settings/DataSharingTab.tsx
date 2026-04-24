"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Loader2,
  CheckCircle,
  AlertCircle,
  BarChart3,
  Users,
  FileText,
  MessageSquare,
  Mail,
  ListChecks,
  ClipboardList,
  Briefcase,
  Zap,
  Lock,
  Eye,
} from "lucide-react";

interface ConsentModule {
  module: string;
  label: string;
  description: string;
  benefitOptIn: string;
  benefitOptOut: string;
  icon: React.ComponentType<any>;
}

const CONSENT_MODULES: ConsentModule[] = [
  {
    module: "prix",
    label: "Prix & Soumissions",
    description:
      "Vos prix sont anonymisés et agrégés avec 3+ autres entreprises",
    benefitOptIn:
      "Benchmarks marché, tendances prix, alertes anomalies, estimation ajustée",
    benefitOptOut: "Uniquement votre historique interne de prix",
    icon: BarChart3,
  },
  {
    module: "fournisseurs",
    label: "Fournisseurs",
    description: "Scores et délais de réponse anonymisés",
    benefitOptIn:
      "Ranking marché, scores agrégés cross-entreprises, indicateurs de fiabilité",
    benefitOptOut: "Uniquement votre scoring interne",
    icon: Users,
  },
  {
    module: "plans",
    label: "Plans",
    description: "Métriques de précision d'extraction (pas le contenu)",
    benefitOptIn:
      "Ratios quantitatifs de référence, vérification cohérence automatique",
    benefitOptOut: "Pas de vérification de cohérence multi-source",
    icon: FileText,
  },
  {
    module: "pv",
    label: "PV / Réunions",
    description:
      "Métriques qualité uniquement (nb décisions, taux correction) — jamais le contenu",
    benefitOptIn:
      "Structure PV optimisée par le marché, benchmarks qualité",
    benefitOptOut: "Structure PV générique",
    icon: ClipboardList,
  },
  {
    module: "visites",
    label: "Visites client",
    description: "Taux de conversion et délais commerciaux anonymisés",
    benefitOptIn: "Benchmarks commerciaux par type de travaux",
    benefitOptOut: "Pas de comparaison commerciale",
    icon: Briefcase,
  },
  {
    module: "chat",
    label: "Chat JM",
    description: "Thématiques des questions uniquement (jamais le contenu)",
    benefitOptIn: "Questions suggérées enrichies, réponses optimisées",
    benefitOptOut: "Pool de questions standard",
    icon: MessageSquare,
  },
  {
    module: "mail",
    label: "Mail",
    description: "Taux de classification et correction (pas le contenu email)",
    benefitOptIn: "Classification IA optimisée par les retours collectifs",
    benefitOptOut: "Classification standard",
    icon: Mail,
  },
  {
    module: "taches",
    label: "Tâches",
    description: "Temps de complétion et taux de retard anonymisés",
    benefitOptIn: "Suggestions d'échéances réalistes, benchmarks productivité",
    benefitOptOut: "Échéances génériques",
    icon: ListChecks,
  },
  {
    module: "briefing",
    label: "Briefing",
    description: "Taux d'utilisation et types d'alertes actionnées",
    benefitOptIn: "Format de briefing optimisé pour l'engagement",
    benefitOptOut: "Format standard",
    icon: Zap,
  },
];

export function DataSharingTab() {
  const [consents, setConsents] = useState<
    Record<string, { opted_in: boolean; updated_at: string | null }>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    loadConsents();
  }, []);

  async function loadConsents() {
    try {
      const res = await fetch("/api/settings/consent");
      if (res.ok) {
        const data = await res.json();
        setConsents(data.consents || {});
      }
    } catch {
      // Table may not exist yet
    } finally {
      setLoading(false);
    }
  }

  const toggleModule = useCallback(
    async (module: string, newValue: boolean) => {
      setSaving(module);
      setMessage(null);
      try {
        const res = await fetch("/api/settings/consent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modules: { [module]: newValue } }),
        });
        if (res.ok) {
          setConsents((prev) => ({
            ...prev,
            [module]: {
              opted_in: newValue,
              updated_at: new Date().toISOString(),
            },
          }));
          setMessage({
            type: "success",
            text: newValue
              ? "Contribution activée"
              : "Contribution désactivée",
          });
        } else {
          setMessage({ type: "error", text: "Erreur lors de la sauvegarde" });
        }
      } catch {
        setMessage({ type: "error", text: "Erreur réseau" });
      } finally {
        setSaving(null);
        setTimeout(() => setMessage(null), 3000);
      }
    },
    []
  );

  const toggleAll = useCallback(
    async (value: boolean) => {
      setSaving("all");
      setMessage(null);
      try {
        const modules: Record<string, boolean> = {};
        for (const m of CONSENT_MODULES) {
          modules[m.module] = value;
        }
        const res = await fetch("/api/settings/consent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modules }),
        });
        if (res.ok) {
          const updated: typeof consents = {};
          for (const m of CONSENT_MODULES) {
            updated[m.module] = {
              opted_in: value,
              updated_at: new Date().toISOString(),
            };
          }
          setConsents(updated);
          setMessage({
            type: "success",
            text: value
              ? "Toutes les contributions activées"
              : "Toutes les contributions désactivées",
          });
        }
      } catch {
        setMessage({ type: "error", text: "Erreur réseau" });
      } finally {
        setSaving(null);
        setTimeout(() => setMessage(null), 3000);
      }
    },
    []
  );

  const activeCount = Object.values(consents).filter(
    (c) => c.opted_in
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#71717A]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Introduction */}
      <div className="rounded-[10px] border border-[#F9731630] bg-[#F9731610] p-5">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 text-[#F97316]" />
          <div>
            <h3 className="font-display text-[14px] font-bold text-[#F97316]">
              Partage de données anonymisées
            </h3>
            <p className="mt-1 text-[12px] text-[#F97316]">
              Activez le partage par module pour accéder aux benchmarks du marché.
              Vos données sont anonymisées et agrégées — aucune donnée brute n'est partagée.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#F97316]">
              <span className="flex items-center gap-1">
                <Lock className="h-3.5 w-3.5" />
                Min. 3 contributeurs requis
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                Aucune donnée brute exposée
              </span>
              <span className="flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" />
                Consentement révocable à tout moment
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Toggle all + status message */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-[#71717A]">
          <span className="font-medium text-[#FAFAFA]">{activeCount}</span> /{" "}
          {CONSENT_MODULES.length} modules actifs
        </div>
        <div className="flex items-center gap-2">
          {message && (
            <span
              className={`text-xs ${message.type === "success" ? "text-[#34D399]" : "text-red-400"}`}
            >
              {message.type === "success" ? (
                <CheckCircle className="mr-1 inline h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
              )}
              {message.text}
            </span>
          )}
          <button
            type="button"
            onClick={() => toggleAll(activeCount < CONSENT_MODULES.length)}
            disabled={saving !== null}
            className="rounded-md border border-[#3F3F46] bg-[#27272A] px-3 py-1.5 text-xs font-medium text-[#FAFAFA] hover:bg-[#1C1C1F] disabled:opacity-50"
          >
            {saving === "all" ? (
              <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
            ) : null}
            {activeCount < CONSENT_MODULES.length
              ? "Tout activer"
              : "Tout désactiver"}
          </button>
        </div>
      </div>

      {/* Module cards */}
      <div className="space-y-3">
        {CONSENT_MODULES.map((mod) => {
          const consent = consents[mod.module];
          const isActive = consent?.opted_in || false;
          const isSaving = saving === mod.module;
          const Icon = mod.icon;

          return (
            <div
              key={mod.module}
              className={`rounded-[10px] border p-4 transition-colors ${
                isActive
                  ? "border-[#34D39930] bg-[#34D39910]"
                  : "border-[#27272A] bg-[#18181B]"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Icon
                    className={`mt-0.5 h-5 w-5 ${isActive ? "text-[#34D399]" : "text-[#71717A]"}`}
                  />
                  <div>
                    <h4 className="text-sm font-medium text-[#FAFAFA]">
                      {mod.label}
                    </h4>
                    <p className="mt-0.5 text-xs text-[#71717A]">
                      {mod.description}
                    </p>
                    <div className="mt-2 text-xs">
                      {isActive ? (
                        <span className="text-[#34D399]">
                          <CheckCircle className="mr-1 inline h-3 w-3" />
                          {mod.benefitOptIn}
                        </span>
                      ) : (
                        <span className="text-[#71717A]">
                          {mod.benefitOptOut}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleModule(mod.module, !isActive)}
                  disabled={saving !== null}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    isActive ? "bg-[#34D399]" : "bg-[#3F3F46]"
                  } ${saving !== null ? "opacity-50" : ""}`}
                >
                  {isSaving ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0F0F11] shadow">
                      <Loader2 className="h-3 w-3 animate-spin text-[#71717A]" />
                    </span>
                  ) : (
                    <span
                      className={`inline-block h-5 w-5 rounded-full bg-[#0F0F11] shadow transition-transform ${
                        isActive ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Privacy footer */}
      <div className="rounded-[10px] border border-[#27272A] bg-[#18181B] p-4">
        <p className="text-xs text-[#71717A]">
          <strong>Protection des données :</strong> Conforme au RGPD et à la LPD suisse.
          Vos données sont anonymisées avant tout traitement collectif.
          Aucune donnée personnelle ou d'entreprise n'est revendue ni transmise à des tiers.
          Le consentement est révocable à tout moment — retrait effectif au prochain cycle d'agrégation.
        </p>
      </div>
    </div>
  );
}
