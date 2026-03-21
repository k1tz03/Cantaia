"use client";

import { useTranslations } from "next-intl";
import {
  Mail,
  CheckSquare,
  Video,
  FileText,
  Inbox,
} from "lucide-react";

export interface ActivityItem {
  type: string;
  title: string;
  user: string;
  date: string;
}

const TYPE_CONFIG: Record<
  string,
  { icon: typeof Mail; color: string; bgColor: string }
> = {
  email: { icon: Mail, color: "text-primary", bgColor: "bg-primary/10" },
  task: {
    icon: CheckSquare,
    color: "text-amber-600",
    bgColor: "bg-amber-500/10",
  },
  meeting: { icon: Video, color: "text-purple-600 dark:text-purple-400", bgColor: "bg-purple-500/10" },
  submission: {
    icon: FileText,
    color: "text-green-600",
    bgColor: "bg-green-500/10",
  },
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "maintenant";
  if (minutes < 60) return `il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  return `il y a ${days}j`;
}

export default function ActivityFeed({
  activities,
  loading,
}: {
  activities: ActivityItem[];
  loading: boolean;
}) {
  const t = useTranslations("admin");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Inbox className="mb-2 h-8 w-8" />
        <p className="text-sm">{t("noActivity")}</p>
      </div>
    );
  }

  return (
    <div className="max-h-[400px] overflow-y-auto">
      <div className="divide-y divide-border">
        {activities.map((activity, i) => {
          const config = TYPE_CONFIG[activity.type] || TYPE_CONFIG.email;
          const Icon = config.icon;

          return (
            <div
              key={`${activity.type}-${i}`}
              className="flex items-start gap-3 px-1 py-2.5"
            >
              <div
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${config.bgColor}`}
              >
                <Icon className={`h-3.5 w-3.5 ${config.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-foreground">
                  {activity.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {activity.user && (
                    <span className="font-medium text-muted-foreground">
                      {activity.user}
                      {" — "}
                    </span>
                  )}
                  {formatRelativeTime(activity.date)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
