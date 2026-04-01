// ── Shared Types & Helpers for Cantaia Prix ──

export interface PlanOption {
  id: string;
  plan_number: string;
  plan_title: string;
  project?: { id: string; name: string } | null;
}

export interface PricingConfig {
  hourly_rate: number;
  site_location: string;
  departure_location: string;
  margin_level: "tight" | "standard" | "comfortable" | "custom";
  custom_margin_percent?: number;
  default_exclusions: string[];
  default_scope: "general" | "line_by_line";
}

export interface EstimateLineItem {
  category: string;
  item: string;
  quantity: number | null;
  unit: string;
  unit_price: number;
  total_price: number;
  confidence: "high" | "medium" | "low";
  source: "db_historical" | "ai_knowledge";
  cfc_code?: string;
  source_detail?: string;
  db_matches?: number;
  margin_applied?: number;
  price_range?: { min: number; max: number; median: number };
}

export interface EstimateResult {
  line_items: EstimateLineItem[];
  subtotal: number;
  margin_total: number;
  transport_cost: number;
  grand_total: number;
  db_coverage_percent: number;
  confidence_summary: { high: number; medium: number; low: number };
}

export interface AnalysisData {
  id: string;
  analysis_result?: {
    quantities?: Array<{
      item: string;
      quantity: number;
      unit: string;
    }>;
  };
  plan_id?: string;
}

export type Tab = "estimate" | "import" | "analysis" | "history";

// ── Helpers ──

export function formatCHF(amount: number): string {
  return new Intl.NumberFormat("fr-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

export function exportCSV(items: EstimateLineItem[], totals: { subtotal: number; margin: number; transport: number; grand: number }) {
  const header = "Poste;Qté;Unité;PU (CHF);Total (CHF);Confiance;Source\n";
  const rows = items
    .map(
      (item) =>
        `"${item.item}";${item.quantity ?? 0};"${item.unit}";${item.unit_price.toFixed(2)};${item.total_price.toFixed(2)};${item.confidence};${item.source === "db_historical" ? "BD" : "IA"}`
    )
    .join("\n");
  const summary = `\n\nSous-total;;;;;;${totals.subtotal.toFixed(2)}\nMarge;;;;;;${totals.margin.toFixed(2)}\nTransport;;;;;;${totals.transport.toFixed(2)}\nTotal estimé;;;;;;${totals.grand.toFixed(2)}`;
  const csv = header + rows + summary;
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  import("@/lib/tauri").then(({ saveFileWithDialog }) =>
    saveFileWithDialog(`cantaia-estimation-${new Date().toISOString().split("T")[0]}.csv`, blob)
  );
}

export const MARGIN_OPTIONS = [
  { value: "tight" as const, label: "Serré (5%)", percent: 5 },
  { value: "standard" as const, label: "Standard (12%)", percent: 12 },
  { value: "comfortable" as const, label: "Confortable (20%)", percent: 20 },
  { value: "custom" as const, label: "Personnalisé", percent: 0 },
];

export const DEFAULT_CONFIG: PricingConfig = {
  hourly_rate: 95,
  site_location: "",
  departure_location: "",
  margin_level: "standard",
  default_exclusions: [],
  default_scope: "line_by_line",
};

export function confidenceColor(level: "high" | "medium" | "low") {
  switch (level) {
    case "high":
      return "bg-green-500";
    case "medium":
      return "bg-amber-500";
    case "low":
      return "bg-red-500";
  }
}

export function confidenceLabel(level: "high" | "medium" | "low") {
  switch (level) {
    case "high":
      return "Élevée";
    case "medium":
      return "Moyenne";
    case "low":
      return "Faible";
  }
}
