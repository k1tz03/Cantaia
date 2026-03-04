"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useProject } from "@/lib/hooks/use-supabase-data";
import { createClient } from "@/lib/supabase/client";
import { StatusBadge, PriorityIndicator, cn } from "@cantaia/ui";
import {
  ArrowLeft,
  Settings,
  CheckSquare,
  Mail,
  FileText,
  LayoutDashboard,
  Building2,
  MapPin,
  Clock,
  Plus,
  ShieldCheck,
  Map,
  FileStack,
  FileSpreadsheet,
  UserCheck,
  Loader2,
} from "lucide-react";
import {
  formatDate,
  formatCurrency,
} from "@/lib/mock-data";
import { DollarSign, TrendingUp } from "lucide-react";
import { GuaranteeAlerts } from "@/components/closure/GuaranteeAlerts";
import { TaskCreateModal } from "@/components/tasks/TaskCreateModal";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import type { Task } from "@cantaia/database";
import { ArchiveSettingsTab } from "@/components/projects/ArchiveSettingsTab";
import { FolderArchive, Search, X, Paperclip } from "lucide-react";
import { EmailDetailPanel } from "@/components/app/EmailDetailPanel";
import type { EmailRecord, Project } from "@cantaia/database";

const baseTabs = [
  { key: "overview", icon: LayoutDashboard },
  { key: "emails", icon: Mail },
  { key: "tasks", icon: CheckSquare },
  { key: "meetings", icon: FileText },
  { key: "visits", icon: UserCheck },
  { key: "submissions", icon: FileSpreadsheet },
  { key: "plans", icon: Map },
  { key: "prix", icon: FileStack },
  { key: "archiving", icon: FolderArchive },
  { key: "closure", icon: ShieldCheck },
] as const;

