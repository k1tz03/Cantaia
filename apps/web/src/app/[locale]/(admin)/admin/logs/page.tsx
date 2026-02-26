"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { ScrollText, Filter, ChevronDown } from "lucide-react";
// Mock data removed — will be replaced by real API calls

const ACTIONS = [
  "login",
  "sync_emails",
  "classify_email",
  "generate_reply",
  "send_reply",
  "generate_pv",
  "transcribe_audio",
  "export_pv",
  "send_pv",
  "finalize_pv",
  "create_task",
  "complete_task",
  "create_project",
  "generate_briefing",
  "view_briefing",
];

const ACTION_LABEL_KEYS: Record<string, string> = {
  login: "actionLogin",
  sync_emails: "actionSyncEmails",
  classify_email: "actionClassifyEmail",
  generate_reply: "actionGenerateReply",
  send_reply: "actionSendReply",
  generate_pv: "actionGeneratePV",
  transcribe_audio: "actionTranscribeAudio",
  export_pv: "actionExportPV",
  send_pv: "actionSendPV",
  finalize_pv: "actionFinalizePV",
  create_task: "actionCreateTask",
  complete_task: "actionCompleteTask",
  create_project: "actionCreateProject",
  generate_briefing: "actionGenerateBriefing",
  view_briefing: "actionViewBriefing",
};

const ACTION_COLORS: Record<string, string> = {
  login: "bg-gray-100 text-gray-700",
  sync_emails: "bg-blue-100 text-blue-700",
  classify_email: "bg-purple-100 text-purple-700",
  generate_reply: "bg-indigo-100 text-indigo-700",
  send_reply: "bg-indigo-100 text-indigo-700",
  generate_pv: "bg-green-100 text-green-700",
  transcribe_audio: "bg-cyan-100 text-cyan-700",
  export_pv: "bg-green-100 text-green-700",
  send_pv: "bg-green-100 text-green-700",
  finalize_pv: "bg-green-100 text-green-700",
  create_task: "bg-amber-100 text-amber-700",
  complete_task: "bg-amber-100 text-amber-700",
  create_project: "bg-orange-100 text-orange-700",
  generate_briefing: "bg-pink-100 text-pink-700",
  view_briefing: "bg-pink-100 text-pink-700",
};

const PAGE_SIZES = [25, 50, 100];

export default function AdminLogsPage() {
  const t = useTranslations("admin");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterOrg, setFilterOrg] = useState<string>("all");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);

  const allLogs = useMemo(() => [] as { id: string; action: string; organization_name: string; user_name: string; date: string; metadata: Record<string, unknown> }[], []);

  const filteredLogs = useMemo(() => {
    return allLogs.filter((log) => {
      if (filterAction !== "all" && log.action !== filterAction) return false;
      if (filterOrg !== "all" && log.organization_name !== filterOrg)
        return false;
      return true;
    });
  }, [allLogs, filterAction, filterOrg]);

  const pagedLogs = filteredLogs.slice(
    page * pageSize,
    (page + 1) * pageSize
  );
  const totalPages = Math.ceil(filteredLogs.length / pageSize);

  // Action aggregation
  const actionAgg = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of allLogs) {
      counts[log.action] = (counts[log.action] || 0) + 1;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([action, count]) => ({ action, count }));
  }, [allLogs]);

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `il y a ${hours}h`;
    return d.toLocaleDateString("fr-CH", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatMetadata(meta: Record<string, unknown>) {
    const entries = Object.entries(meta);
    if (entries.length === 0) return null;
    return entries
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  }

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <ScrollText className="h-5 w-5 text-gray-500" />
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            {t("logsTitle")}
          </h1>
          <p className="text-sm text-gray-500">
            {filteredLogs.length} entrées
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Main: Filters + Table */}
        <div className="min-w-0 flex-1">
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <Filter className="h-3.5 w-3.5" />
              {t("logsFilter")}
            </div>

            {/* Action filter */}
            <div className="relative">
              <select
                value={filterAction}
                onChange={(e) => {
                  setFilterAction(e.target.value);
                  setPage(0);
                }}
                className="appearance-none rounded-md border border-gray-200 bg-white py-1.5 pl-3 pr-8 text-sm text-gray-700"
              >
                <option value="all">{t("logsFilterAction")}</option>
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {t(ACTION_LABEL_KEYS[a] as any)}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </div>

            {/* Org filter */}
            <div className="relative">
              <select
                value={filterOrg}
                onChange={(e) => {
                  setFilterOrg(e.target.value);
                  setPage(0);
                }}
                className="appearance-none rounded-md border border-gray-200 bg-white py-1.5 pl-3 pr-8 text-sm text-gray-700"
              >
                <option value="all">{t("logsFilterOrg")}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </div>

            {/* Page size */}
            <div className="ml-auto flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
                className="rounded-md border border-gray-200 bg-white py-1.5 pl-2 pr-6 text-sm text-gray-600"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <span className="text-xs text-gray-500">{t("logsPerPage")}</span>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">
                    Date
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">
                    {t("colUser")}
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">
                    {t("colOrg")}
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">
                    Action
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium text-gray-500">
                    Détails
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pagedLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="transition-colors hover:bg-gray-50"
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-gray-500">
                      {formatDate(log.date)}
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-700">
                      {log.user_name}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {log.organization_name}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          ACTION_COLORS[log.action] || "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {t((ACTION_LABEL_KEYS[log.action] || log.action) as any)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-400">
                      {formatMetadata(log.metadata) || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Page {page + 1} / {totalPages}
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="rounded-md border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  &larr;
                </button>
                <button
                  onClick={() =>
                    setPage(Math.min(totalPages - 1, page + 1))
                  }
                  disabled={page >= totalPages - 1}
                  className="rounded-md border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  &rarr;
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Action aggregation */}
        <div className="w-full shrink-0 lg:w-[240px]">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-700">
              Actions (72h)
            </h3>
            <div className="mt-3 space-y-2">
              {actionAgg.slice(0, 10).map(({ action, count }) => (
                <div key={action} className="flex items-center justify-between">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      ACTION_COLORS[action] || "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {t((ACTION_LABEL_KEYS[action] || action) as any)}
                  </span>
                  <span className="text-sm font-medium text-gray-600">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
