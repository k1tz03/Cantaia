"use client";

import { useState, useEffect } from "react";
import { Link } from "@/i18n/navigation";
import { Mail, AlertTriangle, Users, Sparkles, ChevronRight, Bot } from "lucide-react";

interface AgentSummary {
  drafts: number;
  followups: number;
  alerts: number;
  followupsByUrgency: Record<string, number>;
  alertsByType: Record<string, number>;
}

export function AgentActivityCards() {
  const [data, setData] = useState<AgentSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/agents/drafts/counts").then((r) => r.json()).catch(() => ({ count: 0 })),
      fetch("/api/agents/followups/counts").then((r) => r.json()).catch(() => ({ total: 0, by_urgency: {}, by_type: {} })),
      fetch("/api/agents/supplier-alerts/counts").then((r) => r.json()).catch(() => ({ total: 0, by_type: {} })),
    ]).then(([drafts, followups, alerts]) => {
      setData({
        drafts: drafts.count || 0,
        followups: followups.total || 0,
        alerts: alerts.total || 0,
        followupsByUrgency: followups.by_urgency || {},
        alertsByType: alerts.by_type || {},
      });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mt-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 rounded bg-[#27272A] animate-pulse" />
          <div className="h-4 w-32 rounded bg-[#27272A] animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-[#27272A] bg-[#18181B] p-4 h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const totalActivity = data.drafts + data.followups + data.alerts;

  const cards = [
    {
      key: "drafts",
      icon: Mail,
      iconColor: "text-[#F97316]",
      iconBg: "bg-[#F97316]/10",
      borderColor: "border-l-[#F97316]",
      count: data.drafts,
      label: `Brouillon${data.drafts > 1 ? "s" : ""} de réponse`,
      sublabel: "Email Drafter",
      href: "/mail",
      visible: data.drafts > 0,
    },
    {
      key: "followups",
      icon: AlertTriangle,
      iconColor: "text-[#F59E0B]",
      iconBg: "bg-[#F59E0B]/10",
      borderColor: "border-l-[#F59E0B]",
      count: data.followups,
      label: `Relance${data.followups > 1 ? "s" : ""} en attente`,
      sublabel: "Followup Engine",
      href: "/briefing",
      visible: data.followups > 0,
      extra: data.followupsByUrgency.critical
        ? `${data.followupsByUrgency.critical} critique${(data.followupsByUrgency.critical || 0) > 1 ? "s" : ""}`
        : data.followupsByUrgency.high
          ? `${data.followupsByUrgency.high} haute priorite`
          : undefined,
    },
    {
      key: "alerts",
      icon: Users,
      iconColor: "text-[#3B82F6]",
      iconBg: "bg-[#3B82F6]/10",
      borderColor: "border-l-[#3B82F6]",
      count: data.alerts,
      label: `Alerte${data.alerts > 1 ? "s" : ""} fournisseur`,
      sublabel: "Supplier Monitor",
      href: "/suppliers",
      visible: data.alerts > 0,
      extra: data.alertsByType.critical
        ? `${data.alertsByType.critical} critique${(data.alertsByType.critical || 0) > 1 ? "s" : ""}`
        : undefined,
    },
  ].filter((c) => c.visible);

  return (
    <div className="mt-4">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center justify-center w-5 h-5 rounded-md bg-[#F97316]/10">
          <Bot className="h-3 w-3 text-[#F97316]" />
        </div>
        <h3 className="text-[13px] font-semibold text-[#FAFAFA]">
          Agents autonomes
        </h3>
        {totalActivity > 0 && (
          <span className="text-[11px] text-[#71717A] font-medium">
            {totalActivity} action{totalActivity > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Empty state */}
      {cards.length === 0 && (
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { icon: Mail, label: "Email Drafter", desc: "Brouillons de réponse", color: "#F97316", schedule: "chaque nuit à 23h" },
              { icon: AlertTriangle, label: "Followup Engine", desc: "Relances automatiques", color: "#F59E0B", schedule: "chaque matin à 6h" },
              { icon: Users, label: "Supplier Monitor", desc: "Alertes fournisseurs", color: "#3B82F6", schedule: "chaque dimanche à 22h" },
            ].map((agent) => (
              <div key={agent.label} className="flex items-start gap-3 p-3 rounded-lg bg-[#0F0F11]/50">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0`} style={{ backgroundColor: `${agent.color}15` }}>
                  <agent.icon className="h-4 w-4" style={{ color: agent.color }} />
                </div>
                <div>
                  <p className="text-[12px] font-medium text-[#A1A1AA]">{agent.desc}</p>
                  <p className="text-[10px] text-[#52525B] mt-0.5">{agent.label} — {agent.schedule}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[#3F3F46] text-center mt-4">
            Les agents autonomes analysent vos données et génèrent des actions. Les résultats apparaîtront ici après leur prochaine exécution.
          </p>
        </div>
      )}

      {/* Cards grid */}
      {cards.length > 0 && (
      <div className={`grid gap-3 ${cards.length === 1 ? "grid-cols-1" : cards.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3"}`}>
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.key}
              href={card.href}
              className={`group relative overflow-hidden rounded-xl border border-[#27272A] ${card.borderColor} border-l-[3px] bg-[#18181B] p-4 transition-all duration-150 hover:border-[#3F3F46] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.3)]`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${card.iconBg}`}>
                    <Icon className={`h-4 w-4 ${card.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-[22px] font-bold text-[#FAFAFA] leading-none">{card.count}</p>
                    <p className="text-[12px] text-[#A1A1AA] mt-0.5">{card.label}</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-[#3F3F46] group-hover:text-[#71717A] transition-colors mt-1" />
              </div>

              {/* Sublabel + extra */}
              <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-[#27272A]/60">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-[#52525B]" />
                  <span className="text-[10px] text-[#52525B] font-medium">{card.sublabel}</span>
                </div>
                {card.extra && (
                  <span className="text-[10px] font-medium text-[#EF4444] bg-[#EF4444]/10 px-1.5 py-0.5 rounded">
                    {card.extra}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
      )}
    </div>
  );
}
