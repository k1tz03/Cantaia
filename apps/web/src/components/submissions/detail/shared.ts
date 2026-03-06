import type {
  Submission, SubmissionLot, SubmissionItem, PriceRequest,
  Supplier, PricingAlert, SupplierOffer, OfferLineItem,
  SubmissionStatus,
} from "@cantaia/database";

export type Tab = "items" | "suppliers" | "tracking" | "comparison" | "negotiation" | "intelligence" | "documents";

export const STATUS_COLORS: Record<SubmissionStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  parsed: "bg-blue-50 text-blue-700",
  requesting: "bg-amber-50 text-amber-700",
  offers_received: "bg-green-50 text-green-700",
  comparing: "bg-purple-50 text-purple-700",
  negotiating: "bg-orange-50 text-orange-700",
  awarded: "bg-emerald-50 text-emerald-700",
  archived: "bg-gray-100 text-gray-500",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TranslateFn = (key: string, values?: any) => string;

export function formatCHF(amount: number): string {
  return new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount) + " CHF";
}

export type { Submission, SubmissionLot, SubmissionItem, PriceRequest, Supplier, PricingAlert, SupplierOffer, OfferLineItem, SubmissionStatus };
