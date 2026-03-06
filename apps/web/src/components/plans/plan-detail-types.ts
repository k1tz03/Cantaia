import type { PlanStatus, PlanDiscipline, PlanValidationStatus } from "@cantaia/database";
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Eye,
} from "lucide-react";

export interface PlanVersion {
  id: string;
  version_code: string;
  version_number: number;
  version_date: string;
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string;
  source: string;
  source_email_id: string | null;
  received_at: string | null;
  ai_detected: boolean;
  ai_confidence: number | null;
  ai_changes_detected: string | null;
  validation_status: PlanValidationStatus;
  validated_by: string | null;
  validated_at: string | null;
  distributed_to: any | null;
  distribution_date: string | null;
  is_current: boolean;
  created_at: string;
}

export interface PlanDetail {
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
  tags: string[] | null;
  created_at: string;
  projects: { id: string; name: string; code: string | null } | null;
  plan_versions: PlanVersion[];
}

export interface AnalysisData {
  id?: string;
  plan_type_detected: string;
  discipline_detected: string;
  summary: string;
  analysis_duration_ms: number;
  analyzed_at: string;
  analysis_result: {
    plan_type: string;
    discipline: string;
    title_block: {
      plan_number: string | null;
      plan_title: string | null;
      scale: string | null;
      date: string | null;
      author: string | null;
      company: string | null;
      revision: string | null;
    } | null;
    legend_items: { symbol: string; description: string; color?: string | null }[];
    quantities: {
      category: string;
      item: string;
      quantity: number | null;
      unit: string;
      specification?: string | null;
      confidence: "high" | "medium" | "low";
    }[];
    observations: string[];
    summary: string;
  };
}

export const STATUS_CONFIG: Record<PlanStatus, { labelKey: string; color: string; bg: string; icon: React.ElementType }> = {
  active: { labelKey: "statusActive", color: "text-green-700", bg: "bg-green-50 border-green-200", icon: CheckCircle },
  superseded: { labelKey: "statusSuperseded", color: "text-gray-500", bg: "bg-gray-50 border-gray-200", icon: XCircle },
  withdrawn: { labelKey: "statusWithdrawn", color: "text-gray-400", bg: "bg-gray-50 border-gray-200", icon: XCircle },
  for_approval: { labelKey: "statusForApproval", color: "text-amber-600", bg: "bg-amber-50 border-amber-200", icon: Clock },
  approved: { labelKey: "statusApproved", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: CheckCircle },
  rejected: { labelKey: "statusRejected", color: "text-red-600", bg: "bg-red-50 border-red-200", icon: AlertTriangle },
};

export const VALIDATION_CONFIG: Record<PlanValidationStatus, { labelKey: string; color: string; bg: string; icon: React.ElementType }> = {
  pending: { labelKey: "validationPending", color: "text-amber-600", bg: "bg-amber-50", icon: Clock },
  approved: { labelKey: "validationApproved", color: "text-green-600", bg: "bg-green-50", icon: CheckCircle },
  rejected: { labelKey: "validationRejected", color: "text-red-600", bg: "bg-red-50", icon: XCircle },
  for_info: { labelKey: "validationForInfo", color: "text-blue-600", bg: "bg-blue-50", icon: Eye },
};

export const DISCIPLINE_KEYS: Record<string, string> = {
  architecture: "disciplineArchitecture",
  structure: "disciplineStructure",
  cvcs: "disciplineCvcs",
  electricite: "disciplineElectricite",
  sanitaire: "disciplineSanitaire",
  facades: "disciplineFacades",
  amenagement: "disciplineAmenagement",
};

export const DISCIPLINE_COLORS: Record<string, string> = {
  architecture: "bg-blue-100 text-blue-700",
  structure: "bg-orange-100 text-orange-700",
  cvcs: "bg-cyan-100 text-cyan-700",
  electricite: "bg-yellow-100 text-yellow-700",
  sanitaire: "bg-teal-100 text-teal-700",
  facades: "bg-purple-100 text-purple-700",
  amenagement: "bg-green-100 text-green-700",
};

export const PLAN_TYPE_KEYS: Record<string, string> = {
  planting: "planTypePlanting",
  network: "planTypeNetwork",
  site_layout: "planTypeSiteLayout",
  electrical: "planTypeElectrical",
  facade: "planTypeFacade",
  structural: "planTypeStructural",
  hvac: "planTypeHvac",
  plumbing: "planTypePlumbing",
  architecture: "planTypeArchitecture",
  other: "planTypeOther",
};

export const CONFIDENCE_CONFIG = {
  high: { labelKey: "confidenceHigh", color: "bg-green-500" },
  medium: { labelKey: "confidenceMedium", color: "bg-amber-400" },
  low: { labelKey: "confidenceLow", color: "bg-red-400" },
};

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getFullYear()).slice(2)}`;
}

export function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${formatDate(dateStr)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
