"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { withFallback } from "@/components/pv-chantier/pv-i18n";
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
  { labelKey: string; icon: React.ComponentType<any>; color: string; bg: string; animate?: boolean }
> = {
  scheduled: { labelKey: "status_draft", icon: FileText, color: "text-[#A1A1AA]", bg: "bg-[#27272A]" },
  recording: { labelKey: "status_recording", icon: Mic, color: "text-red-400", bg: "bg-red-500/10" },
  transcribing: { labelKey: "status_transcribing", icon: Loader2, color: "text-[#F97316]", bg: "bg-[#F97316]/10" },
  generating_pv: { labelKey: "status_generating", icon: Sparkles, color: "text-violet-400", bg: "bg-violet-500/10" },
  review: { labelKey: "status_review", icon: Pencil, color: "text-orange-400", bg: "bg-orange-500/10" },
  finalized: { labelKey: "status_finalized", icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10" },
  sent: { labelKey: "status_sent", icon: Send, color: "text-green-400", bg: "bg-green-500/10" },
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
  const tf = withFallback(t);
  const router = useRouter();

  const [meetings, setMeetings] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Fetch projects
        const projRes = await fetch("/api/projects/list");
        if (projRes.status === 401) {
          router.replace("/login");
          return;
        }
        const projData = await projRes.json().catch(() => ({}));
        if (projData.projects) setProjects(projData.projects);

        // Fetch meetings
        const meetRes = await fetch("/api/pv");
        if (meetRes.status === 401) {
          router.replace("/login");
          return;
        }
        const meetData = await meetRes.json().catch(() => ({}));
        // A failed fetch must not render the empty state ("Aucun PV") — that
        // reads as "you have no PVs" when the truth is "loading failed".
        if (!meetRes.ok) {
          setLoadError(tf("list_load_error"));
          return;
        }
        setMeetings(meetData.meetings || []);
      } catch (err) {
        console.error("Failed to load PV data:", err);
        setLoadError(tf("list_load_error"));
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (meetingId: string) => {
    setDeleting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/pv/${meetingId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
        setDeleteTarget(null);
      } else {
        // DELETE is restricted to the creator → a non-creator gets a 403 whose
        // message must be shown, not swallowed.
        setActionError(data.error || `${tf("save_error")} (${res.status})`);
      }
    } catch (err) {
      console.error("Delete failed:", err);
      setActionError(tf("delete_error_network"));
    } finally {
      setDeleting(false);
    }
  };

  const filteredMeetings = useMemo(() => {
    let list = [...meetings];
    if (projectFilter !== "all") {
      list = list.filter((m) => m.project_id === projectFilter);
    }
    list.sort((a, b) => new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime());
    return list;
  }, [meetings, projectFilter]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#A1A1AA]" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0F0F11] px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#FAFAFA]">{t("title")}</h1>
          <p className="mt-1 text-sm text-[#A1A1AA]">
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
              className="flex items-center gap-1.5 rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#A1A1AA] hover:bg-[#27272A]"
            >
              <Filter className="h-3.5 w-3.5" />
              {projectFilter === "all"
                ? t("all_projects")
                : projects.find((p) => p.id === projectFilter)?.name || ""}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {showProjectDropdown && (
              <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-md border border-[#27272A] bg-[#0F0F11] py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setProjectFilter("all");
                    setShowProjectDropdown(false);
                  }}
                  className={`flex w-full px-3 py-1.5 text-sm transition-colors hover:bg-[#27272A] ${
                    projectFilter === "all"
                      ? "font-medium text-[#F97316]"
                      : "text-[#A1A1AA]"
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
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-[#27272A] ${
                      projectFilter === p.id
                        ? "font-medium text-[#F97316]"
                        : "text-[#A1A1AA]"
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

      {/* Load error — distinct from the empty state */}
      {loadError && (
        <div className="mt-6 rounded-md border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
          {loadError}
        </div>
      )}

      {/* Content */}
      {loadError ? null : filteredMeetings.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#27272A]">
            <FileText className="h-7 w-7 text-[#A1A1AA]" />
          </div>
          <p className="mt-4 text-sm font-medium text-[#FAFAFA]">
            {t("no_pv_yet")}
          </p>
          <p className="mt-1 text-sm text-[#A1A1AA]">
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
        <div className="mt-6 -mx-4 sm:mx-0 overflow-x-auto rounded-lg sm:border border-[#27272A] bg-[#0F0F11]">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-[#27272A] bg-[#27272A]">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#A1A1AA]">
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#A1A1AA]">
                  {t("col_title")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#A1A1AA]">
                  {t("col_project")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#A1A1AA]">
                  {t("col_date")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#A1A1AA]">
                  {t("col_participants")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#A1A1AA]">
                  {t("col_actions")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-[#A1A1AA]">
                  {t("col_status")}
                </th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
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
                    className="transition-colors hover:bg-[#27272A]"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-[#FAFAFA]">
                        {meeting.meeting_number ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/pv-chantier/${meeting.id}`}
                        className="text-sm font-medium text-[#FAFAFA] hover:text-[#F97316]"
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
                          <span className="max-w-[120px] truncate text-sm text-[#A1A1AA]">
                            {project.name}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-[#FAFAFA]">
                        {formatDate(meeting.meeting_date)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-[#A1A1AA]" />
                        <span className="text-sm text-[#A1A1AA]">
                          {meeting.participants?.length || 0}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-[#A1A1AA]">
                        {actionsCount}
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
                      {/* Circulation trace — a "sent" badge with no date says
                          nothing about whether the opposition period is running */}
                      {meeting.status === "sent" && meeting.sent_at && (
                        <div
                          className="mt-1 text-[11px] text-[#A1A1AA]"
                          title={
                            Array.isArray(meeting.sent_to) && meeting.sent_to.length > 0
                              ? meeting.sent_to.join(", ")
                              : undefined
                          }
                        >
                          {formatDate(meeting.sent_at)}
                          {Array.isArray(meeting.sent_to) && meeting.sent_to.length > 0 && (
                            <> · {meeting.sent_to.length} dest.</>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(meeting.id);
                        }}
                        className="rounded p-1 text-[#A1A1AA] hover:bg-red-500/10 hover:text-red-500"
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
          <div className="w-full max-w-sm rounded-lg bg-[#0F0F11] p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <h3 className="text-base font-semibold text-[#FAFAFA]">
                {t("delete_pv")}
              </h3>
            </div>
            <p className="mb-4 text-sm text-[#A1A1AA]">
              {t("delete_pv_confirm")}
            </p>
            {actionError && (
              <p className="mb-4 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                {actionError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeleteTarget(null);
                  setActionError(null);
                }}
                className="rounded-md border border-[#27272A] px-4 py-2 text-sm text-[#FAFAFA] hover:bg-[#27272A]"
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
