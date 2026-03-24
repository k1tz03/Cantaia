"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Calendar, AlertTriangle } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { isOverdue, formatDateShort, PRIORITY_CONFIG, KANBAN_COLUMNS } from "./task-utils";
import type { Task, Project, TaskStatus } from "@cantaia/database";

interface TaskKanbanViewProps {
  tasks: Task[];
  projects: Project[];
  selectedTaskId: string | null;
  onOpenTask: (task: Task) => void;
  onUpdateTasks?: (tasks: Task[]) => void;
}

const COLUMN_STYLES: Record<string, { headerBg: string; headerColor: string; accentColor: string; countBg: string; countColor: string; dropHighlight: string }> = {
  todo: {
    headerBg: "bg-blue-500/10",
    headerColor: "text-blue-300",
    accentColor: "border-t-blue-500",
    countBg: "bg-blue-500/20",
    countColor: "text-blue-300",
    dropHighlight: "ring-blue-400 bg-blue-500/10",
  },
  in_progress: {
    headerBg: "bg-amber-500/10",
    headerColor: "text-amber-300",
    accentColor: "border-t-amber-500",
    countBg: "bg-amber-500/20",
    countColor: "text-amber-300",
    dropHighlight: "ring-amber-400 bg-amber-500/10",
  },
  waiting: {
    headerBg: "bg-orange-500/10",
    headerColor: "text-orange-300",
    accentColor: "border-t-orange-400",
    countBg: "bg-orange-500/20",
    countColor: "text-orange-300",
    dropHighlight: "ring-orange-400 bg-orange-500/10",
  },
  done: {
    headerBg: "bg-emerald-500/10",
    headerColor: "text-emerald-300",
    accentColor: "border-t-emerald-500",
    countBg: "bg-emerald-500/20",
    countColor: "text-emerald-300",
    dropHighlight: "ring-emerald-400 bg-emerald-500/10",
  },
  cancelled: {
    headerBg: "bg-[#27272A]",
    headerColor: "text-[#71717A]",
    accentColor: "border-t-[#52525B]",
    countBg: "bg-[#27272A]",
    countColor: "text-[#71717A]",
    dropHighlight: "ring-[#52525B] bg-[#27272A]/50",
  },
};

