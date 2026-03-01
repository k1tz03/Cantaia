"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Plus,
  FileText,
  Loader2,
  Users,
  ChevronDown,
  CheckCircle,
  Mic,
  Filter,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import type { MeetingStatus } from "@cantaia/database";

const STATUS_CONFIG: Record<
  MeetingStatus,
  { labelKey: string; icon: React.ElementType; color: string; bg: string; animate?: boolean }
> = {
  scheduled: { labelKey: "status_draft", icon: FileText, color: "text-gray-600", bg: "bg-gray-100" },
  recording: { labelKey: "status_recording", icon: Mic, color: "text-red-600", bg: "bg-red-50", animate: true },
  transcribing: { labelKey: "status_transcribing", icon: Loader2, color: "text-blue-600", bg: "bg-blue-50", animate: true },
  generating_pv: { labelKey: "status_generating", icon: Sparkles, color: "text-violet-600", bg: "bg-violet-50", animate: true },
  review: { labelKey: "status_review", icon: Pencil, color: "text-orange-600", bg: "bg-orange-50" },
  finalized: { labelKey: "status_finalized", icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
  sent: { labelKey: "status_sent", icon: Send, color: "text-green-700", bg: "bg-green-50" },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function countActions(pvContent: any): number {
  if (!pvContent?.sections) return 0;
  return pvContent.sections.reduce(
    (total: number, section: any) => total + (section.actions?.length || 0),
    0
  );
}

export default function PVChantierPage() {
  const t = useTranslations("pv");

  const [meetings, setMeetings] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Fetch projects
        const projRes = await fetch("/api/projects/list");
        const projData = await projRes.json();
        if (projData.projects) setProjects(projData.projects);

        // Fetch meetings
        const meetRes = await fetch("/api/pv");
        const meetData = await meetRes.json();
        if (meetData.meetings) setMeetings(meetData.meetings);
      } catch (err) {
        console.error("Failed to load PV data:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleDelete = async (meetingId: string) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/pv/${meetingId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
      }
    } catch (err) {
      console.error("Delete failed:", err);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const filteredMeetings = useMemo(() => {
    let list = [...meetings];
    if (projectFilter !== "all") {
      list = list.filter((m) => m.project_id === projectFilter);
    }
    return list;
  }, [meetings, projectFilter]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filteredMeetings.length}{" "}
            {filteredMeetings.length <= 1 ? "PV" : "PV"}
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
                ? t("all_projects")
                : projects.find((p) => p.id === projectFilter)?.name || ""}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {showProjectDropdown && (
              <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setProjectFilter("all");
                    setShowProjectDropdown(false);
                  }}
                  className={`flex w-full px-3 py-1.5 text-sm transition-colors hover:bg-gray-50 ${
                    projectFilter === "all"
                      ? "font-medium text-blue-600"
                      : "text-gray-600"
                  }`}
                >
                  {t("all_projects")}
                </button>
                {projects.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProjectFilter(p.id);
                      setShowProjectDropdown(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-gray-50 ${
                      projectFilter === p.id
                        ? "font-medium text-blue-600"
                        : "text-gray-600"
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

          <Link
            href="/pv-chantier/nouveau"
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
          >
            <Plus className="h-4 w-4" />
            {t("new_pv")}
          </Link>
        </div>
      </div>

      {/* Content */}
      {filteredMeetings.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <FileText className="h-7 w-7 text-gray-400" />
          </div>
          <p className="mt-4 text-sm font-medium text-gray-700">
            {t("no_pv_yet")}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {t("no_pv_description")}
          </p>
          <Link
            href="/pv-chantier/nouveau"
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
          >
            <Plus className="h-4 w-4" />
            {t("new_pv")}
          </Link>
        </div>
      ) : (
        <div className="mt-6 -mx-4 sm:mx-0 overflow-x-auto rounded-lg sm:border border-gray-200 bg-white">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  {t("col_title")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  {t("col_project")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  {t("col_date")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  {t("col_participants")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  {t("col_actions")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  {t("col_status")}
                </th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredMeetings.map((meeting) => {
                const project = meeting.projects;
                const statusCfg =
                  STATUS_CONFIG[meeting.status as MeetingStatus] ||
                  STATUS_CONFIG.scheduled;
                const StatusIcon = statusCfg.icon;
                const actionsCount = countActions(meeting.pv_content);

                return (
                  <tr
                    key={meeting.id}
                    className="transition-colors hover:bg-gray-50"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-gray-700">
                        {meeting.meeting_number ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/pv-chantier/${meeting.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-blue-600"
                      >
                        {meeting.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {project && (
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: project.color,
                            }}
                          />
                          <span className="max-w-[120px] truncate text-sm text-gray-600">
                            {project.name}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700">
                        {formatDate(meeting.meeting_date)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-sm text-gray-600">
                          {meeting.participants?.length || 0}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">
                        {actionsCount > 0 ? actionsCount : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.color} ${statusCfg.bg}`}
                      >
                        <StatusIcon
                          className={`h-3 w-3 ${statusCfg.animate ? "animate-spin" : ""}`}
                        />
                        {t(statusCfg.labelKey)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(meeting.id);
                        }}
                        className="rounded p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
                        title={t("delete_pv")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <h3 className="text-base font-semibold text-gray-900">
                {t("delete_pv")}
              </h3>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              {t("delete_pv_confirm")}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {t("cancel")}
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                {t("delete_pv")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
