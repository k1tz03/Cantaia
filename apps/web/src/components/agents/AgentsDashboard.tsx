"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bot,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Moon,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Lock,
} from "lucide-react";
import { useAgent } from "@/lib/hooks/use-agent";
import type { AgentType } from "@cantaia/core/agents";

// i18n-pending: every visible string of this file is listed under
// `agentsPage.*` in i18n-pending/H.json for the i18n agent to merge into
// apps/web/messages/{fr,en,de}.json. French is inlined meanwhile.

// ── Types ──────────────────────────────────────────────────

interface AgentSession {
  id: string;
  agent_type: string;
  title: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  tool_calls_count: number;
  custom_tool_calls_count: number;
  tools_used: string[] | null;
  result_payload: Record<string, any> | null;
  error_message: string | null;
  user_name: string | null;
  trigger: string;
}

interface AgentCard {
  type: AgentType;
  name: string;
  description: string;
  model: string;
  interactive: boolean;
  nightly: boolean;
  last_session: AgentSession | null;
  recent_runs: number;
}

interface NightlyState {
  plan_allows: boolean;
  org_enabled: boolean;
  effective: boolean;
  plan: string;
  can_toggle: boolean;
}

// ── Helpers ────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; Icon: any }> = {
  completed: { label: "Terminé", color: "#10B981", Icon: CheckCircle2 },
  idle: { label: "Terminé", color: "#10B981", Icon: CheckCircle2 },
  failed: { label: "Échec", color: "#EF4444", Icon: XCircle },
  cancelled: { label: "Annulé", color: "#71717A", Icon: XCircle },
  running: { label: "En cours", color: "#F97316", Icon: Loader2 },
  tool_pending: { label: "En cours", color: "#F97316", Icon: Loader2 },
  pending: { label: "En attente", color: "#A1A1AA", Icon: Clock },
};

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${seconds % 60} s`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "jamais";
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff)) return "jamais";
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  return new Date(iso).toLocaleDateString("fr-CH");
}

/**
 * One-line outcome of a run. `result_payload` is written by the cron routes
 * (counts) and by the stream route (final assistant message).
 */
function summarizeResult(session: AgentSession): string | null {
  const payload = session.result_payload;
  if (!payload) return null;

  if (typeof payload.projects_updated === "number") {
    return `${payload.projects_updated} projet(s) mis à jour`;
  }
  if (typeof payload.preps_generated === "number") {
    return `${payload.preps_generated} préparation(s) sur ${payload.meetings_queued ?? "?"} réunion(s)`;
  }
  if (typeof payload.summary === "string" && payload.summary.trim()) {
    return payload.summary.trim().slice(0, 220);
  }
  if (typeof payload.succeeded_tools === "number") {
    return `${payload.succeeded_tools} action(s) réussie(s), ${payload.failed_tools ?? 0} en échec`;
  }
  return null;
}

/** Initial message for the agents that can be relaunched with one click. */
const RELAUNCH_MESSAGES: Partial<Record<AgentType, string>> = {
  "briefing-generator":
    "Génère mon briefing du jour à partir des données Cantaia (emails, tâches, réunions, deadlines).",
  "email-classifier":
    "Classe les emails en attente de classification pour mon organisation.",
};

// ── Component ──────────────────────────────────────────────

export function AgentsDashboard() {
  const router = useRouter();
  const [agents, setAgents] = useState<AgentCard[]>([]);
  const [nightly, setNightly] = useState<NightlyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingToggle, setSavingToggle] = useState(false);
  const [runningType, setRunningType] = useState<AgentType | null>(null);

  const briefingAgent = useAgent("briefing-generator");
  const classifierAgent = useAgent("email-classifier");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/sessions");
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setAgents(data.agents || []);
      setNightly(data.nightly || null);
    } catch (err) {
      console.error("[AgentsDashboard] fetch failed", err);
      toast.error("Impossible de charger les agents");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Nightly toggle ──────────────────────────────────────

  const toggleNightly = useCallback(async () => {
    if (!nightly || !nightly.can_toggle) return;
    const next = !nightly.org_enabled;
    setSavingToggle(true);
    // Optimistic — reverted below if the server refuses.
    setNightly({ ...nightly, org_enabled: next, effective: next && nightly.plan_allows });
    try {
      const res = await fetch("/api/agents/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nightly_agents: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Échec de la sauvegarde");
      }
      const data = await res.json();
      setNightly((prev) => (prev ? { ...prev, ...data.nightly } : prev));
      toast.success(next ? "Agents nocturnes activés" : "Agents nocturnes désactivés");
    } catch (err: any) {
      setNightly((prev) =>
        prev
          ? { ...prev, org_enabled: !next, effective: !next && prev.plan_allows }
          : prev
      );
      toast.error(err.message || "Échec de la sauvegarde");
    } finally {
      setSavingToggle(false);
    }
  }, [nightly]);

  // ── Relaunch an interactive agent ───────────────────────

  const relaunch = useCallback(
    async (type: AgentType) => {
      const message = RELAUNCH_MESSAGES[type];
      if (!message) return;

      const hook = type === "briefing-generator" ? briefingAgent : classifierAgent;
      setRunningType(type);
      try {
        // The hook handles the 402 paywall and credit refresh itself.
        await hook.start({ trigger: "manual" }, message);
        await fetchData();
      } finally {
        setRunningType(null);
      }
    },
    [briefingAgent, classifierAgent, fetchData]
  );

  // ── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" />
      </div>
    );
  }

  const nightlyAgents = agents.filter((a) => a.nightly);
  const onDemandAgents = agents.filter((a) => !a.nightly);

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F97316]/10">
            <Bot className="h-5 w-5 text-[#F97316]" />
          </div>
          <div>
            <h1 className="font-display text-[18px] font-semibold text-[#FAFAFA]">
              Agents IA
            </h1>
            <p className="mt-0.5 text-[13px] text-[#A1A1AA]">
              Dernière exécution, résultat et relance des agents de votre organisation.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            fetchData();
          }}
          className="flex items-center gap-1.5 rounded-md border border-[#27272A] bg-[#18181B] px-3 py-1.5 text-[13px] font-medium text-[#A1A1AA] transition-colors hover:border-[#3F3F46] hover:text-[#FAFAFA]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualiser
        </button>
      </div>

      {/* ── Nightly toggle ─────────────────────────────── */}
      {nightly && (
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#3B82F6]/10">
                <Moon className="h-4 w-4 text-[#3B82F6]" />
              </div>
              <div>
                <h2 className="text-[14px] font-semibold text-[#FAFAFA]">
                  Agents nocturnes
                </h2>
                <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-[#A1A1AA]">
                  Brouillons d&apos;emails, relances, veille fournisseurs, mémoire projet et
                  préparation de réunions s&apos;exécutent chaque nuit sans intervention.
                  Ils consomment des crédits à chaque passage.
                </p>
                {!nightly.plan_allows && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#F59E0B]/10 px-2 py-1 text-[11px] font-medium text-[#F59E0B]">
                    <Lock className="h-3 w-3" />
                    Inclus à partir du plan Pro (plan actuel : {nightly.plan})
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={toggleNightly}
              disabled={!nightly.can_toggle || savingToggle || !nightly.plan_allows}
              title={
                !nightly.plan_allows
                  ? "Non inclus dans votre plan"
                  : !nightly.can_toggle
                    ? "Réservé aux administrateurs"
                    : undefined
              }
              className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                nightly.effective ? "bg-[#F97316]" : "bg-[#27272A]"
              }`}
              aria-pressed={nightly.effective}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  nightly.effective ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* ── On-demand agents ───────────────────────────── */}
      <Section
        title="Agents à la demande"
        icon={<Sparkles className="h-3.5 w-3.5 text-[#F97316]" />}
      >
        {onDemandAgents.map((agent) => (
          <AgentRow
            key={agent.type}
            agent={agent}
            running={runningType === agent.type}
            onRelaunch={agent.interactive ? () => relaunch(agent.type) : undefined}
          />
        ))}
      </Section>

      {/* ── Nightly agents ─────────────────────────────── */}
      <Section
        title="Agents nocturnes"
        icon={<Moon className="h-3.5 w-3.5 text-[#3B82F6]" />}
        muted={nightly ? !nightly.effective : false}
      >
        {nightlyAgents.map((agent) => (
          <AgentRow key={agent.type} agent={agent} running={false} />
        ))}
      </Section>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────