export function TaskKanbanView({ tasks, projects, selectedTaskId, onOpenTask, onUpdateTasks }: TaskKanbanViewProps) {
  const t = useTranslations("tasks");
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [flashTaskId, setFlashTaskId] = useState<string | null>(null);

  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects) {
      map.set(p.id, p);
    }
    return map;
  }, [projects]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const triggerFlash = useCallback((taskId: string) => {
    setFlashTaskId(taskId);
    setTimeout(() => setFlashTaskId(null), 600);
  }, []);

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const newStatus = over.id as TaskStatus;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;
    if (!KANBAN_COLUMNS.includes(newStatus)) return;

    // Optimistic update
    const prevTasks = [...tasks];
    const updated = tasks.map((t) =>
      t.id === taskId ? { ...t, status: newStatus as Task["status"] } : t
    );
    onUpdateTasks?.(updated as Task[]);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update task");
      triggerFlash(taskId);
    } catch (err) {
      console.error("[Kanban] Drag update failed:", err);
      onUpdateTasks?.(prevTasks);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="mt-4 flex gap-3 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map((status) => {
          const colTasks = tasks.filter((t) => t.status === status);
          return (
            <KanbanColumn
              key={status}
              status={status}
              tasks={colTasks}
              projectMap={projectMap}
              selectedTaskId={selectedTaskId}
              onOpenTask={onOpenTask}
              flashTaskId={flashTaskId}
              t={t}
            />
          );
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
        {activeTask ? (
          <TaskCard
            task={activeTask}
            project={projectMap.get(activeTask.project_id || "")}
            selectedTaskId={null}
            onOpenTask={() => {}}
            t={t}
            isDragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// --- Droppable Column ---
function KanbanColumn({
  status,
  tasks,
  projectMap,
  selectedTaskId,
  onOpenTask,
  flashTaskId,
  t,
}: {
  status: string;
  tasks: Task[];
  projectMap: Map<string, Project>;
  selectedTaskId: string | null;
  onOpenTask: (task: Task) => void;
  flashTaskId: string | null;
  t: any;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const style = COLUMN_STYLES[status] || COLUMN_STYLES.todo;
  const statusKey = `status${status.charAt(0).toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())}` as "statusTodo";

  return (
    <div
      ref={setNodeRef}
      className={`flex w-[280px] shrink-0 flex-col rounded-xl border border-[#27272A] bg-[#18181B] shadow-sm border-t-[3px] ${style.accentColor} transition-all duration-150 ${
        isOver ? `ring-2 ${style.dropHighlight}` : ""
      }`}
    >
      {/* Column header */}
      <div className={`flex items-center justify-between px-3.5 py-3 ${style.headerBg} rounded-t-lg`}>
        <h3 className={`text-xs font-bold uppercase tracking-wide ${style.headerColor}`}>
          {t(statusKey)}
        </h3>
        <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${style.countBg} ${style.countColor}`}>
          {tasks.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 320px)" }}>
        {tasks.map((task) => (
          <DraggableTaskCard
            key={task.id}
            task={task}
            project={projectMap.get(task.project_id || "")}
            selectedTaskId={selectedTaskId}
            onOpenTask={onOpenTask}
            isFlashing={flashTaskId === task.id}
            t={t}
          />
        ))}
        {tasks.length === 0 && (
          <div className={`flex flex-col items-center justify-center py-8 transition-colors ${isOver ? "opacity-60" : ""}`}>
            <div className="h-8 w-8 rounded-full bg-[#27272A] flex items-center justify-center mb-2">
              <div className="h-3 w-3 rounded-full bg-[#3F3F46]" />
            </div>
            <p className="text-xs text-[#71717A]">{t("noTasksInColumn")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Draggable Card Wrapper ---
function DraggableTaskCard({
  task,
  project,
  selectedTaskId,
  onOpenTask,
  isFlashing,
  t,
}: {
  task: Task;
  project: Project | undefined;
  selectedTaskId: string | null;
  onOpenTask: (task: Task) => void;
  isFlashing?: boolean;
  t: any;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  const style = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    cursor: "grab",
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <TaskCard
        task={task}
        project={project}
        selectedTaskId={selectedTaskId}
        onOpenTask={onOpenTask}
        isFlashing={isFlashing}
        t={t}
      />
    </div>
  );
}

// --- Task Card (pure render) ---
function TaskCard({
  task,
  project,
  selectedTaskId,
  onOpenTask,
  t,
  isDragging,
  isFlashing,
}: {
  task: Task;
  project: Project | undefined;
  selectedTaskId: string | null;
  onOpenTask: (task: Task) => void;
  t: any;
  isDragging?: boolean;
  isFlashing?: boolean;
}) {
  const overdue = isOverdue(task);
  const priorityCfg = PRIORITY_CONFIG[task.priority];

  return (
    <div
      onClick={() => !isDragging && onOpenTask(task)}
      className={`group rounded-xl border bg-[#18181B] p-3 transition-all duration-150 ${
        isDragging ? "shadow-lg ring-2 ring-[#F97316]/30 rotate-2 opacity-80" : "hover:shadow-md"
      } ${
        isFlashing ? "animate-kanban-flash" : ""
      } ${
        overdue
          ? "border-red-500/20 bg-red-500/5"
          : "border-[#27272A] hover:border-[#3F3F46]"
      } ${selectedTaskId === task.id ? "ring-2 ring-[#F97316]/30 border-[#F97316]/30" : ""}`}
    >
      {/* Priority bar at top */}
      <div className={`-mx-3 -mt-3 mb-2.5 h-1 rounded-t-xl ${priorityCfg.dot}`} />

      {/* Priority indicator + title */}
      <div className="flex items-start gap-2.5">
        <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${priorityCfg.dot}`} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-medium text-[#FAFAFA] leading-snug">
            {task.title}
          </p>
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        {project && (
          <span className="inline-flex items-center gap-1 rounded-md bg-[#27272A] px-1.5 py-0.5 text-[10px] font-medium text-[#D4D4D8]">
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{ backgroundColor: project.color || "#9CA3AF" }}
            />
            <span className="truncate max-w-[100px]">{project.name}</span>
          </span>
        )}
        <span
          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${priorityCfg.color} ${priorityCfg.bg}`}
        >
          {t(`priority${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}` as "priorityUrgent")}
        </span>
      </div>

      {/* Date */}
      {task.due_date && (
        <div className="mt-2 flex items-center gap-1">
          {overdue ? (
            <AlertTriangle className="h-3 w-3 text-red-500" />
          ) : (
            <Calendar className="h-3 w-3 text-[#71717A]" />
          )}
          <span
            className={`text-[11px] font-medium ${
              overdue
                ? "text-red-400"
                : task.status === "done"
                  ? "text-emerald-400"
                  : "text-[#71717A]"
            }`}
          >
            {formatDateShort(task.due_date)}
          </span>
        </div>
      )}
    </div>
  );
}
