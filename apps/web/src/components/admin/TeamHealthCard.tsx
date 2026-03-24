"use client";

import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Clock,
  Mail,
  Loader2,
} from "lucide-react";

export interface MemberHealth {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  overdue_tasks: number;
  in_progress_tasks: number;
  unprocessed_emails: number;
  last_sign_in: string | null;
}

function getInitials(firstName: string, lastName: string): string {
  return `${(firstName || "?")[0]}${(lastName || "?")[0]}`.toUpperCase();
}

function formatRelativeDate(dateStr: string | null): {
  text: string;
  isOld: boolean;
} {
  if (!dateStr) return { text: "—", isOld: true };
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return { text: "Aujourd'hui", isOld: false };
  if (days === 1) return { text: "Hier", isOld: false };
  if (days < 7) return { text: `il y a ${days}j`, isOld: false };
  return { text: `il y a ${days}j`, isOld: true };
}

function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    admin: "Admin",
    director: "Direction",
    project_manager: "Chef de projet",
    site_manager: "Conducteur",
    foreman: "Chef d'equipe",
    member: "Membre",
  };
  return map[role] || role;
}

export default function TeamHealthCard({
  member,
}: {
  member: MemberHealth;
}) {
  const t = useTranslations("admin");
  const lastSignIn = formatRelativeDate(member.last_sign_in);

  return (
    <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4 transition-shadow hover:shadow-sm">
      {/* Header: avatar + name + role */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F97316]/10 text-sm font-semibold text-[#F97316]">
          {getInitials(member.first_name, member.last_name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[#FAFAFA]">
            {member.first_name} {member.last_name}
          </p>
          <p className="truncate text-xs text-[#71717A]">
            {getRoleLabel(member.role)}
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {/* Overdue */}
        <div className="rounded-md bg-[#27272A] px-2 py-1.5 text-center">
          <div
            className={`text-lg font-bold ${
              member.overdue_tasks > 3
                ? "text-red-600"
                : member.overdue_tasks > 0
                  ? "text-amber-600"
                  : "text-[#71717A]"
            }`}
          >
            {member.overdue_tasks}
          </div>
          <div className="flex items-center justify-center gap-0.5 text-[10px] text-[#71717A]">
            <AlertTriangle className="h-2.5 w-2.5" />
            {t("overdueTasks")}
          </div>
        </div>

        {/* In progress */}
        <div className="rounded-md bg-[#27272A] px-2 py-1.5 text-center">
          <div className="text-lg font-bold text-[#F97316]">
            {member.in_progress_tasks}
          </div>
          <div className="flex items-center justify-center gap-0.5 text-[10px] text-[#71717A]">
            <Loader2 className="h-2.5 w-2.5" />
            {t("inProgressTasks")}
          </div>
        </div>

        {/* Emails */}
        <div className="rounded-md bg-[#27272A] px-2 py-1.5 text-center">
          <div
            className={`text-lg font-bold ${
              member.unprocessed_emails > 10
                ? "text-amber-600"
                : "text-[#71717A]"
            }`}
          >
            {member.unprocessed_emails}
          </div>
          <div className="flex items-center justify-center gap-0.5 text-[10px] text-[#71717A]">
            <Mail className="h-2.5 w-2.5" />
            Emails
          </div>
        </div>
      </div>

      {/* Last sign-in */}
      <div className="mt-2 flex items-center gap-1.5 border-t border-[#27272A] pt-2">
        <Clock className="h-3 w-3 text-[#71717A]" />
        <span
          className={`text-xs ${
            lastSignIn.isOld ? "font-medium text-amber-600" : "text-[#71717A]"
          }`}
        >
          {lastSignIn.isOld && member.last_sign_in
            ? `${t("inactive")} — ${lastSignIn.text}`
            : lastSignIn.text}
        </span>
      </div>
    </div>
  );
}
