"use client";

import { Gavel, Star } from "lucide-react";
import type { Submission, Supplier, SupplierOffer, TranslateFn } from "./shared";
import { formatCHF } from "./shared";

interface NegotiationTabProps {
  submission: Submission;
  offers: SupplierOffer[];
  suppliers: Supplier[];
  t: TranslateFn;
}

export function NegotiationTab({ submission, offers, suppliers, t }: NegotiationTabProps) {
  if (offers.length === 0) {
    return (
      <div className="text-center py-16">
        <Gavel className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">{t("noSubmissions")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{offers.length}</div>
          <div className="text-xs text-gray-500 mt-1">{t("offersReceived", { count: offers.length, total: offers.length }).split("/")[0]}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">
            {offers.filter((o) => o.status === "awarded").length > 0 ? "1" : "0"}
          </div>
          <div className="text-xs text-gray-500 mt-1">{t("awarded")}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">
            {submission.estimated_total && submission.awarded_total
              ? `${Math.round((1 - submission.awarded_total / submission.estimated_total) * 100)}%`
              : "\u2014"}
          </div>
          <div className="text-xs text-gray-500 mt-1">{t("savings")}</div>
        </div>
      </div>

      {offers.map((offer) => {
        const supplier = suppliers.find((s) => s.id === offer.supplier_id);
        const isAwarded = offer.status === "awarded";
        return (
          <div key={offer.id} className={`bg-white border rounded-lg overflow-hidden ${isAwarded ? "border-emerald-300" : "border-gray-200"}`}>
            <div className={`px-4 py-3 flex items-center justify-between ${isAwarded ? "bg-emerald-50" : "bg-gray-50"} border-b`}>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-900">{supplier?.company_name}</span>
                {supplier?.status === "preferred" && (
                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  isAwarded ? "bg-emerald-100 text-emerald-700" :
                  offer.status === "rejected" ? "bg-red-100 text-red-700" :
                  "bg-blue-100 text-blue-700"
                }`}>
                  {isAwarded ? t("awarded") : offer.status === "rejected" ? "Non retenu" : t("negotiation")}
                </span>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-gray-900">{formatCHF(offer.total_amount || 0)}</div>
                {offer.discount_percent && offer.discount_percent > 0 && (
                  <div className="text-xs text-green-600">-{offer.discount_percent}% {t("reduction")}</div>
                )}
              </div>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-4 gap-4 text-xs text-gray-500">
                <div>
                  <div className="font-medium text-gray-600">{t("respondedAt")}</div>
                  <div>{new Date(offer.received_at).toLocaleDateString("fr-CH")}</div>
                </div>
                <div>
                  <div className="font-medium text-gray-600">{t("deadline")}</div>
                  <div>{offer.validity_date ? new Date(offer.validity_date).toLocaleDateString("fr-CH") : "\u2014"}</div>
                </div>
                <div>
                  <div className="font-medium text-gray-600">Paiement</div>
                  <div>{offer.payment_terms || "\u2014"}</div>
                </div>
                <div>
                  <div className="font-medium text-gray-600">{t("negotiationRound", { round: offer.negotiation_round })}</div>
                  <div>{offer.is_final ? "Offre finale" : "En cours"}</div>
                </div>
              </div>
              {offer.conditions_text && (
                <div className="mt-3 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded">
                  {offer.conditions_text}
                </div>
              )}
              {!isAwarded && offer.status !== "rejected" && (
                <div className="flex gap-2 mt-4">
                  <button className="text-xs px-3 py-1.5 bg-gold text-white rounded-md hover:bg-gold-dark">
                    {t("generateEmail")}
                  </button>
                  <button className="text-xs px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700">
                    {t("startNegotiation")}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
