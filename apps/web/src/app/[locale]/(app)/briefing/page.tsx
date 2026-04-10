"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Sparkles,
  AlertTriangle,
  Calendar,
  CheckSquare,
  Mail,
  ArrowLeft,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Clock,
  UserCheck,
  FileText,
} from "lucide-react";
import type { BriefingContent } from "@cantaia/database";
import { GuaranteeAlerts } from "@/components/closure/GuaranteeAlerts";
import { PlanAlertsBanner } from "@/components/plans/PlanAlertsBanner";
import { createClient } from "@/lib/supabase/client";
import { useAgent } from "@/lib/hooks/use-agent";
import { AgentAnalysisPanel } from "@/components/agents/AgentAnalysisPanel";

interface RecentVisit {
  id: string;
  client_name: string;
  status: string;
  visit_date: string;
  report_status: string | null;
}

/**
 * When AI briefing generation fails, fetch real stats directly from existing APIs
 * to show something meaningful instead of all zeros.
 */
async function buildDataOnlyBriefing(): Promise<BriefingContent> {
  // Fetch real data in parallel from existing API endpoints
  const [projectsRes, decisionsRes, tasksRes] = await Promise.allSettled([
    fetch("/api/projects/list").then((r) => r.json()),
    fetch("/api/mail/decisions?counts_only=true").then((r) => r.json()),
    fetch("/api/tasks").then((r) => r.json()),
  ]);

  const projects = projectsRes.status === "fulfilled" ? (projectsRes.value?.projects || []) : [];
  const totalUnprocessed = decisionsRes.status === "fulfilled" ? (decisionsRes.value?.totalUnprocessed || 0) : 0;
  const tasks = tasksRes.status === "fulfilled" ? (tasksRes.value?.tasks || []) : [];

  const activeProjects = projects.filter((p: { status: string }) => p.status === "active" || p.status === "planning");
  const openTasks = tasks.filter((t: { status: string }) => t.status === "todo" || t.status === "in_progress" || t.status === "waiting");
  const overdueTasks = tasks.filter((t: { status: string; due_date: string | null }) =>
    t.due_date && t.due_date < new Date().toISOString().split("T")[0] && t.status !== "done" && t.status !== "cancelled"
  );
  const dueTodayTasks = tasks.filter((t: { status: string; due_date: string | null }) =>
    t.due_date === new Date().toISOString().split("T")[0] && t.status !== "done" && t.status !== "cancelled"
  );

  const projectSummaries = activeProjects.slice(0, 5).map((p: { id: string; name: string; code?: string; status?: string }) => {
    const projTasks = openTasks.filter((t: { project_id: string }) => t.project_id === p.id);
    const projOverdue = overdueTasks.filter((t: { project_id: string }) => t.project_id === p.id);
    const actionItems: string[] = [];
    if (projOverdue.length > 0) actionItems.push(`${projOverdue.length} tâche${projOverdue.length > 1 ? "s" : ""} en retard`);
    if (projTasks.length > 0) actionItems.push(`${projTasks.length} tâche${projTasks.length > 1 ? "s" : ""} en cours`);
    return {
      project_id: p.id,
      name: p.name,
      status_emoji: projOverdue.length > 0 ? "🔴" : projTasks.length > 0 ? "🟡" : "🟢",
      summary: actionItems.length > 0 ? actionItems.join(", ") : "Aucune action en cours",
      action_items: actionItems,
    };
  });

  const greeting = `Bonjour ! Voici un aperçu de votre journée.`;
  const alerts: string[] = [];
  if (overdueTasks.length > 0) alerts.push(`⚠️ ${overdueTasks.length} tâche${overdueTasks.length > 1 ? "s" : ""} en retard`);
  if (totalUnprocessed > 0) alerts.push(`📬 ${totalUnprocessed} email${totalUnprocessed > 1 ? "s" : ""} non traité${totalUnprocessed > 1 ? "s" : ""}`);

  return {
    mode: "fallback" as const,
    greeting,
    priority_alerts: alerts,
    projects: projectSummaries,
    meetings_today: [],
    stats: {
      total_projects: activeProjects.length,
      emails_unread: totalUnprocessed,
      emails_action_required: totalUnprocessed,
      tasks_overdue: overdueTasks.length,
      tasks_due_today: dueTodayTasks.length,
      meetings_today: 0,
    },
    global_summary: alerts.length > 0
      ? `Points d'attention : ${alerts.join(", ")}.`
      : `${activeProjects.length} projet${activeProjects.length > 1 ? "s" : ""} actif${activeProjects.length > 1 ? "s" : ""}, ${openTasks.length} tâche${openTasks.length > 1 ? "s" : ""} en cours.`,
  };
}

const USE_MANAGED_AGENTS = process.env.NEXT_PUBLIC_USE_MANAGED_AGENTS === "true";

