"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { toLocalDateString } from "@/components/calendar/datetime-utils";
import { useProject } from "@/lib/hooks/use-supabase-data";
import { StatusBadge } from "@cantaia/ui";
import {
  ArrowLeft,
  Settings,
  CheckSquare,
  Mail,
  FileText,
  LayoutDashboard,
  Building2,
  MapPin,
  ShieldCheck,
  Map,
  FileSpreadsheet,
  UserCheck,
  Loader2,
  CalendarRange,
  ClipboardList,
} from "lucide-react";
import { TaskCreateModal } from "@/components/tasks/TaskCreateModal";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import type { Task } from "@cantaia/database";
import { FolderArchive } from "lucide-react";
import { ArchiveSettingsTab } from "@/components/projects/ArchiveSettingsTab";
import { ProjectOverviewTab } from "@/components/projects/ProjectOverviewTab";
import { ProjectEmailsTab } from "@/components/projects/ProjectEmailsTab";
import { ProjectTasksTab } from "@/components/projects/ProjectTasksTab";
import { ProjectMeetingsTab } from "@/components/projects/ProjectMeetingsTab";
import { ProjectVisitsTab } from "@/components/projects/ProjectVisitsTab";
import { ProjectSubmissionsTab } from "@/components/projects/ProjectSubmissionsTab";
import { ProjectPlansTab } from "@/components/projects/ProjectPlansTab";
import { ProjectClosureTab } from "@/components/projects/ProjectClosureTab";
import { ProjectPlanningTab } from "@/components/projects/ProjectPlanningTab";
import { ProjectSiteReportsTab } from "@/components/projects/ProjectSiteReportsTab";
import { useActiveProject } from "@/lib/contexts/active-project-context";
import { ProjectBreadcrumb } from "@/components/ui/ProjectBreadcrumb";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { TaskStatus } from "@cantaia/database";

const baseTabs = [
  { key: "overview", icon: LayoutDashboard },
  { key: "emails", icon: Mail },
  { key: "tasks", icon: CheckSquare },
  { key: "meetings", icon: FileText },
  { key: "visits", icon: UserCheck },
  { key: "submissions", icon: FileSpreadsheet },
  { key: "plans", icon: Map },
  { key: "planning", icon: CalendarRange },
  { key: "site-reports", icon: ClipboardList },
  // HIDDEN: Cantaia Prix tab removed from project detail (2026-04)
  // { key: "prix", icon: FileStack },
  { key: "archiving", icon: FolderArchive },
  { key: "closure", icon: ShieldCheck },
] as const;

/**
 * The eleven tabs used to sit in one wrapping row that pushed the content
 * down two lines and gave no sense of what belonged with what. They are
 * the same eleven tabs and the same `?tab=` URLs — just gathered into
 * four groups, with the sub-tabs of the active group shown underneath.
 */
const TAB_GROUPS = [
  { id: "suivi", labelKey: "group_suivi", tabs: ["overview", "tasks", "planning", "site-reports"] },
  { id: "documents", labelKey: "group_documents", tabs: ["emails", "plans", "submissions", "meetings"] },
  { id: "terrain", labelKey: "group_terrain", tabs: ["visits"] },
  { id: "cloture", labelKey: "group_cloture", tabs: ["closure", "archiving"] },
] as const;

const GROUP_FALLBACK_LABELS: Record<string, string> = {
  group_suivi: "Suivi",
  group_documents: "Documents",
  group_terrain: "Terrain",
  group_cloture: "Clôture",
};

