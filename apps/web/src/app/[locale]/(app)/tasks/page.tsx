"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { TaskCreateModal } from "@/components/tasks/TaskCreateModal";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import { TaskPageHeader } from "@/components/tasks/TaskPageHeader";
import { TaskFilters } from "@/components/tasks/TaskFilters";
import { TaskCounters } from "@/components/tasks/TaskCounters";
import { TaskBulkActions } from "@/components/tasks/TaskBulkActions";
import { TaskListView } from "@/components/tasks/TaskListView";
import { TaskKanbanView } from "@/components/tasks/TaskKanbanView";
import {
  isOverdue, isDueToday, isDueThisWeek, isLater, computeTaskCounts,
  PRIORITY_ORDER, STATUS_ORDER,
} from "@/components/tasks/task-utils";
import type { ViewMode, SortField, SortDir, TaskCounts } from "@/components/tasks/task-utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Task, TaskStatus, TaskPriority, Project } from "@cantaia/database";

export default function TasksPage() {
  const t = useTranslations("tasks");

  const searchParams = useSearchParams();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  // Total tasks on the server (X-Total-Count); when it exceeds the fetched
  // page the list is silently truncated, so we surface a banner.
  const [totalCount, setTotalCount] = useState<number | null>(null);
  // "Mes taches" — server-side filter on the real tasks.assigned_to FK.
  const [onlyMine, setOnlyMine] = useState(false);
  // Counters come from the server (GET /api/tasks?count_only=true) so they
  // count EVERY task, not just the page the list happens to hold.
  const [counts, setCounts] = useState<TaskCounts | null>(null);

  const listQuery = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams(extra);
      if (onlyMine) params.set("assigned_to", "me");
      return params.toString();
    },
    [onlyMine]
  );

  const refreshTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?${listQuery({ limit: "1000" })}`);
      const data = await res.json();
      if (data.success) {
        if (data.tasks) setTasks(data.tasks);
        if (data.projects) setProjects(data.projects);
        const total = res.headers.get("X-Total-Count");
        setTotalCount(total !== null ? parseInt(total, 10) : null);
      }
    } catch (err) {
      console.error("Failed to load tasks:", err);
    }
  }, [listQuery]);

  const refreshCounts = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?${listQuery({ count_only: "true" })}`);
      const data = await res.json();
      if (data.success && data.counts) setCounts(data.counts as TaskCounts);
    } catch (err) {
      console.error("Failed to load task counts:", err);
    }
  }, [listQuery]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      await Promise.all([refreshTasks(), refreshCounts()]);
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [refreshTasks, refreshCounts]);

  // Deep link from global search / command palette: /tasks?taskId=<id> opens
  // the matching task's detail panel once the list has loaded.
  const deepLinkTaskId = searchParams.get("taskId");
  useEffect(() => {
    if (!deepLinkTaskId || loading) return;
    const found = tasks.find((tk) => tk.id === deepLinkTaskId);
    if (found) setSelectedTask(found);
    // Only re-run when the target id changes or the list finishes loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkTaskId, loading, tasks]);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      // Read the prefixed key, falling back to the legacy unprefixed one for one release.
      const stored =
        localStorage.getItem("cantaia_tasks_view") ||
        localStorage.getItem("tasks-view-mode");
      return (stored as ViewMode) || "list";
    }
    return "list";
  });

  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [filterDeadline, setFilterDeadline] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [sortField, setSortField] = useState<SortField>("due_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; taskId?: string; bulk?: boolean }>({ open: false });

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem("cantaia_tasks_view", mode);
  }

  const filteredTasks = useMemo(() => {
    let list = [...tasks];

    if (filterProject !== "all") {
      list = list.filter((t) => t.project_id === filterProject);
    }

    // In Kanban mode, skip the status filter — all 5 columns are always visible
    // so the user needs to see tasks in done/cancelled columns too.
    if (viewMode !== "kanban") {
      if (filterStatus === "active") {
        list = list.filter((t) => t.status !== "done" && t.status !== "cancelled");
      } else if (filterStatus !== "all") {
        list = list.filter((t) => t.status === filterStatus);
      }
    }

    if (filterPriority !== "all") {
      list = list.filter((t) => t.priority === filterPriority);
    }

    if (filterSource !== "all") {
      list = list.filter((t) => t.source === filterSource);
    }

    if (filterDeadline === "overdue") {
      list = list.filter(isOverdue);
    } else if (filterDeadline === "today") {
      list = list.filter(isDueToday);
    } else if (filterDeadline === "week") {
      list = list.filter(isDueThisWeek);
    } else if (filterDeadline === "later") {
      // Use the shared, timezone-correct helper instead of an inline
      // toISOString().split() (banned — drifts a day around midnight).
      list = list.filter(isLater);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.assigned_to_name && t.assigned_to_name.toLowerCase().includes(q))
      );
    }

    return list;
  }, [tasks, filterProject, filterStatus, filterPriority, filterSource, filterDeadline, searchQuery, viewMode]);

  const sortedTasks = useMemo(() => {
    const sorted = [...filteredTasks];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "due_date":
          cmp = (a.due_date || "9999").localeCompare(b.due_date || "9999");
          break;
        case "priority":
          cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
          break;
        case "status":
          cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          break;
        case "created_at":
          cmp = a.created_at.localeCompare(b.created_at);
          break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return sorted;
  }, [filteredTasks, sortField, sortDir]);

  // Server counts are authoritative; the local pass is only a first paint
  // fallback (same shared predicates, so the two never disagree).
  const localCounts = useMemo(() => computeTaskCounts(tasks), [tasks]);
  const activeCounts = counts ?? localCounts;
  const overdueCount = activeCounts.overdue;
  const todayCount = activeCounts.today;
  const weekCount = activeCounts.week;
  const laterCount = activeCounts.later;
  const doneCount = activeCounts.done;

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === sortedTasks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sortedTasks.map((t) => t.id)));
    }
  }

  async function handleStatusChange(taskId: string, status: TaskStatus) {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success && data.task) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));
        if (selectedTask?.id === taskId) {
          setSelectedTask(data.task);
        }
        void refreshCounts();
      }
    } catch (err) {
      console.error("[Task] Status change error:", err);
    }
  }

  /**
   * Persists a new owner. The server validates that the member belongs to the
   * org and fires the `task_assigned` notification.
   */
  async function handleAssigneeChange(
    taskId: string,
    assignedTo: string | null,
    assignedToName: string | null
  ) {
    try {
      const payload: Record<string, unknown> = { assigned_to: assignedTo };
      // Keep the free-text label in sync so list views still show a name.
      if (assignedToName) payload.assigned_to_name = assignedToName;

      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success && data.task) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));
        if (selectedTask?.id === taskId) setSelectedTask(data.task);
      } else {
        console.error("[Task] Assignee change refused:", data.error);
      }
    } catch (err) {
      console.error("[Task] Assignee change error:", err);
    }
  }

  function handleDeleteTask(taskId: string) {
    setDeleteConfirm({ open: true, taskId });
  }

  async function executeDeleteTask(taskId: string) {
    try {
      await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      void refreshCounts();
    } catch (err) {
      console.error("[Task] Delete error:", err);
    }
    setSelectedTask(null);
  }

  function handleEditFromPanel(task: Task) {
    setEditTask(task);
    setSelectedTask(null);
  }

  /** Applies the same PATCH to every selected task, then refreshes from the server. */
  async function applyBulkPatch(patch: Record<string, unknown>) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    for (const id of ids) {
      try {
        await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
      } catch (err) {
        console.error("[Task] Bulk update error on", id, err);
      }
    }

    setSelected(new Set());
    setSelectedTask(null);
    await Promise.all([refreshTasks(), refreshCounts()]);
  }

  async function handleBulkStatusChange(status: TaskStatus) {
    await applyBulkPatch({ status });
  }

  async function handleBulkPriorityChange(priority: TaskPriority) {
    await applyBulkPatch({ priority });
  }

  async function handleBulkAssign() {
    const name = prompt(t("bulkAssignPrompt"));
    if (!name || !name.trim()) return;
    await applyBulkPatch({ assigned_to_name: name.trim() });
  }

  function handleBulkDelete() {
    setDeleteConfirm({ open: true, bulk: true });
  }

  async function executeBulkDelete() {
    const ids = Array.from(selected);
    for (const id of ids) {
      try {
        await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      } catch { /* continue */ }
    }
    setTasks((prev) => prev.filter((t) => !selected.has(t.id)));
    setSelected(new Set());
    void refreshCounts();
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <TaskPageHeader
        viewMode={viewMode}
        onChangeViewMode={changeViewMode}
        onCreateTask={() => setCreateModalOpen(true)}
      />

      <TaskFilters
        projects={projects}
        filterProject={filterProject}
        setFilterProject={setFilterProject}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        filterPriority={filterPriority}
        setFilterPriority={setFilterPriority}
        filterSource={filterSource}
        setFilterSource={setFilterSource}
        filterDeadline={filterDeadline}
        setFilterDeadline={setFilterDeadline}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onlyMine={onlyMine}
        setOnlyMine={setOnlyMine}
      />

      <TaskCounters
        overdueCount={overdueCount}
        todayCount={todayCount}
        weekCount={weekCount}
        laterCount={laterCount}
        doneCount={doneCount}
      />

      {totalCount !== null && totalCount > tasks.length && (
        <div className="mb-3 rounded-md border border-[#F59E0B]/30 bg-[#F59E0B]/[0.08] px-3 py-2 text-[12px] text-[#FBBF24]">
          {t("listTruncated", { shown: tasks.length, total: totalCount })}
        </div>
      )}

      <TaskBulkActions
        selectedCount={selected.size}
        onBulkStatusChange={handleBulkStatusChange}
        onBulkPriorityChange={handleBulkPriorityChange}
        onBulkAssign={handleBulkAssign}
        onBulkDelete={handleBulkDelete}
        onClearSelection={() => setSelected(new Set())}
      />

      {viewMode === "list" && (
        <TaskListView
          tasks={sortedTasks}
          projects={projects}
          selected={selected}
          selectedTaskId={selectedTask?.id ?? null}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onToggleSort={toggleSort}
          onOpenTask={setSelectedTask}
          onStatusChange={handleStatusChange}
        />
      )}

      {viewMode === "kanban" && (
        <TaskKanbanView
          tasks={filteredTasks}
          projects={projects}
          selectedTaskId={selectedTask?.id ?? null}
          onOpenTask={setSelectedTask}
          onUpdateTasks={(updatedFiltered) => {
            // Merge optimistic updates back into the full tasks list
            const updateMap = new Map(updatedFiltered.map(t => [t.id, t]));
            setTasks(prev => prev.map(t => updateMap.get(t.id) || t));
          }}
        />
      )}

      <TaskCreateModal
        open={createModalOpen || !!editTask}
        onClose={() => {
          setCreateModalOpen(false);
          setEditTask(null);
        }}
        onCreated={async () => {
          setCreateModalOpen(false);
          setEditTask(null);
          await Promise.all([refreshTasks(), refreshCounts()]);
        }}
        projects={projects}
        editTask={
          editTask
            ? {
                id: editTask.id,
                title: editTask.title,
                project_id: editTask.project_id,
                description: editTask.description,
                assigned_to: editTask.assigned_to,
                assigned_to_name: editTask.assigned_to_name,
                assigned_to_company: editTask.assigned_to_company,
                priority: editTask.priority,
                status: editTask.status,
                due_date: editTask.due_date,
                reminder: editTask.reminder,
                lot_code: editTask.lot_code,
                source: editTask.source,
                source_reference: editTask.source_reference,
              }
            : undefined
        }
      />

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onEdit={handleEditFromPanel}
          onDelete={handleDeleteTask}
          onStatusChange={handleStatusChange}
          onAssigneeChange={handleAssigneeChange}
        />
      )}
      <ConfirmDialog
        open={deleteConfirm.open}
        onClose={() => setDeleteConfirm({ open: false })}
        onConfirm={async () => {
          if (deleteConfirm.bulk) {
            await executeBulkDelete();
          } else if (deleteConfirm.taskId) {
            await executeDeleteTask(deleteConfirm.taskId);
          }
        }}
        title={deleteConfirm.bulk ? t("bulkDeleteConfirm") : t("deleteConfirm")}
        description={deleteConfirm.bulk
          ? t("bulkDeleteDescription", { count: selected.size })
          : t("deleteDescription")}
        variant="danger"
      />
    </div>
  );
}
