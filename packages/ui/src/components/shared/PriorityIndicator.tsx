import { cn } from "../../lib/utils";

type Priority = "low" | "medium" | "high" | "urgent";

const priorityConfig: Record<
  Priority,
  { color: string; icon: string; label: Record<string, string> }
> = {
  low: {
    color: "text-slate-400",
    icon: "↓",
    label: { fr: "Basse", en: "Low", de: "Niedrig" },
  },
  medium: {
    color: "text-blue-500",
    icon: "→",
    label: { fr: "Moyenne", en: "Medium", de: "Mittel" },
  },
  high: {
    color: "text-amber-500",
    icon: "↑",
    label: { fr: "Haute", en: "High", de: "Hoch" },
  },
  urgent: {
    color: "text-red-600",
    icon: "⚡",
    label: { fr: "Urgente", en: "Urgent", de: "Dringend" },
  },
};

interface PriorityIndicatorProps {
  priority: Priority;
  locale?: string;
  showLabel?: boolean;
  className?: string;
}

export function PriorityIndicator({
  priority,
  locale = "fr",
  showLabel = true,
  className,
}: PriorityIndicatorProps) {
  const config = priorityConfig[priority];

  return (
    <span
      className={cn("inline-flex items-center gap-1 text-sm", config.color, className)}
      title={config.label[locale] ?? config.label.en}
    >
      <span>{config.icon}</span>
      {showLabel && (
        <span className="font-medium">
          {config.label[locale] ?? config.label.en}
        </span>
      )}
    </span>
  );
}