export default function ProjectDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("projects");
  const tTasks = useTranslations("tasks");
  const activeTab = searchParams.get("tab") || "overview";
  const setActiveTab = useCallback((tab: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);

  const { project, loading: projectLoading } = useProject(params.id as string);
  const { setActiveProject } = useActiveProject();

  useEffect(() => {
    if (project?.id) {
      setActiveProject(project.id);
    }
  }, [project?.id, setActiveProject]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  // submissions now fetched directly by ProjectSubmissionsTab
  const [plans, setPlans] = useState<any[]>([]);
  const [openReservesCount, setOpenReservesCount] = useState(0);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);

  const refreshTasks = useCallback(async () => {
    if (!params.id) return;
    try {
      const res = await fetch(`/api/tasks?project_id=${params.id}&limit=1000`);
      const data = await res.json();
      if (data.success && data.tasks) setTasks(data.tasks);
    } catch (err) {
      console.error("Failed to load tasks:", err);
    }
  }, [params.id]);

  useEffect(() => {
    if (!params.id) return;
    const projectId = params.id as string;

    refreshTasks();

    fetch(`/api/pv?project_id=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.meetings) setMeetings(data.meetings);
      })
      .catch((err) => console.error("Failed to load meetings:", err));

    // Submissions loaded by ProjectSubmissionsTab directly

    fetch(`/api/plans?project_id=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.plans) setPlans(data.plans);
      })
      .catch((err) => console.error("Failed to load plans:", err));

    // Open reserves drive the badge on the Clôture tab
    (async () => {
      try {
        const supabase = createSupabaseClient();
        const { count } = await (supabase.from("reception_reserves") as any)
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .neq("status", "verified");
        setOpenReservesCount(count || 0);
      } catch {
        // Table may not exist yet — badge simply stays hidden
      }
    })();
  }, [params.id, refreshTasks]);

  if (projectLoading) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <p className="text-[#A1A1AA]">{t("projectNotFound")}</p>
      </div>
    );
  }

  const showClosureTab = ["active", "on_hold", "closing", "completed"].includes(project.status);
  const tabs = baseTabs.filter((tab) => tab.key !== "closure" || showClosureTab);

  // Group labels fall back to French until the shared message catalogue
  // picks up the new keys (see i18n-pending/I.json).
  const groupLabel = (key: string): string => {
    const fallback = GROUP_FALLBACK_LABELS[key];
    try {
      const has = (t as unknown as { has?: (k: string) => boolean }).has;
      if (has && !has(key)) return fallback;
      const value = t(key);
      // next-intl echoes the key path when a message is missing.
      return !value || value === key || value.endsWith(`.${key}`) ? fallback : value;
    } catch {
      return fallback;
    }
  };

  const availableKeys = new Set<string>(tabs.map((tb) => tb.key));
  const visibleGroups = TAB_GROUPS.map((g) => ({
    id: g.id,
    labelKey: g.labelKey as string,
    tabs: (g.tabs as readonly string[]).filter((k) => availableKeys.has(k)),
  })).filter((g) => g.tabs.length > 0);

  // The URL still carries a single `?tab=` — derive which group owns it so
  // deep links keep working exactly as before.
  const activeGroup =
    visibleGroups.find((g) => g.tabs.includes(activeTab)) ?? visibleGroups[0];
  const activeGroupTabs = tabs.filter((tb) => activeGroup.tabs.includes(tb.key));

  const openTasks = tasks.filter(
    (t) => t.status === "todo" || t.status === "in_progress"
  );
  const overdueTasks = tasks.filter(
    (t) =>
      t.due_date &&
      t.due_date < toLocalDateString(new Date()) &&
      t.status !== "done" &&
      t.status !== "cancelled"
  );

  async function handleTaskStatusChange(taskId: string, status: TaskStatus) {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success && data.task) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));
        setSelectedTask((prev) => (prev?.id === taskId ? data.task : prev));
      }
    } catch (err) {
      console.error("[Task] Status change error:", err);
    }
  }

  async function executeTaskDelete(taskId: string) {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
      }
    } catch (err) {
      console.error("[Task] Delete error:", err);
    }
    setSelectedTask(null);
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <ProjectBreadcrumb section={activeTab !== "overview" ? activeTab : undefined} />
      {/* Project header card with gradient top border */}
      <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-4 sm:p-5 shadow-sm" style={{ borderTopWidth: "3px", borderTopColor: project.color || "#F97316" }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            <Link
              href="/projects"
              className="mt-1 shrink-0 rounded-md p-2 text-[#A1A1AA] hover:bg-[#1C1C1F] hover:text-[#D4D4D8]"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <div
                  className="h-4 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <h1 className="font-display text-lg sm:text-xl font-extrabold text-[#FAFAFA] truncate">
                  {project.name}
                </h1>
                {project.code && (
                  <span className="text-sm text-[#A1A1AA]">{project.code}</span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[#A1A1AA]">
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
            className="hidden rounded-md border border-[#27272A] px-4 py-2 text-sm font-medium text-[#A1A1AA] transition-colors hover:bg-[#1C1C1F] sm:inline-flex"
          >
            <Settings className="mr-2 h-4 w-4" />
            {t("settingsTab")}
          </Link>
        </div>
      </div>

      {/* Group rail (segmented) + sub-tabs of the active group */}
      <div className="mt-6 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div
          role="tablist"
          aria-label="Sections du projet"
          className="inline-flex max-w-full overflow-x-auto rounded-lg border border-[#27272A] bg-[#18181B] p-1 scrollbar-hide"
        >
          {visibleGroups.map((group) => {
            const isActive = group.id === activeGroup.id;
            // Surface the reserves badge on the group when its sub-tabs
            // are collapsed, so it stays visible from any group.
            const groupReserves =
              !isActive && group.tabs.includes("closure") ? openReservesCount : 0;
            return (
              <button
                key={group.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(group.tabs[0])}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  isActive
                    ? "bg-[#F97316] text-[#0F0F11]"
                    : "text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
                }`}
              >
                {groupLabel(group.labelKey)}
                {groupReserves > 0 && (
                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-bold text-white">
                    {groupReserves}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-2 border-b border-[#27272A]">
          <nav className="-mb-px flex gap-x-1 overflow-x-auto scrollbar-hide">
            {activeGroupTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-[#F97316] text-[#F97316]"
                      : "border-transparent text-[#A1A1AA] hover:border-[#27272A] hover:text-[#FAFAFA]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t(`tab_${tab.key}`)}
                  {tab.key === "closure" && openReservesCount > 0 && (
                    <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#EF4444] px-1 text-[10px] font-bold text-white">
                      {openReservesCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="mt-6">
        {activeTab === "overview" && (
          <ProjectOverviewTab
            project={project}
            tasks={tasks}
            meetings={meetings}
            openTasks={openTasks}
            overdueTasks={overdueTasks}
          />
        )}

        {activeTab === "emails" && (
          <ProjectEmailsTab projectId={project.id} />
        )}

        {activeTab === "tasks" && (
          <ProjectTasksTab
            tasks={tasks}
            selectedTask={selectedTask}
            onSelectTask={setSelectedTask}
            onCreateTask={() => setTaskModalOpen(true)}
          />
        )}

        {activeTab === "meetings" && (
          <ProjectMeetingsTab meetings={meetings} projectId={project.id} />
        )}

        {activeTab === "visits" && <ProjectVisitsTab />}

        {activeTab === "submissions" && (
          <ProjectSubmissionsTab projectId={params.id as string} />
        )}

        {activeTab === "plans" && <ProjectPlansTab plans={plans} />}

        {activeTab === "planning" && (
          <ProjectPlanningTab projectId={project.id} />
        )}

        {activeTab === "site-reports" && (
          <ProjectSiteReportsTab projectId={project.id} />
        )}

        {/* HIDDEN: Cantaia Prix tab removed (2026-04) */}
        {/* {activeTab === "prix" && <ProjectPrixTab benchmark={benchmark} />} */}

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

        {activeTab === "closure" && <ProjectClosureTab project={project} />}
      </div>

      <TaskCreateModal
        open={taskModalOpen || !!editTask}
        onClose={() => { setTaskModalOpen(false); setEditTask(null); }}
        onCreated={() => { setTaskModalOpen(false); setEditTask(null); refreshTasks(); }}
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

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onEdit={(task) => { setEditTask(task); setSelectedTask(null); }}
          onDelete={(taskId) => setDeleteTaskId(taskId)}
          onStatusChange={handleTaskStatusChange}
        />
      )}

      <ConfirmDialog
        open={!!deleteTaskId}
        onClose={() => setDeleteTaskId(null)}
        onConfirm={async () => {
          if (deleteTaskId) await executeTaskDelete(deleteTaskId);
          setDeleteTaskId(null);
        }}
        title={tTasks("deleteConfirm")}
        description={tTasks("deleteDescription")}
        variant="danger"
      />
    </div>
  );
}
