import type {
  Submission, SubmissionLot, SubmissionItem, PriceRequest,
  Supplier, PricingAlert, SupplierOffer, OfferLineItem,
  SubmissionStatus,
} from "@cantaia/database";

export type Tab = "items" | "suppliers" | "tracking" | "comparison" | "negotiation" | "intelligence" | "documents";

export const STATUS_COLORS: Record<SubmissionStatus, string> = {
  draft: "bg-[#27272A] text-[#A1A1AA]",
  parsed: "bg-blue-500/10 text-blue-400",
  requesting: "bg-amber-500/10 text-amber-400",
  offers_received: "bg-green-500/10 text-green-400",
  comparing: "bg-purple-500/10 text-purple-400",
  negotiating: "bg-orange-500/10 text-orange-400",
  awarded: "bg-emerald-500/10 text-emerald-400",
  archived: "bg-[#27272A] text-[#71717A]",
};

export type TranslateFn = (key: string, values?: any) => string;

export function formatCHF(amount: number): string {
  return new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount) + " CHF";
}

export type { Submission, SubmissionLot, SubmissionItem, PriceRequest, Supplier, PricingAlert, SupplierOffer, OfferLineItem, SubmissionStatus };