function Section({
  title,
  icon,
  muted,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={muted ? "opacity-60" : undefined}>
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
          {title}
        </h2>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">{children}</div>
    </div>
  );
}

function AgentRow({
  agent,
  running,
  onRelaunch,
}: {
  agent: AgentCard;
  running: boolean;
  onRelaunch?: () => void;
}) {
  const session = agent.last_session;
  const meta = session ? STATUS_META[session.status] || STATUS_META.pending : null;
  const StatusIcon = meta?.Icon;
  const summary = session ? summarizeResult(session) : null;

  return (
    <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-semibold text-[#FAFAFA]">
            {agent.name}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-[#A1A1AA]">
            {agent.description}
          </p>
        </div>

        {onRelaunch && (
          <button
            type="button"
            onClick={onRelaunch}
            disabled={running}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-md bg-[#F97316] px-3 py-1.5 text-[12px] font-semibold text-[#0F0F11] transition-colors hover:bg-[#EA580C] disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Relancer
          </button>
        )}
      </div>

      <div className="mt-3 border-t border-[#27272A] pt-3">
        {!session ? (
          <p className="text-[12px] text-[#A1A1AA]">Jamais exécuté</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
              {meta && StatusIcon && (
                <span
                  className="inline-flex items-center gap-1 font-medium"
                  style={{ color: meta.color }}
                >
                  <StatusIcon
                    className={`h-3.5 w-3.5 ${
                      session.status === "running" ? "animate-spin" : ""
                    }`}
                  />
                  {meta.label}
                </span>
              )}
              <span className="text-[#A1A1AA]">
                {formatRelative(session.completed_at || session.started_at)}
              </span>
              <span className="text-[#A1A1AA]">·</span>
              <span className="text-[#A1A1AA]">
                {formatDuration(session.duration_ms)}
              </span>
              {session.trigger === "cron" && (
                <span className="rounded bg-[#3B82F6]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#3B82F6]">
                  nocturne
                </span>
              )}
            </div>

            {summary && (
              <p className="line-clamp-3 text-[12px] leading-relaxed text-[#A1A1AA]">
                {summary}
              </p>
            )}

            {session.error_message && (
              <p className="flex items-start gap-1.5 text-[12px] text-[#EF4444]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span className="line-clamp-2">{session.error_message}</span>
              </p>
            )}

            <div className="flex items-center gap-3 text-[11px] text-[#A1A1AA]">
              <span>{session.custom_tool_calls_count} outil(s)</span>
              <span>
                {(session.input_tokens || 0) + (session.output_tokens || 0)} tokens
              </span>
              {session.user_name && <span>{session.user_name}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
