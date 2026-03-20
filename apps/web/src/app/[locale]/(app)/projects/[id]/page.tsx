"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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
  FileStack,
  FileSpreadsheet,
  UserCheck,
  Loader2,
  CalendarRange,
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
import { ProjectPrixTab } from "@/components/projects/ProjectPrixTab";
import { ProjectClosureTab } from "@/components/projects/ProjectClosureTab";
import { ProjectPlanningTab } from "@/components/projects/ProjectPlanningTab";
import { useActiveProject } from "@/lib/contexts/active-project-context";
import { ProjectBreadcrumb } from "@/components/ui/ProjectBreadcrumb";

const baseTabs = [
  { key: "overview", icon: LayoutDashboard },
  { key: "emails", icon: Mail },
  { key: "tasks", icon: CheckSquare },
  { key: "meetings", icon: FileText },
  { key: "visits", icon: UserCheck },
  { key: "submissions", icon: FileSpreadsheet },
  { key: "plans", icon: Map },
  { key: "planning", icon: CalendarRange },
  { key: "prix", icon: FileStack },
  { key: "archiving", icon: FolderArchive },
  { key: "closure", icon: ShieldCheck },
] as const;

export default function ProjectDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("projects");
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
  const [benchmark, setBenchmark] = useState<any[]>([]);

  useEffect(() => {
    if (!params.id) return;
    const projectId = params.id as string;

    fetch(`/api/tasks?project_id=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.tasks) setTasks(data.tasks);
      })
      .catch((err) => console.error("Failed to load tasks:", err));

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

    fetch(`/api/pricing/benchmark?project_id=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.items) setBenchmark(data.items);
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
      <ProjectBreadcrumb section={activeTab !== "overview" ? activeTab : undefined} />
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

        {activeTab === "prix" && <ProjectPrixTab benchmark={benchmark} />}

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
