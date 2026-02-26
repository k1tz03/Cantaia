"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Plus,
  FileText,
  Pencil,
  Loader2,
  Calendar,
  Users,
  ChevronDown,
  Send,
  CheckCircle,
  Mic,
  Filter,
} from "lucide-react";
import type { MeetingStatus, Meeting, Project } from "@cantaia/database";

const allMeetings: Meeting[] = [];
const allProjects: Project[] = [];

const STATUS_CONFIG: Record<
  MeetingStatus,
  { labelKey: string; icon: React.ElementType; color: string; bg: string }
> = {
  scheduled: { labelKey: "statusScheduled", icon: Calendar, color: "text-gray-600", bg: "bg-gray-100" },
  recording: { labelKey: "statusRecording", icon: Mic, color: "text-red-600", bg: "bg-red-50" },
  transcribing: { labelKey: "statusTranscribing", icon: Loader2, color: "text-amber-600", bg: "bg-amber-50" },
  generating_pv: { labelKey: "statusGenerating", icon: Loader2, color: "text-blue-600", bg: "bg-blue-50" },
  review: { labelKey: "statusDraft", icon: Pencil, color: "text-blue-600", bg: "bg-blue-50" },
  finalized: { labelKey: "statusFinalized", icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
  sent: { labelKey: "statusSent", icon: Send, color: "text-green-700", bg: "bg-green-50" },
};

function formatMeetingDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(2);
  return `${day}.${month}.${year}`;
}

function formatMeetingTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function MeetingsPage() {
  const t = useTranslations("meetings");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

  const meetings = useMemo(() => {
    let list = [...allMeetings];
    if (projectFilter !== "all") {
      list = list.filter((m) => m.project_id === projectFilter);
    }
    list.sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));
    return list;
  }, [projectFilter]);

  function getProjectForMeeting(projectId: string) {
    return allProjects.find((p) => p.id === projectId);
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {meetings.length} {meetings.length === 1 ? t("meetingSingular") : t("meetingPlural")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Filter by project */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowProjectDropdown(!showProjectDropdown)}
              className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              <Filter className="h-3.5 w-3.5" />
              {projectFilter === "all"
                ? t("allProjects")
                : getProjectForMeeting(projectFilter)?.name || ""}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {showProjectDropdown && (
              <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => { setProjectFilter("all"); setShowProjectDropdown(false); }}
                  className={`flex w-full px-3 py-1.5 text-sm transition-colors hover:bg-gray-50 ${
                    projectFilter === "all" ? "font-medium text-blue-600" : "text-gray-600"
                  }`}
                >
                  {t("allProjects")}
                </button>
                {allProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setProjectFilter(p.id); setShowProjectDropdown(false); }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-gray-50 ${
                      projectFilter === p.id ? "font-medium text-blue-600" : "text-gray-600"
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* New meeting button */}
          <Link
            href="/meetings/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
          >
            <Plus className="h-4 w-4" />
            {t("newMeeting")}
          </Link>
        </div>
      </div>

      {/* Meetings table */}
      {meetings.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <Calendar className="h-7 w-7 text-gray-400" />
          </div>
          <p className="mt-4 text-sm font-medium text-gray-700">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-gray-500">{t("emptyDescription")}</p>
          <Link
            href="/meetings/new"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
          >
            <Plus className="h-4 w-4" />
            {t("newMeeting")}
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("colTitle")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("colProject")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("colDate")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("colParticipants")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">{t("colStatus")}</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {meetings.map((meeting) => {
                const project = getProjectForMeeting(meeting.project_id);
                const statusCfg = STATUS_CONFIG[meeting.status];
                const StatusIcon = statusCfg.icon;
                const isSpinner = meeting.status === "transcribing" || meeting.status === "generating_pv";

                return (
                  <tr key={meeting.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-700">
                        {meeting.meeting_number ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/meetings/${meeting.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-blue-600"
                      >
                        {meeting.title}
                      </Link>
                      {meeting.location && (
                        <p className="mt-0.5 max-w-[200px] truncate text-xs text-gray-400">
                          {meeting.location}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {project && (
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: project.color }}
                          />
                          <span className="max-w-[120px] truncate text-sm text-gray-600">
                            {project.name}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700">{formatMeetingDate(meeting.meeting_date)}</div>
                      <div className="text-xs text-gray-400">{formatMeetingTime(meeting.meeting_date)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-sm text-gray-600">
                          {meeting.participants.filter((p) => p.present).length}/{meeting.participants.length}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.color} ${statusCfg.bg}`}>
                        <StatusIcon className={`h-3 w-3 ${isSpinner ? "animate-spin" : ""}`} />
                        {t(statusCfg.labelKey)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(meeting.status === "finalized" || meeting.status === "sent") && meeting.pv_document_url && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          <FileText className="h-3 w-3" />
                          PDF
                        </button>
                      )}
                      {meeting.status === "review" && (
                        <Link
                          href={`/meetings/${meeting.id}/edit`}
                          className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100"
                        >
                          <Pencil className="h-3 w-3" />
                          {t("editPV")}
                        </Link>
                      )}
                      {meeting.status === "transcribing" && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-500">
                          <Loader2 className="h-3 w-3 animate-spin" />
                        </span>
                      )}
                      {meeting.status === "scheduled" && (
                        <Link
                          href={`/meetings/${meeting.id}/record`}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          <Mic className="h-3 w-3" />
                          {t("record")}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