export default function ProjectDetailPage() {
  const params = useParams();
  const t = useTranslations("projects");
  const tc = useTranslations("closure");
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);

  const { project, loading: projectLoading } = useProject(params.id as string);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<{ id: string; title: string; reference: string; status: string; estimated_total?: number; deadline?: string }[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [benchmark, setBenchmark] = useState<any[]>([]);

  useEffect(() => {
    if (!params.id) return;
    const supabase = createClient();
    const projectId = params.id as string;

    // Load tasks via API (bypasses RLS)
    fetch(`/api/tasks?project_id=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.tasks) setTasks(data.tasks);
      })
      .catch((err) => console.error("Failed to load tasks:", err));

    // Load meetings via API (bypasses RLS)
    fetch(`/api/pv?project_id=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.meetings) setMeetings(data.meetings);
      })
      .catch((err) => console.error("Failed to load meetings:", err));

    // Load submissions
    (supabase.from("submissions") as any)
      .select("id, title, reference, status, estimated_total, deadline")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .then(({ data }: { data: any[] | null }) => {
        if (data) setSubmissions(data);
      });

    // Load plans
    fetch(`/api/plans?project_id=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.plans) setPlans(data.plans);
      })
      .catch((err) => console.error("Failed to load plans:", err));

    // Load benchmark (price comparison)
    fetch(`/api/pricing/benchmark?project_id=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.groups) setBenchmark(data.groups);
      })
      .catch((err) => console.error("Failed to load benchmark:", err));
  }, [params.id]);

  if (projectLoading) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <p className="text-slate-500">{t("projectNotFound")}</p>
      </div>
    );
  }

  const showClosureTab = ["active", "on_hold", "closing", "completed"].includes(project.status);
  const tabs = baseTabs.filter((tab) => tab.key !== "closure" || showClosureTab);

  const reception = null as { id: string; reception_type: string; reception_date?: string; pv_document_url?: string | null; pv_signed_url?: string | null } | null;
  const openReservesCount = 0;

  const openTasks = tasks.filter(
    (t) => t.status === "todo" || t.status === "in_progress"
  );
  const overdueTasks = tasks.filter(
    (t) =>
      t.due_date &&
      t.due_date < new Date().toISOString().split("T")[0] &&
      t.status !== "done" &&
      t.status !== "cancelled"
  );

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 sm:gap-4 min-w-0">
          <Link
            href="/projects"
            className="mt-1 shrink-0 rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div
                className="h-4 w-4 shrink-0 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              <h1 className="text-lg sm:text-xl font-semibold text-slate-800 truncate">
                {project.name}
              </h1>
              {project.code && (
                <span className="text-sm text-slate-400">{project.code}</span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
              {project.client_name && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  {project.client_name}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {project.city}
              </span>
              <StatusBadge status={project.status} />
            </div>
          </div>
        </div>
        <Link
          href={`/projects/${project.id}/settings`}
          className="hidden rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 sm:inline-flex"
        >
          <Settings className="mr-2 h-4 w-4" />
          {t("settingsTab")}
        </Link>
      </div>

      {/* Tabs */}
      <div className="mt-6 -mx-4 px-4 sm:mx-0 sm:px-0 border-b border-slate-200">
        <nav className="-mb-px flex flex-wrap gap-x-1 gap-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-brand text-brand"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t(`tab_${tab.key}`)}
                {tab.key === "closure" && openReservesCount > 0 && (
                  <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {openReservesCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "overview" && (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Stats */}
            <div className="lg:col-span-2">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium text-slate-500">{t("openTasks")}</p>
                  <p className="mt-1 text-xl font-semibold text-slate-800">
                    {openTasks.length}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium text-slate-500">{t("overdueTasks")}</p>
                  <p className="mt-1 text-2xl font-bold text-red-600">
                    {overdueTasks.length}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium text-slate-500">{t("meetingsCount")}</p>
                  <p className="mt-1 text-xl font-semibold text-slate-800">
                    {meetings.length}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium text-slate-500">{t("budget")}</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {project.budget_total
                      ? formatCurrency(project.budget_total, project.currency)
                      : "—"}
                  </p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium text-slate-500">Emails</p>
                  <p className="mt-1 text-xl font-semibold text-slate-800">0</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium text-slate-500">Archivés</p>
                  <p className="mt-1 text-xl font-semibold text-slate-800">0</p>
                </div>
              </div>

              {/* Tasks list */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-slate-800">
                  {t("recentTasks")}
                </h3>
                <div className="mt-3 space-y-2">
                  {tasks.length > 0 ? (
                    tasks.slice(0, 5).map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3"
                      >
                        <PriorityIndicator priority={task.priority} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {task.title}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                            {task.assigned_to_name && (
                              <span>{task.assigned_to_name}</span>
                            )}
                            {task.due_date && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDate(task.due_date)}
                              </span>
                            )}
                          </div>
                        </div>
                        <StatusBadge status={task.status} />
                      </div>
                    ))
                  ) : (
                    <p className="py-8 text-center text-sm text-slate-500">
                      {t("noTasksYet")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Project info sidebar */}
            <div className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-slate-800">
                  {t("projectInfo")}
                </h3>
                <dl className="mt-4 space-y-3">
                  {project.description && (
                    <div>
                      <dt className="text-xs font-medium text-slate-500">{t("description")}</dt>
                      <dd className="mt-0.5 text-sm text-slate-600">
                        {project.description}
                      </dd>
                    </div>
                  )}
                  {project.address && (
                    <div>
                      <dt className="text-xs font-medium text-slate-500">{t("address")}</dt>
                      <dd className="mt-0.5 text-sm text-slate-600">
                        {project.address}, {project.city}
                      </dd>
                    </div>
                  )}
                  {project.start_date && (
                    <div>
                      <dt className="text-xs font-medium text-slate-500">{t("dates")}</dt>
                      <dd className="mt-0.5 text-sm text-slate-600">
                        {formatDate(project.start_date)}
                        {project.end_date && ` — ${formatDate(project.end_date)}`}
                      </dd>
                    </div>
                  )}
                  {project.email_keywords.length > 0 && (
                    <div>
                      <dt className="text-xs font-medium text-slate-500">{t("emailKeywords")}</dt>
                      <dd className="mt-1 flex flex-wrap gap-1">
                        {project.email_keywords.map((kw) => (
                          <span
                            key={kw}
                            className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand"
                          >
                            {kw}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </div>
        )}

        {/* Emails tab */}
        {activeTab === "emails" && (
          <ProjectEmailsTab projectId={project.id} />
        )}

        {activeTab === "tasks" && (
          <div>
            {/* Header with count and create button */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {tasks.length} {tasks.length === 1 ? "tâche" : "tâches"}
              </p>
              <button
                type="button"
                onClick={() => setTaskModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("newTask")}
              </button>
            </div>

            {/* Task list */}
            {tasks.length > 0 ? (
              <div className="mt-3 space-y-2">
                {tasks.map((task) => {
                  const overdue = task.due_date && task.due_date < new Date().toISOString().split("T")[0] && task.status !== "done" && task.status !== "cancelled";
                  const isDone = task.status === "done";
                  return (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className={`flex cursor-pointer items-center gap-3 rounded-md border bg-white p-3 transition-colors hover:bg-slate-50 ${
                        overdue ? "border-red-200 bg-red-50/30" : "border-slate-200"
                      } ${selectedTask?.id === task.id ? "ring-2 ring-brand/20" : ""}`}
                    >
                      <PriorityIndicator priority={task.priority} />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium ${isDone ? "text-slate-400 line-through" : "text-slate-800"}`}>
                          {task.title}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                          {task.assigned_to_name && <span>{task.assigned_to_name}</span>}
                          {task.due_date && (
                            <span className={`flex items-center gap-1 ${overdue ? "font-medium text-red-600" : ""}`}>
                              <Clock className="h-3 w-3" />
                              {formatDate(task.due_date)}
                            </span>
                          )}
                          {task.source === "meeting" && task.source_reference && (
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                              {task.source_reference}
                            </span>
                          )}
                          {task.lot_code && (
                            <span className="text-slate-400">{task.lot_code}</span>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={task.status} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 flex h-32 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white">
                <p className="text-sm text-slate-400">{t("noTasksYet")}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "meetings" && (
          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {meetings.length} PV
              </p>
              <Link
                href={`/pv-chantier/nouveau?project_id=${project.id}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("newMeeting")}
              </Link>
            </div>
            {meetings.length > 0 ? (
              <div className="mt-3 space-y-2">
                {meetings.map((meeting) => {
                  const actionsCount = meeting.pv_content?.sections?.reduce(
                    (total: number, s: any) => total + (s.actions?.length || 0),
                    0
                  ) || 0;
                  const statusColors: Record<string, string> = {
                    scheduled: "bg-gray-100 text-gray-700",
                    recording: "bg-red-100 text-red-700",
                    transcribing: "bg-blue-100 text-blue-700",
                    generating_pv: "bg-violet-100 text-violet-700",
                    review: "bg-orange-100 text-orange-700",
                    finalized: "bg-green-100 text-green-700",
                    sent: "bg-green-100 text-green-800",
                  };
                  const statusLabels: Record<string, string> = {
                    scheduled: "Brouillon",
                    recording: "Enregistrement",
                    transcribing: "Transcription",
                    generating_pv: "Génération",
                    review: "En relecture",
                    finalized: "Finalisé",
                    sent: "Envoyé",
                  };
                  return (
                    <Link
                      key={meeting.id}
                      href={`/pv-chantier/${meeting.id}`}
                      className="flex items-center gap-4 rounded-md border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50"
                    >
                      <FileText className="h-5 w-5 flex-shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {meeting.title}
                          {meeting.meeting_number != null && (
                            <span className="ml-1 text-xs text-slate-400">
                              #{meeting.meeting_number}
                            </span>
                          )}
                        </p>
                        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(meeting.meeting_date)}
                          </span>
                          {actionsCount > 0 && (
                            <span>{actionsCount} action{actionsCount > 1 ? "s" : ""}</span>
                          )}
                        </div>
                      </div>
                      <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[meeting.status] || "bg-gray-100 text-gray-700"}`}>
                        {statusLabels[meeting.status] || meeting.status}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 flex h-40 flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-white">
                <FileText className="h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm text-slate-400">{t("noMeetingsYet")}</p>
                <Link
                  href={`/pv-chantier/nouveau?project_id=${project.id}`}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand/80"
                >
                  <Plus className="h-3 w-3" />
                  {t("newMeeting")}
                </Link>
              </div>
            )}
          </div>
        )}

        {activeTab === "visits" && (
          <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white">
            <div className="text-center">
              <UserCheck className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-500">
                {t("visitsPlaceholder")}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                <Link href="/visits" className="text-blue-600 hover:text-blue-700">
                  {t("viewAllVisits")}
                </Link>
              </p>
            </div>
          </div>
        )}

        {activeTab === "submissions" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {submissions.length} {submissions.length === 1 ? "soumission" : "soumissions"}
              </p>
              <Link
                href="/submissions/new"
                className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("newTask")}
              </Link>
            </div>
            {submissions.length > 0 ? (
              <div className="space-y-2">
                {submissions.map((sub) => {
                  const lots: unknown[] = [];
                  const statusColors: Record<string, string> = {
                    draft: "bg-gray-100 text-gray-700",
                    published: "bg-blue-100 text-blue-700",
                    received: "bg-indigo-100 text-indigo-700",
                    comparing: "bg-amber-100 text-amber-700",
                    awarded: "bg-green-100 text-green-700",
                    cancelled: "bg-red-100 text-red-700",
                  };
                  return (
                    <Link
                      key={sub.id}
                      href={`/submissions/${sub.id}`}
                      className="flex items-center gap-4 rounded-md border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50"
                    >
                      <FileSpreadsheet className="h-5 w-5 flex-shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-800 truncate">{sub.title}</p>
                          <span className="flex-shrink-0 text-xs text-slate-400 font-mono">{sub.reference}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                          <span>{lots.length} lot{lots.length !== 1 ? "s" : ""}</span>
                          {sub.estimated_total && (
                            <span className="font-medium text-slate-700">
                              {formatCurrency(sub.estimated_total, "CHF")}
                            </span>
                          )}
                          {sub.deadline && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(sub.deadline)}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[sub.status] || "bg-gray-100 text-gray-700"}`}>
                        {sub.status}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white">
                <div className="text-center">
                  <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-3 text-sm font-medium text-slate-500">{t("comingSoon")}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "plans" && (
          <div className="space-y-4">
            <div className="rounded-md border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">{t("plansTitle")}</h3>
                  <p className="mt-1 text-xs text-slate-500">{t("plansDescription")}</p>
                </div>
                <Link
                  href="/plans"
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <FileStack className="h-3.5 w-3.5" />
                  {t("viewAllPlans")}
                </Link>
              </div>
              {plans.length === 0 ? (
                <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50">
                  <div className="text-center">
                    <Map className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-3 text-sm font-medium text-slate-500">{t("noPlansYet")}</p>
                    <p className="mt-1 text-xs text-slate-400">{t("plansWillAppear")}</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                      <tr>
                        <th className="px-4 py-2">{t("planName")}</th>
                        <th className="px-4 py-2">{t("planType")}</th>
                        <th className="px-4 py-2">{t("planDiscipline")}</th>
                        <th className="px-4 py-2">{t("planVersion")}</th>
                        <th className="px-4 py-2">{t("planDate")}</th>
                        <th className="px-4 py-2">{t("planStatus")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {plans.map((plan: any) => (
                        <tr key={plan.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-800">{plan.title || plan.file_name}</td>
                          <td className="px-4 py-2.5 text-slate-600">{plan.plan_type || "—"}</td>
                          <td className="px-4 py-2.5 text-slate-600">{plan.discipline || "—"}</td>
                          <td className="px-4 py-2.5 text-slate-600">{plan.version || "1"}</td>
                          <td className="px-4 py-2.5 text-slate-500">{plan.created_at ? new Date(plan.created_at).toLocaleDateString() : "—"}</td>
                          <td className="px-4 py-2.5">
                            <span className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                              plan.status === "active" ? "bg-green-50 text-green-700" :
                              plan.status === "superseded" ? "bg-amber-50 text-amber-700" :
                              "bg-slate-100 text-slate-600"
                            )}>
                              {plan.status || "active"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "prix" && (
          <div className="space-y-4">
            <div className="rounded-md border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">{t("prixTitle")}</h3>
                  <p className="mt-1 text-xs text-slate-500">{t("prixDescription")}</p>
                </div>
                <Link
                  href="/cantaia-prix"
                  className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  {t("viewCantaiaPrix")}
                </Link>
              </div>
              {benchmark.length === 0 ? (
                <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50">
                  <div className="text-center">
                    <DollarSign className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-3 text-sm font-medium text-slate-500">{t("noPricesYet")}</p>
                    <p className="mt-1 text-xs text-slate-400">{t("pricesWillAppear")}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {benchmark.map((group: any, idx: number) => {
                    const prices = group.suppliers || [];
                    const minPrice = prices.length > 0 ? Math.min(...prices.map((s: any) => s.unit_price)) : 0;
                    const maxPrice = prices.length > 0 ? Math.max(...prices.map((s: any) => s.unit_price)) : 0;
                    return (
                      <div key={idx} className="rounded-md border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium text-slate-800">{group.description}</h4>
                          <span className="text-xs text-slate-500">{group.unit} — {prices.length} {t("suppliers")}</span>
                        </div>
                        {prices.length > 0 && (
                          <div className="space-y-1.5">
                            {prices
                              .sort((a: any, b: any) => a.unit_price - b.unit_price)
                              .map((supplier: any, sIdx: number) => {
                                const pct = maxPrice > 0 ? (supplier.unit_price / maxPrice) * 100 : 0;
                                const isBest = supplier.unit_price === minPrice;
                                const overPercent = minPrice > 0 ? Math.round(((supplier.unit_price - minPrice) / minPrice) * 100) : 0;
                                return (
                                  <div key={sIdx} className="flex items-center gap-3 text-xs">
                                    <span className="w-32 truncate text-slate-600">{supplier.supplier_name}</span>
                                    <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                                      <div
                                        className={cn("h-full rounded-full", isBest ? "bg-green-500" : "bg-amber-400")}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className="w-24 text-right font-medium text-slate-700">
                                      {supplier.unit_price.toFixed(2)} CHF
                                    </span>
                                    {isBest ? (
                                      <span className="w-20 text-[10px] font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full text-center">
                                        {t("bestPrice")}
                                      </span>
                                    ) : (
                                      <span className="w-20 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full text-center">
                                        +{overPercent}%
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "archiving" && (
          <ArchiveSettingsTab
            projectId={project.id}
            projectName={project.name}
            archivePath={null}
            archiveEnabled={false}
            archiveStructure="by_category"
            archiveFilenameFormat="date_sender_subject"
            archiveAttachmentsMode="subfolder"
          />
        )}

        {activeTab === "closure" && (
          <div className="space-y-4">
            <div className="rounded-md border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">{t("closureTitle")}</h3>
                  <p className="mt-1 text-xs text-slate-500">{t("closureDescription")}</p>
                </div>
                {(project.status === "active" || project.status === "on_hold") && (
                  <Link
                    href={`/projects/${project.id}/closure`}
                    className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {t("startClosure")}
                  </Link>
                )}
                {project.status === "closing" && (
                  <Link
                    href={`/projects/${project.id}/closure`}
                    className="inline-flex items-center gap-2 rounded-md border border-brand px-4 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/5"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {t("continueClosure")}
                  </Link>
                )}
                {project.status === "completed" && (
                  <Link
                    href={`/projects/${project.id}/closure`}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    {t("viewClosure")}
                  </Link>
                )}
              </div>
            </div>

            {/* Reception info + Reserves link */}
            {reception && (
              <div className="rounded-md border border-slate-200 bg-white p-6">
                <h3 className="text-sm font-semibold text-slate-800">{tc("receptionPVTitle")}</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-slate-500">{tc("receptionType")}</p>
                    <p className="mt-0.5 text-sm font-medium text-slate-700">{tc(reception.reception_type)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{tc("receptionDate")}</p>
                    <p className="mt-0.5 text-sm font-medium text-slate-700">
                      {reception.reception_date ? formatDate(reception.reception_date) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{tc("reserveStatus")}</p>
                    <p className={`mt-0.5 text-sm font-medium ${openReservesCount > 0 ? "text-red-600" : "text-green-600"}`}>
                      {openReservesCount > 0 ? `${openReservesCount} ${tc("reserveOpen").toLowerCase()}` : tc("allReservesLifted")}
                    </p>
                  </div>
                </div>
                {openReservesCount > 0 && (
                  <Link
                    href={`/projects/${project.id}/reserves`}
                    className="mt-4 inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    {tc("viewReserves")} ({openReservesCount})
                  </Link>
                )}
              </div>
            )}

            {/* Guarantee alerts */}
            <GuaranteeAlerts projectId={project.id} />
          </div>
        )}
      </div>

      {/* Task Create Modal */}
      <TaskCreateModal
        open={taskModalOpen || !!editTask}
        onClose={() => { setTaskModalOpen(false); setEditTask(null); }}
        onCreated={() => { setTaskModalOpen(false); setEditTask(null); }}
        prefill={taskModalOpen && !editTask ? { project_id: project.id } : undefined}
        editTask={editTask ? {
          id: editTask.id,
          title: editTask.title,
          project_id: editTask.project_id,
          description: editTask.description,
          assigned_to_name: editTask.assigned_to_name,
          assigned_to_company: editTask.assigned_to_company,
          priority: editTask.priority,
          status: editTask.status,
          due_date: editTask.due_date,
          reminder: editTask.reminder,
          lot_code: editTask.lot_code,
          source: editTask.source,
          source_reference: editTask.source_reference,
        } : undefined}
      />

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onEdit={(task) => { setEditTask(task); setSelectedTask(null); }}
          onDelete={(taskId) => { console.log("[Task] Delete:", taskId); setSelectedTask(null); }}
          onStatusChange={(taskId, status) => { console.log("[Task] Status:", taskId, status); setSelectedTask(null); }}
        />
      )}
    </div>
  );
}

// ── Project Emails Tab ──

function ProjectEmailsTab({ projectId }: { projectId: string }) {
  const t = useTranslations("projects");
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<EmailRecord | null>(null);
  const [search, setSearch] = useState("");

  const fetchEmails = useCallback(() => {
    fetch(`/api/projects/${projectId}/emails`)
      .then((res) => res.ok ? res.json() : { emails: [] })
      .then((data) => {
        setEmails(data.emails || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    fetchEmails();
    // Fetch all projects for the reclassification dropdown
    fetch("/api/projects/list")
      .then((res) => res.json())
      .then((data) => setAllProjects(data.projects || []))
      .catch(() => {});
  }, [fetchEmails]);

  // Client-side search filter
  const filteredEmails = useMemo(() => {
    if (!search.trim()) return emails;
    const q = search.toLowerCase();
    return emails.filter((e) =>
      (e.subject || "").toLowerCase().includes(q) ||
      (e.sender_email || "").toLowerCase().includes(q) ||
      (e.sender_name || "").toLowerCase().includes(q) ||
      (e.body_preview || "").toLowerCase().includes(q) ||
      (e.ai_summary || "").toLowerCase().includes(q)
    );
  }, [emails, search]);

  const handleEmailUpdated = useCallback(() => {
    fetchEmails();
    // Update selected email if it was reclassified away from this project
    if (selectedEmail) {
      const stillHere = emails.find((e) => e.id === selectedEmail.id);
      if (!stillHere) setSelectedEmail(null);
    }
  }, [fetchEmails, selectedEmail, emails]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-brand" />
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white">
        <div className="text-center">
          <Mail className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">{t("noEmailsYet")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-0 -mx-4 sm:-mx-6" style={{ height: "calc(100vh - 260px)" }}>
      {/* Left: email list */}
      <div className={cn(
        "flex flex-col border-r border-slate-200 overflow-hidden",
        selectedEmail ? "w-[380px] shrink-0" : "flex-1"
      )}>
        {/* Search bar */}
        <div className="px-3 py-2 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={t("searchEmails")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-8 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            {filteredEmails.length} email{filteredEmails.length !== 1 ? "s" : ""} classé{filteredEmails.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-y-auto">
          {filteredEmails.map((email) => (
            <button
              key={email.id}
              onClick={() => setSelectedEmail(email)}
              className={cn(
                "w-full text-left px-3 py-2.5 border-b border-slate-100 transition-colors hover:bg-slate-50",
                selectedEmail?.id === email.id && "bg-blue-50 border-l-2 border-l-brand"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-800 truncate">
                  {email.sender_name || email.sender_email}
                </span>
                <span className="flex-shrink-0 text-[10px] text-slate-400 ml-auto">
                  {new Date(email.received_at).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-sm text-slate-700 truncate flex-1">{email.subject}</p>
                {email.has_attachments && (
                  <Paperclip className="h-3 w-3 flex-shrink-0 text-slate-400" />
                )}
                {email.classification && (
                  <span className={cn(
                    "flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                    email.classification === "urgent" ? "bg-red-100 text-red-700" :
                    email.classification === "action_required" ? "bg-amber-100 text-amber-700" :
                    "bg-slate-100 text-slate-500"
                  )}>
                    {email.classification === "urgent" ? "Urgent" :
                     email.classification === "action_required" ? "Action" : "Info"}
                  </span>
                )}
              </div>
              {email.ai_summary ? (
                <p className="mt-1 text-[11px] text-slate-500 line-clamp-1">{email.ai_summary}</p>
              ) : email.body_preview ? (
                <p className="mt-1 text-[11px] text-slate-400 line-clamp-1">{email.body_preview}</p>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail panel */}
      {selectedEmail ? (
        <div className="flex-1 overflow-y-auto bg-white">
          <EmailDetailPanel
            email={selectedEmail}
            projects={allProjects as Project[]}
            onClose={() => setSelectedEmail(null)}
            onEmailUpdated={handleEmailUpdated}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-slate-50/50">
          <div className="text-center">
            <Mail className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-2 text-sm text-slate-400">{t("selectEmailToRead")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
