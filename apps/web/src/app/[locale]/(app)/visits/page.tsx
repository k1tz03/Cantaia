"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  UserCheck,
  Plus,
  MapPin,
  Clock,
  Target,
  Mic,
  FileText,
  DollarSign,
  CheckCircle,
  XCircle,
  Archive,
  Loader2,
  Camera,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface VisitSummary {
  id: string;
  client_name: string;
  title: string | null;
  client_address: string | null;
  client_city: string | null;
  visit_date: string;
  duration_minutes: number | null;
  status: string;
  report: any;
  is_prospect: boolean;
  photos_count: number | null;
}

type VisitFilter = "all" | "recording" | "report_ready" | "quoted" | "won" | "lost";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("fr-CH", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function formatCHF(amount: number): string {
  return amount.toLocaleString("fr-CH");
}

export default function VisitsPage() {
  const t = useTranslations("visits");
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<VisitFilter>("all");

  useEffect(() => {
    loadVisits();
  }, []);

  async function loadVisits() {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await (supabase.from("users") as any)
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!userData?.organization_id) { setLoading(false); return; }

      const { data } = await (supabase.from("client_visits") as any)
        .select("id, client_name, title, client_address, client_city, visit_date, duration_minutes, status, report, is_prospect, photos_count")
        .eq("organization_id", userData.organization_id)
        .order("visit_date", { ascending: false });

      setVisits(data || []);
    } catch (err) {
      console.error("Failed to load visits:", err);
    } finally {
      setLoading(false);
    }
  }

  const filteredVisits = visits.filter((v) => {
    if (filter === "all") return true;
    if (filter === "recording") return v.status === "recording" || v.status === "transcribing";
    if (filter === "report_ready") return v.status === "report_ready" || v.status === "reviewed";
    if (filter === "quoted") return v.status === "quoted";
    if (filter === "won") return v.status === "won";
    if (filter === "lost") return v.status === "lost";
    return true;
  });

  // Stats
  const totalVisits = visits.length;
  const quotedCount = visits.filter((v) => ["quoted", "won", "lost"].includes(v.status)).length;
  const wonCount = visits.filter((v) => v.status === "won").length;
  const totalRevenue = visits
    .filter((v) => v.status === "won" && v.report?.budget?.range_min)
    .reduce((sum, v) => sum + (v.report.budget.range_min || 0), 0);
  const conversionRate = quotedCount > 0 ? Math.round((wonCount / quotedCount) * 100) : 0;

  function getStatusBadge(status: string) {
    switch (status) {
      case "recording":
      case "transcribing":
        return { color: "bg-red-50 text-red-700", icon: Mic, label: t("statusRecording") };
      case "report_ready":
      case "reviewed":
        return { color: "bg-blue-50 text-blue-700", icon: FileText, label: t("statusReportReady") };
      case "quoted":
        return { color: "bg-amber-50 text-amber-700", icon: DollarSign, label: t("statusQuoted") };
      case "won":
        return { color: "bg-green-50 text-green-700", icon: CheckCircle, label: t("statusWon") };
      case "lost":
        return { color: "bg-gray-100 text-gray-500", icon: XCircle, label: t("statusLost") };
      default:
        return { color: "bg-gray-100 text-gray-600", icon: Archive, label: status };
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  const filters: { id: VisitFilter; label: string }[] = [
    { id: "all", label: t("filterAll") },
    { id: "recording", label: t("filterRecording") },
    { id: "report_ready", label: t("filterReportReady") },
    { id: "quoted", label: t("filterQuoted") },
    { id: "won", label: t("filterWon") },
    { id: "lost", label: t("filterLost") },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <UserCheck className="h-6 w-6 text-blue-600" />
            {t("title")}
          </h1>
        </div>
        <Link
          href="/visits/new"
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          {t("newVisit")}
        </Link>
      </div>

      {/* Stats bar */}
      {totalVisits > 0 && (
        <div className="mb-6 flex items-center gap-6 rounded-lg border border-gray-200 bg-white px-5 py-3">
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <FileText className="h-4 w-4 text-gray-400" />
            <span className="font-semibold text-gray-900">{totalVisits}</span> {t("statsVisits")}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <Target className="h-4 w-4 text-gray-400" />
            <span className="font-semibold text-gray-900">{quotedCount}</span> {t("statsQuotesSent")}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="font-semibold text-gray-900">{wonCount}</span> {t("statsSigned")}
          </div>
          {totalRevenue > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-gray-600">
              <DollarSign className="h-4 w-4 text-gray-400" />
              <span className="font-semibold text-gray-900">{formatCHF(totalRevenue)} CHF</span>
            </div>
          )}
          <div className="ml-auto text-sm text-gray-500">
            {t("statsConversionRate")} : <span className="font-semibold text-gray-900">{conversionRate}%</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex gap-1.5">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.id
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Visit list */}
      {filteredVisits.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-16 text-center">
          <UserCheck className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">{t("noVisits")}</p>
          <p className="mt-1 text-xs text-gray-400">{t("noVisitsDesc")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredVisits.map((visit) => {
            const badge = getStatusBadge(visit.status);
            const BadgeIcon = badge.icon;
            const probability = visit.report?.closing_probability;
            const budgetMin = visit.report?.budget?.range_min;
            const budgetMax = visit.report?.budget?.range_max;
            const requestsCount = visit.report?.client_requests?.length || 0;

            return (
              <Link
                key={visit.id}
                href={`/visits/${visit.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-blue-200 hover:bg-blue-50/30"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Mic className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-semibold text-gray-900">
                        {visit.client_name}
                      </span>
                      {visit.title && (
                        <span className="text-sm text-gray-500">— {visit.title}</span>
                      )}
                      {(visit.photos_count || 0) > 0 && (
                        <span className="flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                          <Camera className="h-2.5 w-2.5" />
                          {visit.photos_count}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-4 text-xs text-gray-400">
                      {(visit.client_address || visit.client_city) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {[visit.client_address, visit.client_city].filter(Boolean).join(", ")}
                        </span>
                      )}
                      <span>{formatDate(visit.visit_date)}</span>
                      {visit.duration_minutes && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {visit.duration_minutes} min
                        </span>
                      )}
                    </div>
                    {(budgetMin || requestsCount > 0 || probability) && (
                      <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                        {budgetMin && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            {formatCHF(budgetMin)}{budgetMax ? `–${formatCHF(budgetMax)}` : ""} CHF
                          </span>
                        )}
                        {probability && (
                          <span className="flex items-center gap-1">
                            <Target className="h-3 w-3" />
                            {Math.round(probability * 100)}%
                          </span>
                        )}
                        {requestsCount > 0 && (
                          <span>{requestsCount} {t("clientRequests").toLowerCase()}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.color}`}>
                    <BadgeIcon className="h-3 w-3" />
                    {badge.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
