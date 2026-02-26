"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  Download,
  Send,
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Eye,
  History,
  Shield,
  Sparkles,
  Copy,
} from "lucide-react";
import { cn } from "@cantaia/ui";

// Data will come from Supabase — empty arrays until wired
const mockProjects: any[] = [];
import type { PlanStatus, PlanDiscipline, PlanValidationStatus } from "@cantaia/database";

// ── Mock plan detail data (replaced in 12.10) ──

interface MockPlanVersion {
  id: string;
  version_code: string;
  version_number: number;
  version_date: string;
  file_name: string;
  file_size: number;
  source: "auto_detected" | "manual_upload" | "email_attachment";
  source_email_subject?: string;
  ai_detected: boolean;
  ai_confidence: number | null;
  ai_changes_detected: string | null;
  validation_status: PlanValidationStatus;
  validated_by: string | null;
  validated_at: string | null;
  is_current: boolean;
  distributed_to: { name: string; company: string; sent_at: string | null }[];
}

interface MockPlanDetail {
  id: string;
  project_id: string;
  plan_number: string;
  plan_title: string;
  discipline: PlanDiscipline | null;
  status: PlanStatus;
  lot_name: string | null;
  zone: string | null;
  scale: string | null;
  format: string | null;
  author_company: string | null;
  author_name: string | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  versions: MockPlanVersion[];
}

const MOCK_PLAN_DETAILS: Record<string, MockPlanDetail> = {};

// ── Configs ──

const STATUS_CONFIG: Record<PlanStatus, { labelKey: string; color: string; bg: string; icon: React.ElementType }> = {
  active: { labelKey: "statusActive", color: "text-green-700", bg: "bg-green-50 border-green-200", icon: CheckCircle },
  superseded: { labelKey: "statusSuperseded", color: "text-gray-500", bg: "bg-gray-50 border-gray-200", icon: XCircle },
  withdrawn: { labelKey: "statusWithdrawn", color: "text-gray-400", bg: "bg-gray-50 border-gray-200", icon: XCircle },
  for_approval: { labelKey: "statusForApproval", color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: Clock },
  approved: { labelKey: "statusApproved", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: CheckCircle },
  rejected: { labelKey: "statusRejected", color: "text-red-600", bg: "bg-red-50 border-red-200", icon: AlertTriangle },
};

const VALIDATION_CONFIG: Record<PlanValidationStatus, { labelKey: string; color: string; bg: string; icon: React.ElementType }> = {
  pending: { labelKey: "validationPending", color: "text-amber-600", bg: "bg-amber-50", icon: Clock },
  approved: { labelKey: "validationApproved", color: "text-green-600", bg: "bg-green-50", icon: CheckCircle },
  rejected: { labelKey: "validationRejected", color: "text-red-600", bg: "bg-red-50", icon: XCircle },
  for_info: { labelKey: "validationForInfo", color: "text-blue-600", bg: "bg-blue-50", icon: Eye },
};

const DISCIPLINE_KEYS: Record<string, string> = {
  architecture: "disciplineArchitecture",
  structure: "disciplineStructure",
  cvcs: "disciplineCvcs",
  electricite: "disciplineElectricite",
  sanitaire: "disciplineSanitaire",
  facades: "disciplineFacades",
  amenagement: "disciplineAmenagement",
};

const DISCIPLINE_COLORS: Record<string, string> = {
  architecture: "bg-blue-100 text-blue-700",
  structure: "bg-orange-100 text-orange-700",
  cvcs: "bg-cyan-100 text-cyan-700",
  electricite: "bg-yellow-100 text-yellow-700",
  sanitaire: "bg-teal-100 text-teal-700",
  facades: "bg-purple-100 text-purple-700",
  amenagement: "bg-green-100 text-green-700",
};

const SOURCE_KEYS: Record<string, string> = {
  auto_detected: "sourceAutoDetected",
  manual_upload: "sourceManualUpload",
  email_attachment: "sourceEmail",
};

// ── Helpers ──

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(2);
  return `${day}.${month}.${year}`;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(2);
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${mins}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Page ──

