"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Plus,
  List,
  LayoutGrid,
  Search,
  Mail,
  FileText,
  Hand,
  Shield,
  ArrowUpDown,
  CheckSquare,
  Trash2,
  UserPlus,
} from "lucide-react";
import { TaskCreateModal } from "@/components/tasks/TaskCreateModal";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import type { Task, TaskStatus, TaskPriority, TaskSource, Project } from "@cantaia/database";

const tasks: Task[] = [];
const projects: Project[] = [];

type ViewMode = "list" | "kanban";
type SortField = "title" | "due_date" | "priority" | "status" | "created_at";
type SortDir = "asc" | "desc";

const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER: Record<TaskStatus, number> = { todo: 0, in_progress: 1, waiting: 2, done: 3, cancelled: 4 };

const KANBAN_COLUMNS: TaskStatus[] = ["todo", "in_progress", "waiting", "done"];

function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === "done" || task.status === "cancelled") return false;
  return task.due_date < new Date().toISOString().split("T")[0];
}

function isDueToday(task: Task): boolean {
  if (!task.due_date || task.status === "done" || task.status === "cancelled") return false;
  return task.due_date === new Date().toISOString().split("T")[0];
}

function isDueThisWeek(task: Task): boolean {
  if (!task.due_date || task.status === "done" || task.status === "cancelled") return false;
  const today = new Date();
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
  const dd = task.due_date;
  const todayStr = today.toISOString().split("T")[0];
  const endStr = endOfWeek.toISOString().split("T")[0];
  return dd >= todayStr && dd <= endStr;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string; dot: string }> = {
  urgent: { label: "Urgente", color: "text-red-700", bg: "bg-red-50", dot: "bg-red-500" },
  high: { label: "Haute", color: "text-red-600", bg: "bg-red-50", dot: "bg-red-400" },
  medium: { label: "Moyenne", color: "text-amber-600", bg: "bg-amber-50", dot: "bg-amber-400" },
  low: { label: "Basse", color: "text-green-600", bg: "bg-green-50", dot: "bg-green-400" },
};

const SOURCE_CONFIG: Record<TaskSource, { icon: React.ElementType; label: string }> = {
  email: { icon: Mail, label: "Email" },
  meeting: { icon: FileText, label: "PV" },
  manual: { icon: Hand, label: "Manuel" },
  reserve: { icon: Shield, label: "Réserve" },
};

