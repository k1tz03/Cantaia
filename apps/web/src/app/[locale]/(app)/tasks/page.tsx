"use client";

import { useState, useEffect, useMemo } from "react";
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
  isOverdue, isDueToday, isDueThisWeek,
  PRIORITY_ORDER, STATUS_ORDER,
} from "@/components/tasks/task-utils";
import type { ViewMode, SortField, SortDir } from "@/components/tasks/task-utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Task, TaskStatus, TaskPriority, Project } from "@cantaia/database";

export default function TasksPage() {
  const t = useTranslations("tasks");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  async function refreshTasks() {
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      if (data.success) {
        if (data.tasks) setTasks(data.tasks);
        if (data.projects) setProjects(data.projects);
      }
    } catch (err) {
      console.error("Failed to load tasks:", err);
    }
  }

  useEffect(() => {
    async function load() {
      await refreshTasks();
      setLoading(false);
    }
    load();
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("tasks-view-mode") as ViewMode) || "list";
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
    localStorage.setItem("tasks-view-mode", mode);
  }

  const filteredTasks = useMemo(() => {
    let list = [...tasks];

    if (filterProject !== "all") {
      list = list.filter((t) => t.project_id === filterProject);
    }

    if (filterStatus === "active") {
      list = list.filter((t) => t.status !== "done" && t.status !== "cancelled");
    } else if (filterStatus !== "all") {
      list = list.filter((t) => t.status === filterStatus);
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
      list = list.filter((t) => {
        if (!t.due_date || t.status === "done" || t.status === "cancelled") return false;
        const endOfWeek = new Date();
        endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
        return t.due_date > endOfWeek.toISOString().split("T")[0];
      });
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
  }, [tasks, filterProject, filterStatus, filterPriority, filterSource, filterDeadline, searchQuery]);

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

  const allActiveTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const overdueCount = allActiveTasks.filter(isOverdue).length;
  const todayCount = allActiveTasks.filter(isDueToday).length;
  const weekCount = allActiveTasks.filter(isDueThisWeek).length;
  const laterCount = allActiveTasks.filter((t) => {
    if (!t.due_date) return true;
    const endOfWeek = new Date();
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
    return t.due_date > endOfWeek.toISOString().split("T")[0];
  }).length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

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
      }
    } catch (err) {
      console.error("[Task] Status change error:", err);
    }
  }

  function handleDeleteTask(taskId: string) {
    setDeleteConfirm({ open: true, taskId });
  }

  async function executeDeleteTask(taskId: string) {
    try {
      await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      console.error("[Task] Delete error:", err);
    }
    setSelectedTask(null);
  }

  function handleEditFromPanel(task: Task) {
    setEditTask(task);
    setSelectedTask(null);
  }

  function handleBulkStatusChange(status: TaskStatus) {
    const ids = Array.from(selected);
    console.log("[Task] Bulk status change:", ids.length, "tasks →", status);
    setSelected(new Set());
  }

  function handleBulkPriorityChange(priority: TaskPriority) {
    const ids = Array.from(selected);
    console.log("[Task] Bulk priority change:", ids.length, "tasks →", priority);
    setSelected(new Set());
  }

  function handleBulkAssign() {
    const name = prompt(t("bulkAssignPrompt"));
    if (!name) return;
    const ids = Array.from(selected);
    console.log("[Task] Bulk assign:", ids.length, "tasks →", name);
    setSelected(new Set());
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
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
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
      />

      <TaskCounters
        overdueCount={overdueCount}
        todayCount={todayCount}
        weekCount={weekCount}
        laterCount={laterCount}
        doneCount={doneCount}
      />

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
          try {
            const res = await fetch("/api/tasks");
            const data = await res.json();
            if (data.success) {
              if (data.tasks) setTasks(data.tasks);
              if (data.projects) setProjects(data.projects);
            }
          } catch {}
        }}
        projects={projects}
        editTask={
          editTask
            ? {
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
