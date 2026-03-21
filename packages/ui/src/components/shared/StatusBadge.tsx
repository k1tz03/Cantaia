import { cn } from "../../lib/utils";

type StatusVariant =
  | "planning"
  | "active"
  | "paused"
  | "on_hold"
  | "closing"
  | "completed"
  | "archived"
  | "open"
  | "todo"
  | "in_progress"
  | "waiting"
  | "done"
  | "cancelled";

const variantStyles: Record<StatusVariant, string> = {
  planning: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  paused: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  on_hold: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  closing: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  completed: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  archived: "bg-gray-500/10 text-gray-500 dark:text-gray-400",
  open: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  todo: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  in_progress: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  waiting: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  done: "bg-green-500/10 text-green-700 dark:text-green-400",
  cancelled: "bg-red-500/10 text-red-700 dark:text-red-400",
};

interface StatusBadgeProps {
  status: StatusVariant;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const displayLabel = label ?? status.replace("_", " ");

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        variantStyles[status],
        className
      )}
    >
      {displayLabel}
    </span>
  );
}
