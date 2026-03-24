"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FileText, Clock, Plus } from "lucide-react";
import { formatDate } from "@/lib/mock-data";

export function ProjectMeetingsTab({
  meetings,
  projectId,
}: {
  meetings: any[];
  projectId: string;
}) {
  const t = useTranslations("projects");

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#71717A]">
          {meetings.length} PV
        </p>
        <Link
          href={`/pv-chantier/nouveau?project_id=${projectId}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("newMeeting")}
        </Link>
      </div>
      {meetings.length > 0 ? (
        <div className="mt-3 space-y-2">
          {[...meetings].sort((a: any, b: any) => new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime()).map((meeting) => {
            const actionsCount = meeting.pv_content?.sections?.reduce(
              (total: number, s: any) => total + (s.actions?.length || 0),
              0
            ) || 0;
            const statusColors: Record<string, string> = {
              scheduled: "bg-[#27272A] text-[#FAFAFA]",
              recording: "bg-red-500/10 text-red-700 dark:text-red-400",
              transcribing: "bg-[#F97316]/10 text-[#F97316]",
              generating_pv: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
              review: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
              finalized: "bg-green-500/10 text-green-700 dark:text-green-400",
              sent: "bg-green-500/10 text-green-800 dark:text-green-400",
            };
            const statusLabels: Record<string, string> = {
              scheduled: "Brouillon",
              recording: "Enregistrement",
              transcribing: "Transcription",
              generating_pv: "Génération",
              review: "En relecture",
              finalized: "Finalisé",
              sent: "Envoyé",
            };
            return (
              <Link
                key={meeting.id}
                href={`/pv-chantier/${meeting.id}`}
                className="flex items-center gap-4 rounded-md border border-[#27272A] bg-[#0F0F11] p-4 transition-colors hover:bg-[#27272A]"
              >
                <FileText className="h-5 w-5 flex-shrink-0 text-[#71717A]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#FAFAFA] truncate">
                    {meeting.title}
                    {meeting.meeting_number != null && (
                      <span className="ml-1 text-xs text-[#71717A]">
                        #{meeting.meeting_number}
                      </span>
                    )}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-[#71717A]">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(meeting.meeting_date)}
                    </span>
                    <span>{actionsCount} action{actionsCount !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[meeting.status] || "bg-[#27272A] text-[#FAFAFA]"}`}>
                  {statusLabels[meeting.status] || meeting.status}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 flex h-40 flex-col items-center justify-center rounded-md border border-dashed border-[#27272A] bg-[#0F0F11]">
          <FileText className="h-8 w-8 text-[#71717A]" />
          <p className="mt-2 text-sm text-[#71717A]">{t("noMeetingsYet")}</p>
          <Link
            href={`/pv-chantier/nouveau?project_id=${projectId}`}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand/80"
          >
            <Plus className="h-3 w-3" />
            {t("newMeeting")}
          </Link>
        </div>
      )}
    </div>
  );
}
