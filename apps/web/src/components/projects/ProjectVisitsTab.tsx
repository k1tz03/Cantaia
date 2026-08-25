"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  UserCheck,
  Plus,
  Mic,
  FileText,
  DollarSign,
  CheckCircle,
  XCircle,
  Archive,
  Camera,
  Clock,
  Loader2,
  Target,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Visits tab of a project.
 *
 * Was a 25-line placeholder ("consultez toutes les visites") while the project
 * nav-counts endpoint already counted this project's visits — the number was
 * real, the tab behind it was not. It now lists the actual `client_visits`
 * rows attached to the project. The project id comes from the route params so
 * the parent page does not have to be changed.
 */

interface ProjectVisit {
  id: string;
  client_name: string;
  title: string | null;
  visit_date: string;
  duration_minutes: number | null;
  status: string;
  report: any;
  photos_count: number | null;
}

function formatVisitDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function ProjectVisitsTab() {
  const t = useTranslations("projects");
  const tv = useTranslations("visits");
  const params = useParams();
  const projectId = params?.id as string;

  const [visits, setVisits] = useState<ProjectVisit[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await (supabase.from("client_visits") as any)
        .select("id, client_name, title, visit_date, duration_minutes, status, report, photos_count")
        .eq("project_id", projectId)
        .order("visit_date", { ascending: false });
      setVisits(data || []);
    } catch (err) {
      console.error("[ProjectVisits] Failed to load visits:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  function statusBadge(status: string) {
    switch (status) {
      case "recording":
      case "transcribing":
        return { color: "bg-red-500/10 text-red-400", Icon: Mic, label: tv("statusRecording") };
      case "report_ready":
      case "reviewed":
        return { color: "bg-[#F97316]/10 text-[#F97316]", Icon: FileText, label: tv("statusReportReady") };
      case "quoted":
        return { color: "bg-amber-500/10 text-amber-400", Icon: DollarSign, label: tv("statusQuoted") };
      case "won":
        return { color: "bg-green-500/10 text-green-400", Icon: CheckCircle, label: tv("statusWon") };
      case "lost":
        return { color: "bg-[#27272A] text-[#A1A1AA]", Icon: XCircle, label: tv("statusLost") };
      default:
        return { color: "bg-[#27272A] text-[#A1A1AA]", Icon: Archive, label: status };
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#A1A1AA]" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#A1A1AA]">
          {visits.length} {tv("statsVisits")}
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/visits"
            className="rounded-md border border-[#27272A] px-3 py-2 text-xs font-medium text-[#A1A1AA] hover:bg-[#27272A]"
          >
            {t("viewAllVisits")}
          </Link>
          <Link
            href={`/visits/new?project_id=${projectId}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#F97316] px-3 py-2 text-xs font-medium text-[#0F0F11] hover:bg-[#EA580C]"
          >
            <Plus className="h-3.5 w-3.5" />
            {tv("newVisit")}
          </Link>
        </div>
      </div>

      {visits.length === 0 ? (
        <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-[#27272A] bg-[#0F0F11]">
          <div className="text-center">
            <UserCheck className="mx-auto h-10 w-10 text-[#52525B]" />
            <p className="mt-3 text-sm font-medium text-[#A1A1AA]">{tv("noVisits")}</p>
            <Link
              href={`/visits/new?project_id=${projectId}`}
              className="mt-2 inline-block text-xs font-medium text-[#F97316] hover:text-[#EA580C]"
            >
              {tv("newVisit")}
            </Link>
          </div>
        </div>
      ) : (
        visits.map((visit) => {
          const badge = statusBadge(visit.status);
          const BadgeIcon = badge.Icon;
          const requestsCount = visit.report?.client_requests?.length || 0;
          const probability = visit.report?.closing_probability;

          return (
            <Link
              key={visit.id}
              href={`/visits/${visit.id}`}
              className="block rounded-md border border-[#27272A] bg-[#0F0F11] p-4 transition-colors hover:border-[#F97316]/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-[#FAFAFA]">
                      {visit.client_name}
                    </span>
                    {visit.title && (
                      <span className="truncate text-sm text-[#A1A1AA]">— {visit.title}</span>
                    )}
                    {(visit.photos_count || 0) > 0 && (
                      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-[#F97316]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#F97316]">
                        <Camera className="h-2.5 w-2.5" />
                        {visit.photos_count}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs text-[#A1A1AA]">
                    <span>{formatVisitDate(visit.visit_date)}</span>
                    {visit.duration_minutes && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {visit.duration_minutes} min
                      </span>
                    )}
                    {requestsCount > 0 && (
                      <span>
                        {requestsCount} {tv("clientRequests").toLowerCase()}
                      </span>
                    )}
                    {probability ? (
                      <span className="flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        {Math.round(probability * 100)}%
                      </span>
                    ) : null}
                  </div>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.color}`}
                >
                  <BadgeIcon className="h-3 w-3" />
                  {badge.label}
                </span>
              </div>
            </Link>
          );
        })
      )}
    </div>
  );
}
