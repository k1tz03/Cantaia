"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CalendarRange, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import GanttChart from "@/components/planning/GanttChart";
import type {
  Planning,
  PlanningPhase,
  PlanningTask,
  PlanningDependency,
  ZoomLevel,
} from "@/components/planning/planning-types";

export default function PublicPlanningPage() {
  const params = useParams();
  const token = params.token as string;
  const t = useTranslations("planning");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planning, setPlanning] = useState<Planning | null>(null);
  const [projectName, setProjectName] = useState("");

  useEffect(() => {
    async function fetchPublicPlanning() {
      try {
        const res = await fetch(`/api/planning/public/${token}`);
        const json = await res.json();

        if (!res.ok) {
          setError(json.error || "Lien invalide");
          return;
        }

        const p = json.planning;
        setProjectName(p.project_name || p.title || "");

        const planningData: Planning = {
          id: p.id,
          title: p.title,
          start_date: p.start_date,
          calculated_end_date: p.calculated_end_date || p.start_date,
          phases: (json.phases || []).map((ph: any) => ({
            ...ph,
            tasks: (json.tasks || []).filter((tk: any) => tk.phase_id === ph.id),
            isExpanded: true,
          })),
          tasks: json.tasks || [],
          dependencies: json.dependencies || [],
          milestones: (json.tasks || []).filter((tk: any) => tk.is_milestone),
        };
        setPlanning(planningData);
      } catch (err) {
        setError("Erreur de chargement");
      } finally {
        setLoading(false);
      }
    }

    if (token) fetchPublicPlanning();
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md p-8">
          <AlertCircle className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-gray-900 mb-2">
            {t("share.expired")}
          </h2>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            {t("tryFree")}
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  if (!planning) return null;

  return (
    <div className="flex flex-col min-h-screen">
      {/* Public header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">C</span>
            </div>
            <span className="text-lg font-semibold text-gray-900">Cantaia</span>
          </div>
          <span className="text-sm text-gray-400 hidden sm:inline">|</span>
          <span className="text-sm text-gray-500 hidden sm:inline">
            {t("poweredBy")}
          </span>
        </div>
        <Link
          href="/register"
          className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          {t("tryFree")}
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </header>

      {/* Gantt chart (read-only) */}
      <div className="flex-1 min-h-0 p-4">
        <GanttChart
          planning={planning}
          criticalPath={[]}
          zoom="week"
          readOnly
          projectName={projectName}
        />
      </div>
    </div>
  );
}
