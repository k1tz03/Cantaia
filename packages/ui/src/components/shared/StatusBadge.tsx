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
  planning: "bg-blue-100 text-blue-700",
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  on_hold: "bg-orange-100 text-orange-700",
  closing: "bg-purple-100 text-purple-700",
  completed: "bg-slate-100 text-slate-600",
  archived: "bg-gray-100 text-gray-500",
  open: "bg-blue-100 text-blue-700",
  todo: "bg-blue-100 text-blue-700",
  in_progress: "bg-indigo-100 text-indigo-700",
  waiting: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
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
