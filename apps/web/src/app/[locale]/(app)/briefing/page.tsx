"use client";

// ============================================================
// /briefing — archive view + redirect
// ============================================================
// The briefing used to live on its own page AND as a stub on the dashboard,
// so the same content existed twice and drifted. The dashboard is now the
// briefing's home (`/dashboard#briefing`), where every stat is a live link.
//
// This route keeps two jobs:
//   1. `/briefing`                 → redirect to the dashboard briefing block.
//   2. `/briefing?date=YYYY-MM-DD` → read-only archive for a past day, so
//      links in old briefing emails and bookmarks keep resolving.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  Sparkles,
  AlertTriangle,
  Calendar,
  CheckSquare,
  Mail,
  ArrowLeft,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Archive,
} from "lucide-react";
import type { BriefingContent } from "@cantaia/database";
import { toLocalDateString } from "@/components/calendar/datetime-utils";

function todayIso(): string {
  return toLocalDateString(new Date());
}

export default function BriefingArchivePage() {
  const t = useTranslations("briefing");
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");

  const [briefing, setBriefing] = useState<BriefingContent | null>(null);
  const [loading, setLoading] = useState(true);
  // Distinguishes "still loading" from "checked, and there is nothing".
  const [notFound, setNotFound] = useState(false);

  const today = useMemo(() => todayIso(), []);
  const selectedDate = dateParam || today;
  const isToday = selectedDate === today;

  // No explicit date (or today's) → the dashboard owns the live briefing.
  useEffect(() => {
    if (!dateParam || dateParam === today) {
      router.replace("/dashboard#briefing");
    }
  }, [dateParam, today, router]);

  useEffect(() => {
    if (!dateParam || dateParam === today) return;

    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setBriefing(null);

    fetch(`/api/briefing/today?date=${encodeURIComponent(dateParam)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setBriefing(data.briefing ?? null);
          if (!data.briefing) setNotFound(true);
          return;
        }
        // A past day with no stored briefing is a normal state, not an error.
        // We deliberately do NOT generate one retroactively: a briefing
        // describes a moment, and rebuilding it from today's data would be
        // fiction presented as history.
        setNotFound(true);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dateParam, today]);

  const navigateDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    const next = d.toISOString().split("T")[0];
    if (next > today) return;
    router.replace(`/briefing?date=${next}`);
  };

  // Redirecting to the dashboard — show a spinner rather than a flash of UI.
  if (!dateParam || dateParam === today) {
    return (
      <div className="flex h-96 items-center justify-center bg-[#0F0F11]">
        <Loader2 className="h-6 w-6 animate-spin text-[#A1A1AA]" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0F0F11] mx-auto max-w-4xl p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard#briefing"
            className="rounded-md p-2 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
            aria-label="Retour au tableau de bord"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-[#FAFAFA]">
              <Archive className="h-5 w-5 text-amber-500" />
              {t("pageTitle")}
            </h1>
            <p className="mt-0.5 text-sm text-[#A1A1AA]">
              Archive du{" "}
              {new Date(selectedDate).toLocaleDateString("fr-CH", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard#briefing"
          className="inline-flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-xs font-medium text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Briefing du jour
        </Link>
      </div>

      {/* Date navigation */}
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => navigateDate(-1)}
          aria-label="Jour précédent"
          className="rounded-md p-1.5 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => router.replace(`/briefing?date=${e.target.value}`)}
          max={today}
          className="rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-1.5 text-sm text-[#FAFAFA]"
        />
        <button
          onClick={() => navigateDate(1)}
          disabled={isToday}
          aria-label="Jour suivant"
          className="rounded-md p-1.5 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA] disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#A1A1AA]" />
        </div>
      ) : notFound || !briefing ? (
        /* Honest empty state — no fabricated retro-briefing. */
        <div className="mt-10 flex flex-col items-center justify-center rounded-lg border border-[#27272A] bg-[#18181B] py-14 text-center">
          <Archive className="mb-3 h-8 w-8 text-[#3F3F46]" />
          <p className="text-sm font-medium text-[#D4D4D8]">
            Aucun briefing archivé ce jour
          </p>
          <p className="mt-1 max-w-sm text-xs text-[#A1A1AA]">
            Les briefings sont générés chaque matin et conservés tels quels. Un
            jour sans briefing enregistré ne peut pas être reconstitué a
            posteriori.
          </p>
          <Link
            href="/dashboard#briefing"
            className="mt-4 text-xs font-semibold text-[#F97316] hover:underline"
          >
            Voir le briefing du jour
          </Link>
        </div>
      ) : (
        <>
          {briefing.greeting && (
            <p className="mt-4 text-sm italic text-[#A1A1AA]">{briefing.greeting}</p>
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
            />
            <StatCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label={t("statActionRequired")}
              value={briefing.stats.emails_action_required}
            />
            <StatCard
              icon={<Clock className="h-4 w-4" />}
              label={t("statOverdue")}
              value={briefing.stats.tasks_overdue}
            />
            <StatCard
              icon={<CheckSquare className="h-4 w-4" />}
              label={t("statDueToday")}
              value={briefing.stats.tasks_due_today}
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
                    <p className="text-sm font-medium text-amber-200">{alert}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submission deadlines */}
          {briefing.submission_deadlines &&
            briefing.submission_deadlines.length > 0 && (
              <div className="mt-6">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-[#FAFAFA]">
                  <FileText className="h-4 w-4 text-purple-500" />
                  {t("deadlinesTitle")}
                </h2>
                <div className="mt-2 space-y-2">
                  {briefing.submission_deadlines.map((d, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md border border-[#27272A] bg-[#18181B] px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-[#FAFAFA]">{d.title}</p>
                        <p className="text-xs text-[#A1A1AA]">{d.project}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[#D4D4D8]">
                          {d.days_remaining}j
                        </p>
                        <p className="text-xs text-[#A1A1AA]">{d.deadline}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Projects */}
          {briefing.projects.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-[#FAFAFA]">
                {t("projectsTitle")}
              </h2>
              <div className="mt-3 space-y-3">
                {briefing.projects.map((project) => (
                  <Link
                    key={project.project_id}
                    href={`/projects/${project.project_id}`}
                    className="block rounded-lg border border-[#27272A] bg-[#18181B] p-4 transition-colors hover:border-[#3F3F46]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{project.status_emoji}</span>
                      <h3 className="text-sm font-semibold text-[#FAFAFA]">
                        {project.name}
                      </h3>
                    </div>
                    <p className="mt-1.5 text-sm text-[#A1A1AA]">{project.summary}</p>
                    {project.action_items.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {project.action_items.map((item, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm text-[#D4D4D8]"
                          >
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#F97316]" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Meetings */}
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
                    className="flex items-center gap-3 rounded-md border border-[#27272A] bg-[#18181B] px-4 py-3"
                  >
                    <span className="text-sm font-semibold text-[#F97316]">
                      {meeting.time}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-[#FAFAFA]">
                        {meeting.title}
                      </p>
                      <p className="text-xs text-[#A1A1AA]">{meeting.project}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Global summary */}
          {briefing.global_summary && (
            <div className="mt-6 rounded-lg border border-[#27272A] bg-[#18181B] p-4">
              <h2 className="text-sm font-semibold text-[#FAFAFA]">
                {t("summaryTitle")}
              </h2>
              <p className="mt-1.5 text-sm text-[#A1A1AA]">
                {briefing.global_summary}
              </p>
            </div>
          )}

          {/* Provenance — "data" briefings are never presented as AI-written. */}
          <div className="mt-4 text-center">
            <span className="text-[10px] text-[#A1A1AA]">
              {briefing.mode === "ai"
                ? t("generatedByAI")
                : "Assemblé depuis vos données (sans IA)"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Stat Card ----------

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border border-[#27272A] bg-[#18181B] p-3 text-center text-[#FAFAFA]">
      <div className="mx-auto mb-1 flex justify-center opacity-60">{icon}</div>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-[#A1A1AA]">
        {label}
      </p>
    </div>
  );
}