export default function TasksPage() {
  const t = useTranslations("tasks");

  // View mode (persisted in localStorage)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("tasks-view-mode") as ViewMode) || "list";
    }
    return "list";
  });

  // Filters
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [filterDeadline, setFilterDeadline] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Sort (list mode)
  const [sortField, setSortField] = useState<SortField>("due_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modal & Panel state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem("tasks-view-mode", mode);
  }

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    let list = [...tasks];

    // Project filter
    if (filterProject !== "all") {
      list = list.filter((t) => t.project_id === filterProject);
    }

    // Status filter
    if (filterStatus === "active") {
      list = list.filter((t) => t.status !== "done" && t.status !== "cancelled");
    } else if (filterStatus !== "all") {
      list = list.filter((t) => t.status === filterStatus);
    }

    // Priority filter
    if (filterPriority !== "all") {
      list = list.filter((t) => t.priority === filterPriority);
    }

    // Source filter
    if (filterSource !== "all") {
      list = list.filter((t) => t.source === filterSource);
    }

    // Deadline filter
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

    // Search
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
  }, [filterProject, filterStatus, filterPriority, filterSource, filterDeadline, searchQuery]);

  // Sorted tasks (for list view)
  const sortedTasks = useMemo(() => {
    const tasks = [...filteredTasks];
    tasks.sort((a, b) => {
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
    return tasks;
  }, [filteredTasks, sortField, sortDir]);

  // Counters
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

  function getProjectForTask(task: Task) {
    return projects.find((p) => p.id === task.project_id);
  }

  function openTaskDetail(task: Task) {
    setSelectedTask(task);
  }

  function handleEditFromPanel(task: Task) {
    setEditTask(task);
    setSelectedTask(null);
  }

  function handleDeleteTask(taskId: string) {
    if (!confirm(t("deleteConfirm"))) return;
    console.log("[Task] Deleting:", taskId);
    setSelectedTask(null);
  }

  function handleStatusChange(taskId: string, status: TaskStatus) {
    console.log("[Task] Status change:", taskId, "→", status);
    setSelectedTask(null);
  }

  function handleBulkStatusChange(status: TaskStatus) {
    const ids = Array.from(selected);
    console.log("[Task] Bulk status change:", ids.length, "tasks →", status);
    // Mock — in production: POST /api/tasks/bulk-update
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
    if (!confirm(t("bulkDeleteConfirm"))) return;
    const ids = Array.from(selected);
    console.log("[Task] Bulk delete:", ids.length, "tasks");
    setSelected(new Set());
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">{t("title")}</h1>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => changeViewMode("list")}
              className={`flex items-center gap-1 rounded-l-md px-3 py-1.5 text-xs font-medium ${
                viewMode === "list" ? "bg-brand text-white" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              {t("viewList")}
            </button>
            <button
              type="button"
              onClick={() => changeViewMode("kanban")}
              className={`flex items-center gap-1 rounded-r-md px-3 py-1.5 text-xs font-medium ${
                viewMode === "kanban" ? "bg-brand text-white" : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              {t("viewKanban")}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
          >
            <Plus className="h-4 w-4" />
            {t("newTask")}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {/* Project filter */}
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
        >
          <option value="all">{t("allProjects")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
        >
          <option value="active">{t("filterActive")}</option>
          <option value="all">{t("filterAll")}</option>
          <option value="todo">{t("statusTodo")}</option>
          <option value="in_progress">{t("statusInProgress")}</option>
          <option value="waiting">{t("statusWaiting")}</option>
          <option value="done">{t("statusDone")}</option>
        </select>

        {/* Priority filter */}
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
        >
          <option value="all">{t("allPriorities")}</option>
          <option value="urgent">{t("priorityUrgent")}</option>
          <option value="high">{t("priorityHigh")}</option>
          <option value="medium">{t("priorityMedium")}</option>
          <option value="low">{t("priorityLow")}</option>
        </select>

        {/* Source filter */}
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
        >
          <option value="all">{t("allSources")}</option>
          <option value="email">{t("sourceEmail")}</option>
          <option value="meeting">{t("sourceMeeting")}</option>
          <option value="manual">{t("sourceManual")}</option>
          <option value="reserve">{t("sourceReserve")}</option>
        </select>

        {/* Deadline filter */}
        <select
          value={filterDeadline}
          onChange={(e) => setFilterDeadline(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
        >
          <option value="all">{t("allDeadlines")}</option>
          <option value="overdue">{t("overdue")}</option>
          <option value="today">{t("today")}</option>
          <option value="week">{t("thisWeek")}</option>
          <option value="later">{t("later")}</option>
        </select>

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-56 rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Counters */}
      <div className="mt-3 flex items-center gap-4 text-xs">
        <span className={`font-medium ${overdueCount > 0 ? "text-red-600" : "text-gray-400"}`}>
          {t("overdue")} : {overdueCount}
        </span>
        <span className="text-gray-300">|</span>
        <span className="font-medium text-gray-600">{t("today")} : {todayCount}</span>
        <span className="text-gray-300">|</span>
        <span className="font-medium text-gray-600">{t("thisWeek")} : {weekCount}</span>
        <span className="text-gray-300">|</span>
        <span className="font-medium text-gray-500">{t("later")} : {laterCount}</span>
        <span className="text-gray-300">|</span>
        <span className="font-medium text-gray-400">{t("statusDone")} : {doneCount}</span>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="mt-3 flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-2">
          <span className="text-sm font-medium text-blue-700">
            {selected.size} {t("selected")}
          </span>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                handleBulkStatusChange(e.target.value as TaskStatus);
                e.target.value = "";
              }
            }}
            className="rounded border border-blue-200 bg-white px-2 py-1 text-xs text-gray-700"
          >
            <option value="">{t("changeStatus")}</option>
            <option value="todo">{t("statusTodo")}</option>
            <option value="in_progress">{t("statusInProgress")}</option>
            <option value="waiting">{t("statusWaiting")}</option>
            <option value="done">{t("statusDone")}</option>
          </select>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                handleBulkPriorityChange(e.target.value as TaskPriority);
                e.target.value = "";
              }
            }}
            className="rounded border border-blue-200 bg-white px-2 py-1 text-xs text-gray-700"
          >
            <option value="">{t("changePriority")}</option>
            <option value="urgent">{t("priorityUrgent")}</option>
            <option value="high">{t("priorityHigh")}</option>
            <option value="medium">{t("priorityMedium")}</option>
            <option value="low">{t("priorityLow")}</option>
          </select>
          <button
            type="button"
            onClick={handleBulkAssign}
            className="flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-blue-100"
          >
            <UserPlus className="h-3 w-3" />
            {t("bulkAssign")}
          </button>
          <button
            type="button"
            onClick={handleBulkDelete}
            className="flex items-center gap-1 rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3 w-3" />
            {t("bulkDelete")}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-blue-600 hover:text-blue-800"
          >
            {t("clearSelection")}
          </button>
        </div>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.size === sortedTasks.length && sortedTasks.length > 0}
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                </th>
                <th
                  className="cursor-pointer px-3 py-2.5 text-left text-xs font-semibold text-gray-500"
                  onClick={() => toggleSort("title")}
                >
                  <span className="flex items-center gap-1">
                    {t("colTask")}
                    <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">
                  {t("colProject")}
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">
                  {t("colAssigned")}
                </th>
                <th
                  className="cursor-pointer px-3 py-2.5 text-left text-xs font-semibold text-gray-500"
                  onClick={() => toggleSort("due_date")}
                >
                  <span className="flex items-center gap-1">
                    {t("colDeadline")}
                    <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th
                  className="cursor-pointer px-3 py-2.5 text-left text-xs font-semibold text-gray-500"
                  onClick={() => toggleSort("priority")}
                >
                  <span className="flex items-center gap-1">
                    {t("colPriority")}
                    <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">
                  {t("colSource")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedTasks.map((task) => {
                const project = getProjectForTask(task);
                const overdue = isOverdue(task);
                const isDone = task.status === "done";
                const priorityCfg = PRIORITY_CONFIG[task.priority];
                const sourceCfg = SOURCE_CONFIG[task.source];
                const SourceIcon = sourceCfg.icon;

                return (
                  <tr
                    key={task.id}
                    onClick={() => openTaskDetail(task)}
                    className={`cursor-pointer transition-colors hover:bg-gray-50 ${
                      overdue ? "bg-red-50/50" : ""
                    } ${isDone ? "opacity-60" : ""} ${
                      selectedTask?.id === task.id ? "bg-blue-50" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(task.id)}
                        onChange={() => toggleSelect(task.id)}
                        className="h-3.5 w-3.5 rounded border-gray-300"
                      />
                    </td>
                    <td className="max-w-[300px] px-3 py-2.5">
                      <p
                        className={`text-sm font-medium ${
                          isDone
                            ? "text-gray-400 line-through"
                            : "text-gray-900"
                        }`}
                      >
                        {task.title}
                      </p>
                      {task.lot_code && (
                        <span className="text-[10px] text-gray-400">{task.lot_code}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {project && (
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: project.color }}
                          />
                          <span className="text-xs text-gray-600">
                            {project.name.length > 18
                              ? project.name.slice(0, 18) + "..."
                              : project.name}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-600">
                      {task.assigned_to_name || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {task.due_date ? (
                        <span
                          className={`text-xs font-medium ${
                            overdue
                              ? "text-red-600"
                              : isDone
                                ? "text-gray-400"
                                : "text-gray-600"
                          }`}
                        >
                          {formatDateShort(task.due_date)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityCfg.color} ${priorityCfg.bg}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${priorityCfg.dot}`} />
                        {t(`priority${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}` as "priorityUrgent")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        <SourceIcon className="h-3 w-3" />
                        {t(`source${task.source.charAt(0).toUpperCase() + task.source.slice(1)}` as "sourceEmail")}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {sortedTasks.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                    <CheckSquare className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                    {t("noTasks")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Kanban View */}
      {viewMode === "kanban" && (
        <div className="mt-4 flex gap-4 overflow-x-auto pb-4">
          {KANBAN_COLUMNS.map((status) => {
            const colTasks = filteredTasks.filter((t) => t.status === status);
            const statusKey = `status${status.charAt(0).toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}` as "statusTodo";
            return (
              <div
                key={status}
                className="flex w-[280px] shrink-0 flex-col rounded-lg border border-gray-200 bg-gray-50"
              >
                {/* Column header */}
                <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2.5">
                  <h3 className="text-xs font-semibold uppercase text-gray-600">
                    {t(statusKey)} ({colTasks.length})
                  </h3>
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 320px)" }}>
                  {colTasks.map((task) => {
                    const project = getProjectForTask(task);
                    const overdue = isOverdue(task);
                    const priorityCfg = PRIORITY_CONFIG[task.priority];

                    return (
                      <div
                        key={task.id}
                        onClick={() => openTaskDetail(task)}
                        className={`cursor-pointer rounded-md border bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${
                          overdue ? "border-red-200" : "border-gray-200"
                        } ${selectedTask?.id === task.id ? "ring-2 ring-brand/30" : ""}`}
                      >
                        <p className="line-clamp-2 text-sm font-medium text-gray-900">
                          {task.title}
                        </p>
                        <div className="mt-2 flex items-center justify-between">
                          {project && (
                            <span className="flex items-center gap-1 text-[10px] text-gray-500">
                              <span
                                className="inline-block h-2 w-2 rounded-full"
                                style={{ backgroundColor: project.color }}
                              />
                              {project.name.length > 16
                                ? project.name.slice(0, 16) + "..."
                                : project.name}
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${priorityCfg.color} ${priorityCfg.bg}`}
                          >
                            <span className={`h-1 w-1 rounded-full ${priorityCfg.dot}`} />
                            {t(`priority${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}` as "priorityUrgent")}
                          </span>
                        </div>
                        {task.due_date && (
                          <div className="mt-1.5">
                            <span
                              className={`text-[10px] font-medium ${
                                overdue ? "text-red-600" : task.status === "done" ? "text-green-600" : "text-gray-500"
                              }`}
                            >
                              {formatDateShort(task.due_date)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <p className="py-4 text-center text-xs text-gray-400">{t("noTasksInColumn")}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <TaskCreateModal
        open={createModalOpen || !!editTask}
        onClose={() => {
          setCreateModalOpen(false);
          setEditTask(null);
        }}
        onCreated={() => {
          setCreateModalOpen(false);
          setEditTask(null);
        }}
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

      {/* Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onEdit={handleEditFromPanel}
          onDelete={handleDeleteTask}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