export default function BriefingPage() {
  const t = useTranslations("briefing");
  const tv = useTranslations("visits");
  const [briefing, setBriefing] = useState<BriefingContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [recentVisits, setRecentVisits] = useState<RecentVisit[]>([]);
  const agent = useAgent("briefing-generator");
  const agentActiveRef = useRef(false);

  // When the agent finishes, fetch the saved briefing from DB
  useEffect(() => {
    if (!USE_MANAGED_AGENTS) return;
    if (agent.status === "completed") {
      // Agent's save_briefing already wrote to DB — fetch the fresh briefing
      fetch(`/api/briefing/today?date=${selectedDate}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.briefing) setBriefing(data.briefing);
        })
        .catch(() => {})
        .finally(() => {
          setLoading(false);
          agentActiveRef.current = false;
        });
    } else if (agent.status === "failed") {
      // Agent failed — fall back to legacy generation
      agentActiveRef.current = false;
      setLoading(false); // Safety net — handleLegacyRegenerate sets it too
      handleLegacyRegenerate();
    } else if (agent.status === "cancelled") {
      setLoading(false);
      agentActiveRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.status]);

  useEffect(() => {
    // Skip initial fetch if the agent is actively generating
    if (agentActiveRef.current) return;

    const fetchBriefing = async () => {
      setLoading(true);
      try {
        // Try today's cached briefing first
        const res = await fetch(`/api/briefing/today?date=${selectedDate}`);
        if (res.ok) {
          const data = await res.json();
          if (!agentActiveRef.current) setBriefing(data.briefing);
          return;
        }
        if (res.status === 404 && selectedDate === new Date().toISOString().split("T")[0]) {
          // Auto-generate for today
          try {
            const genRes = await fetch("/api/briefing/generate", { method: "POST" });
            if (genRes.ok) {
              const data = await genRes.json();
              if (!agentActiveRef.current) setBriefing(data.briefing);
              return;
            }
          } catch {
            // AI generation failed — fall through to data-only briefing
          }
        }
      } catch {
        // Network error — fall through to data-only briefing
      }

      // Fallback: build a data-only briefing from real stats instead of showing zeros
      if (agentActiveRef.current) return;
      try {
        const fallbackBriefing = await buildDataOnlyBriefing();
        if (!agentActiveRef.current) setBriefing(fallbackBriefing);
      } catch {
        if (!agentActiveRef.current) setBriefing(getMockBriefing(t));
      }
    };
    fetchBriefing().finally(() => {
      if (!agentActiveRef.current) setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Load recent visits (report_ready or recording — needs attention)
  useEffect(() => {
    async function loadVisits() {
      try {
        // Use API route (admin client) to bypass RLS recursion on users table
        const profileRes = await fetch("/api/user/profile");
        const profileData = await profileRes.json();
        const userOrgId = profileData?.profile?.organization_id;
        if (!userOrgId) return;

        const supabase = createClient();
        const { data } = await (supabase.from("client_visits") as any)
          .select("id, client_name, status, visit_date, report_status")
          .eq("organization_id", userOrgId)
          .in("status", ["recording", "transcribing", "report_ready"])
          .order("visit_date", { ascending: false })
          .limit(5);
        setRecentVisits(data || []);
      } catch {
        // ignore
      }
    }
    loadVisits();
  }, []);

  const navigateDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const isToday = selectedDate === new Date().toISOString().split("T")[0];

  // ── Agent-powered regeneration (when managed agents enabled) ──
  const handleAgentRegenerate = async () => {
    if (agent.isRunning) return;
    agentActiveRef.current = true;
    setLoading(true);
    await agent.start(
      {},
      `Génère le briefing quotidien pour la date du ${selectedDate}. ` +
        `Appelle fetch_cantaia_context pour récupérer les données, ` +
        `puis appelle save_briefing avec briefing_date="${selectedDate}" et le JSON du briefing structuré.`,
      `Briefing du ${selectedDate}`
    );
  };

  // ── Legacy regeneration (direct API call) ──
  const handleLegacyRegenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/briefing/generate", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setBriefing(data.briefing);
      } else {
        // If generate fails, try fetching today's cached briefing
        const fallback = await fetch(`/api/briefing/today?date=${new Date().toISOString().split("T")[0]}`);
        if (fallback.ok) {
          const data = await fallback.json();
          setBriefing(data.briefing);
        }
      }
    } catch {
      // keep current briefing
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = USE_MANAGED_AGENTS ? handleAgentRegenerate : handleLegacyRegenerate;

  if (!briefing) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#71717A]" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0F0F11] mx-auto max-w-4xl p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-md p-2 text-[#71717A] hover:bg-[#27272A] hover:text-[#71717A]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-[#FAFAFA]">
              <Sparkles className="h-5 w-5 text-amber-500" />
              {t("pageTitle")}
            </h1>
            <p className="mt-0.5 text-sm text-[#71717A]">{briefing.greeting}</p>
          </div>
        </div>
        {isToday && (
          <button
            onClick={handleRegenerate}
            disabled={loading || agent.isRunning}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-xs font-medium text-[#71717A] hover:bg-[#27272A] disabled:opacity-50"
          >
            {(loading || agent.isRunning) ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {t("regenerate")}
          </button>
        )}
      </div>

      {/* Date navigation */}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => navigateDate(-1)}
          className="rounded-md p-1.5 text-[#71717A] hover:bg-[#27272A] hover:text-[#71717A]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          max={new Date().toISOString().split("T")[0]}
          className="rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-1.5 text-sm text-[#FAFAFA]"
        />
        <button
          onClick={() => navigateDate(1)}
          disabled={isToday}
          className="rounded-md p-1.5 text-[#71717A] hover:bg-[#27272A] hover:text-[#71717A] disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {!isToday && (
          <button
            onClick={() =>
              setSelectedDate(new Date().toISOString().split("T")[0])
            }
            className="text-xs font-medium text-brand hover:underline"
          >
            {t("today")}
          </button>
        )}
      </div>

      {/* Agent progress panel — shown during managed agent generation */}
      {USE_MANAGED_AGENTS && agent.status !== "idle" && (
        <div className="-mx-6 lg:-mx-8">
          <AgentAnalysisPanel
            agentType="briefing-generator"
            status={agent.status}
            events={agent.events}
            lastMessage={agent.lastMessage}
            result={agent.result}
            error={agent.error}
            isRunning={agent.isRunning}
            onCancel={() => {
              agent.cancel();
              agentActiveRef.current = false;
              setLoading(false);
            }}
          />
        </div>
      )}

      {/* Stats bar */}
      <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
        <StatCard
          icon={<CheckSquare className="h-4 w-4" />}
          label={t("statProjects")}
          value={briefing.stats.total_projects}
        />
        <StatCard
          icon={<Mail className="h-4 w-4" />}
          label={t("statUnread")}
          value={briefing.stats.emails_unread}
          color={briefing.stats.emails_unread > 0 ? "blue" : undefined}
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label={t("statActionRequired")}
          value={briefing.stats.emails_action_required}
          color={briefing.stats.emails_action_required > 0 ? "amber" : undefined}
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label={t("statOverdue")}
          value={briefing.stats.tasks_overdue}
          color={briefing.stats.tasks_overdue > 0 ? "red" : undefined}
        />
        <StatCard
          icon={<CheckSquare className="h-4 w-4" />}
          label={t("statDueToday")}
          value={briefing.stats.tasks_due_today}
          color={briefing.stats.tasks_due_today > 0 ? "amber" : undefined}
        />
        <StatCard
          icon={<Calendar className="h-4 w-4" />}
          label={t("statMeetings")}
          value={briefing.stats.meetings_today}
        />
      </div>

      {/* Priority alerts */}
      {briefing.priority_alerts.length > 0 && (
        <div className="mt-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#FAFAFA]">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            {t("alertsTitle")}
          </h2>
          <div className="mt-2 space-y-2">
            {briefing.priority_alerts.map((alert, i) => (
              <div
                key={i}
                className="rounded-md border border-amber-500/20 bg-amber-500/10 px-4 py-3"
              >
                <p className="text-sm font-medium text-amber-900">{alert}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guarantee alerts */}
      <div className="mt-6">
        <GuaranteeAlerts compact />
      </div>

      {/* Plan alerts */}
      <div className="mt-4">
        <PlanAlertsBanner compact />
      </div>

      {/* Recent visits needing attention */}
      {recentVisits.length > 0 && (
        <div className="mt-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#FAFAFA]">
            <UserCheck className="h-4 w-4 text-[#F97316]" />
            {tv("recentVisits")}
          </h2>
          <div className="mt-2 space-y-2">
            {recentVisits.map((v) => (
              <Link
                key={v.id}
                href={`/visits/${v.id}`}
                className="flex items-center justify-between rounded-md border border-[#F97316]/20 bg-[#F97316]/10/50 px-4 py-3 hover:border-[#F97316]/20"
              >
                <div className="flex items-center gap-3">
                  <UserCheck className="h-4 w-4 text-[#F97316]" />
                  <div>
                    <p className="text-sm font-medium text-[#FAFAFA]">{v.client_name}</p>
                    <p className="text-xs text-[#71717A]">
                      {new Date(v.visit_date).toLocaleDateString("fr-CH")}
                    </p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  v.status === "report_ready" ? "bg-[#F97316]/10 text-[#F97316]" : "bg-red-500/10 text-red-400"
                }`}>
                  {v.status === "report_ready" ? tv("statusReportReady") : tv("statusRecording")}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Submission deadlines */}
      {briefing.submission_deadlines && briefing.submission_deadlines.length > 0 && (
        <div className="mt-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#FAFAFA]">
            <FileText className="h-4 w-4 text-purple-500" />
            {t("deadlinesTitle")}
          </h2>
          <div className="mt-2 space-y-2">
            {briefing.submission_deadlines.map((d, i) => (
              <div
                key={i}
                className={`flex items-center justify-between rounded-md border px-4 py-3 ${
                  d.days_remaining <= 3
                    ? "border-red-500/20 bg-red-500/10"
                    : d.days_remaining <= 7
                      ? "border-amber-500/20 bg-amber-500/10"
                      : "border-purple-500/20 bg-purple-500/10"
                }`}
              >
                <div>
                  <p className={`text-sm font-medium ${
                    d.days_remaining <= 3 ? "text-red-900" : d.days_remaining <= 7 ? "text-amber-900" : "text-[#FAFAFA]"
                  }`}>
                    {d.title}
                  </p>
                  <p className="text-xs text-[#71717A]">{d.project}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${
                    d.days_remaining <= 3 ? "text-red-400" : d.days_remaining <= 7 ? "text-amber-400" : "text-purple-400"
                  }`}>
                    {d.days_remaining}j
                  </p>
                  <p className="text-xs text-[#71717A]">{d.deadline}</p>
                  {d.note && (
                    <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      d.days_remaining <= 3
                        ? "bg-red-500/10 text-red-400"
                        : "bg-amber-500/10 text-amber-400"
                    }`}>
                      {d.note}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects */}
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-[#FAFAFA]">
          {t("projectsTitle")}
        </h2>
        <div className="mt-3 space-y-3">
          {briefing.projects.map((project) => (
            <div
              key={project.project_id}
              className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-4"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{project.status_emoji}</span>
                <h3 className="text-sm font-semibold text-[#FAFAFA]">
                  {project.name}
                </h3>
              </div>
              <p className="mt-1.5 text-sm text-[#71717A]">{project.summary}</p>
              {project.action_items.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {project.action_items.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-[#FAFAFA]"
                    >
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Today's meetings */}
      {briefing.meetings_today.length > 0 && (
        <div className="mt-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#FAFAFA]">
            <Calendar className="h-4 w-4 text-[#F97316]" />
            {t("meetingsTitle")}
          </h2>
          <div className="mt-2 space-y-2">
            {briefing.meetings_today.map((meeting, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-md border border-[#F97316]/20 bg-[#F97316]/10/50 px-4 py-3"
              >
                <span className="text-sm font-semibold text-[#F97316]">
                  {meeting.time}
                </span>
                <div>
                  <p className="text-sm font-medium text-[#FAFAFA]">
                    {meeting.title}
                  </p>
                  <p className="text-xs text-[#71717A]">{meeting.project}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global summary */}
      <div className="mt-6 rounded-lg border border-[#27272A] bg-[#27272A] p-4">
        <h2 className="text-sm font-semibold text-[#FAFAFA]">
          {t("summaryTitle")}
        </h2>
        <p className="mt-1.5 text-sm text-[#71717A]">
          {briefing.global_summary}
        </p>
      </div>

      {/* Mode indicator */}
      <div className="mt-4 text-center">
        <span className="text-[10px] text-[#71717A]">
          {briefing.mode === "ai" ? t("generatedByAI") : t("generatedFallback")}
        </span>
      </div>
    </div>
  );
}

// ---------- Stat Card ----------

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color?: "red" | "amber" | "blue";
}) {
  const colorClasses = {
    red: "border-red-500/20 bg-red-500/10 text-red-400",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-400",
    blue: "border-[#F97316]/20 bg-[#F97316]/10 text-[#F97316]",
  };

  return (
    <div
      className={`rounded-md border p-3 text-center ${
        color ? colorClasses[color] : "border-[#27272A] bg-[#0F0F11] text-[#FAFAFA]"
      }`}
    >
      <div className="mx-auto mb-1 flex justify-center opacity-60">{icon}</div>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">
        {label}
      </p>
    </div>
  );
}

// ---------- Mock briefing ----------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getMockBriefing(_t: ReturnType<typeof useTranslations>): BriefingContent {
  return {
    mode: "ai" as const,
    greeting: "",
    priority_alerts: [],
    projects: [],
    meetings_today: [],
    stats: {
      total_projects: 0,
      emails_unread: 0,
      emails_action_required: 0,
      tasks_overdue: 0,
      tasks_due_today: 0,
      meetings_today: 0,
    },
    global_summary: "",
  };
}