export default function PlanDetailPage() {
  const params = useParams();
  const planId = params.id as string;
  const t = useTranslations("plans");

  const [activeTab, setActiveTab] = useState<"versions" | "info">("versions");

  const plan = MOCK_PLAN_DETAILS[planId];
  const project = plan ? mockProjects.find((p) => p.id === plan.project_id) : null;

  if (!plan) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <Link href="/plans" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
            <ArrowLeft className="h-4 w-4" />
            {t("title")}
          </Link>
          <div className="flex flex-col items-center justify-center py-20">
            <FileText className="h-12 w-12 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-600">{t("planNotFound")}</p>
          </div>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[plan.status];
  const StatusIcon = statusCfg.icon;
  const currentVersion = plan.versions.find((v) => v.is_current);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {/* Back link */}
        <Link href="/plans" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="h-4 w-4" />
          {t("title")}
        </Link>

        {/* Header */}
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="font-mono text-lg font-bold text-brand">{plan.plan_number}</span>
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                statusCfg.bg, statusCfg.color
              )}>
                <StatusIcon className="h-3.5 w-3.5" />
                {t(statusCfg.labelKey)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <Upload className="h-3.5 w-3.5" />
                {t("uploadNewVersion")}
              </button>
              <button className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                <Send className="h-3.5 w-3.5" />
                {t("distribute")}
              </button>
            </div>
          </div>

          <h1 className="text-xl font-semibold text-slate-900 mb-2">{plan.plan_title}</h1>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {project && (
              <Link
                href={`/projects/${project.id}`}
                className="flex items-center gap-1.5 hover:text-brand transition-colors"
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
                {project.name}
              </Link>
            )}
            <span className="text-slate-300">·</span>
            {plan.discipline && (
              <>
                <span className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                  DISCIPLINE_COLORS[plan.discipline]
                )}>
                  {t(DISCIPLINE_KEYS[plan.discipline])}
                </span>
                <span className="text-slate-300">·</span>
              </>
            )}
            {plan.lot_name && <span>{plan.lot_name}</span>}
            {plan.zone && (
              <>
                <span className="text-slate-300">·</span>
                <span>{plan.zone}</span>
              </>
            )}
            {plan.scale && (
              <>
                <span className="text-slate-300">·</span>
                <span>{plan.scale}</span>
              </>
            )}
            {plan.format && (
              <>
                <span className="text-slate-300">·</span>
                <span>{plan.format}</span>
              </>
            )}
          </div>

          {/* Author */}
          {plan.author_company && (
            <p className="mt-2 text-xs text-slate-500">
              {t("author")}: <span className="font-medium text-slate-700">{plan.author_name || plan.author_company}</span>
              {plan.author_name && plan.author_company && ` — ${plan.author_company}`}
            </p>
          )}

          {/* Current version highlight */}
          {currentVersion && (
            <div className="mt-3 flex items-center gap-3 rounded-md bg-blue-50 border border-blue-100 px-3 py-2">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-brand text-white text-sm font-bold">
                {currentVersion.version_code}
              </div>
              <div className="flex-1">
                <p className="text-xs font-medium text-slate-700">
                  {t("versionCurrent")} — {currentVersion.file_name}
                </p>
                <p className="text-[11px] text-slate-500">
                  {formatDate(currentVersion.version_date)} · {formatFileSize(currentVersion.file_size)}
                </p>
              </div>
              <button className="flex items-center gap-1 rounded-md bg-white border border-blue-200 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50">
                <Download className="h-3.5 w-3.5" />
                {t("download")}
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-4 flex items-center gap-1 border-b border-slate-200">
          <button
            onClick={() => setActiveTab("versions")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === "versions"
                ? "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <History className="h-4 w-4" />
            {t("tabVersions")} ({plan.versions.length})
          </button>
          <button
            onClick={() => setActiveTab("info")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === "info"
                ? "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <FileText className="h-4 w-4" />
            {t("tabInfo")}
          </button>
        </div>

        {/* Versions tab */}
        {activeTab === "versions" && (
          <div className="space-y-3">
            {[...plan.versions].reverse().map((version) => {
              const validCfg = VALIDATION_CONFIG[version.validation_status];
              const ValidIcon = validCfg.icon;
              return (
                <div
                  key={version.id}
                  className={cn(
                    "rounded-lg border bg-white p-4",
                    version.is_current ? "border-brand/30 ring-1 ring-brand/10" : "border-slate-200"
                  )}
                >
                  {/* Version header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded text-sm font-bold text-white",
                        version.is_current ? "bg-brand" : "bg-slate-400"
                      )}>
                        {version.version_code}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">
                            Version {version.version_code}
                          </span>
                          {version.is_current && (
                            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">
                              {t("versionCurrent")}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {formatDate(version.version_date)} · {version.file_name} · {formatFileSize(version.file_size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title={t("download")}>
                        <Download className="h-4 w-4" />
                      </button>
                      <button className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title={t("copyLink")}>
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Source */}
                  <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
                    {version.ai_detected && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-purple-600">
                        <Sparkles className="h-3 w-3" />
                        {t("sourceAutoDetected")}
                        {version.ai_confidence && ` (${Math.round(version.ai_confidence * 100)}%)`}
                      </span>
                    )}
                    {!version.ai_detected && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                        {t(SOURCE_KEYS[version.source] || version.source)}
                      </span>
                    )}
                    {version.source_email_subject && (
                      <span className="text-slate-400 truncate max-w-[300px]">
                        {t("fromEmail")}: &quot;{version.source_email_subject}&quot;
                      </span>
                    )}
                  </div>

                  {/* AI changes detected */}
                  {version.ai_changes_detected && (
                    <div className="mb-2 rounded-md bg-amber-50 border border-amber-100 px-3 py-2">
                      <p className="text-[11px] font-medium text-amber-700 mb-0.5">{t("changesDetected")}:</p>
                      <p className="text-[11px] text-amber-600">{version.ai_changes_detected}</p>
                    </div>
                  )}

                  {/* Validation + Distribution */}
                  <div className="flex items-center gap-4 text-[11px]">
                    {/* Validation status */}
                    <div className="flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-slate-400" />
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium", validCfg.bg, validCfg.color)}>
                        <ValidIcon className="h-3 w-3" />
                        {t(validCfg.labelKey)}
                      </span>
                      {version.validated_by && (
                        <span className="text-slate-400">
                          {version.validated_by} · {version.validated_at ? formatDateTime(version.validated_at) : ""}
                        </span>
                      )}
                    </div>

                    {/* Distribution */}
                    {version.distributed_to.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Send className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-slate-500">
                          {t("distributedTo", { count: version.distributed_to.length })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Distribution list (expanded for current version) */}
                  {version.is_current && version.distributed_to.length > 0 && (
                    <div className="mt-2 rounded-md border border-slate-100 bg-slate-50 p-2">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        {t("distributionList")}
                      </p>
                      <div className="space-y-1">
                        {version.distributed_to.map((r, i) => (
                          <div key={i} className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-700">{r.name} <span className="text-slate-400">— {r.company}</span></span>
                            {r.sent_at ? (
                              <span className="text-green-600 flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" />
                                {formatDateTime(r.sent_at)}
                              </span>
                            ) : (
                              <span className="text-amber-500 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {t("notSent")}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Info tab */}
        {activeTab === "info" && (
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colNumber")}</p>
                <p className="font-mono font-medium text-slate-800">{plan.plan_number}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colTitle")}</p>
                <p className="text-slate-800">{plan.plan_title}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colProject")}</p>
                {project ? (
                  <Link href={`/projects/${project.id}`} className="flex items-center gap-1.5 text-slate-800 hover:text-brand">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: project.color }} />
                    {project.name}
                  </Link>
                ) : (
                  <p className="text-slate-400">—</p>
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colDiscipline")}</p>
                {plan.discipline ? (
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    DISCIPLINE_COLORS[plan.discipline]
                  )}>
                    {t(DISCIPLINE_KEYS[plan.discipline])}
                  </span>
                ) : (
                  <p className="text-slate-400">—</p>
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colLot")}</p>
                <p className="text-slate-800">{plan.lot_name || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colZone")}</p>
                <p className="text-slate-800">{plan.zone || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colScale")}</p>
                <p className="text-slate-800">{plan.scale || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("format")}</p>
                <p className="text-slate-800">{plan.format || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colAuthor")}</p>
                <p className="text-slate-800">
                  {plan.author_name || "—"}
                  {plan.author_company && <span className="text-slate-500"> — {plan.author_company}</span>}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("createdAt")}</p>
                <p className="text-slate-800">{formatDateTime(plan.created_at)}</p>
              </div>
            </div>

            {/* Notes */}
            {plan.notes && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("notes")}</p>
                <p className="text-sm text-slate-700">{plan.notes}</p>
              </div>
            )}

            {/* Tags */}
            {plan.tags.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">{t("tags")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {plan.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
