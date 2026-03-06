"use client";

import { Send } from "lucide-react";
import type { PriceRequest, Supplier, TranslateFn } from "./shared";

interface TrackingTabProps {
  priceRequests: PriceRequest[];
  suppliers: Supplier[];
  t: TranslateFn;
}

export function TrackingTab({ priceRequests, suppliers, t }: TrackingTabProps) {
  const respondedCount = priceRequests.filter((pr) => pr.status === "responded").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">
              {t("suppliersResponded", { count: respondedCount, total: priceRequests.length })}
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
              {respondedCount} {t("responded").toLowerCase()}
            </span>
            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
              {priceRequests.filter((pr) => pr.status === "sent" || pr.status === "opened").length} {t("waiting").toLowerCase()}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {priceRequests.map((pr) => {
          const supplier = suppliers.find((s) => s.id === pr.supplier_id);
          const daysSinceSent = pr.sent_at
            ? Math.floor((Date.now() - new Date(pr.sent_at).getTime()) / 86400000)
            : 0;
          const isOverdue = pr.deadline && new Date(pr.deadline) < new Date() && pr.status !== "responded";
          const statusColor =
            pr.status === "responded" ? "border-l-green-500 bg-green-50/30"
              : isOverdue ? "border-l-red-500 bg-red-50/30"
              : pr.status === "opened" ? "border-l-blue-500 bg-blue-50/30"
                : "border-l-amber-500 bg-amber-50/30";
          return (
            <div key={pr.id} className={`bg-white border border-gray-200 border-l-4 rounded-lg p-4 ${statusColor}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{supplier?.company_name}</div>
                    <div className="text-xs text-gray-500">{supplier?.contact_name} · {supplier?.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isOverdue && (
                    <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                      {t("overdue")}
                    </span>
                  )}
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    pr.status === "responded" ? "bg-green-100 text-green-700"
                      : pr.status === "opened" ? "bg-blue-100 text-blue-700"
                        : "bg-amber-100 text-amber-700"
                  }`}>
                    {t(pr.status as "sent")}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-6 mt-3 text-xs text-gray-500">
                <span>{t("sentAt")} : {pr.sent_at ? new Date(pr.sent_at).toLocaleDateString("fr-CH") : "\u2014"}</span>
                <span>{t("openedAt")} : {pr.opened_at ? new Date(pr.opened_at).toLocaleDateString("fr-CH") : <span className="text-red-500">{t("notOpened")}</span>}</span>
                {pr.status === "responded" && <span className="text-green-600">{t("respondedAt")} ✅</span>}
                {daysSinceSent > 0 && pr.status !== "responded" && (
                  <span className="text-gray-400">{t("trackingDays", { days: daysSinceSent })}</span>
                )}
              </div>

              {pr.status !== "responded" && (
                <div className="flex items-center gap-2 mt-3">
                  <div className="flex gap-1">
                    {[3, 5, 7].map((day) => {
                      const isDone = pr.reminder_count >= (day === 3 ? 1 : day === 5 ? 2 : 3);
                      const isNext = daysSinceSent >= day && !isDone;
                      return (
                        <span
                          key={day}
                          className={`text-[10px] px-2 py-0.5 rounded border ${
                            isDone ? "bg-amber-100 text-amber-700 border-amber-200"
                              : isNext ? "bg-amber-50 text-amber-600 border-amber-300 animate-pulse"
                                : "bg-gray-50 text-gray-400 border-gray-200"
                          }`}
                        >
                          {day === 3 ? t("reminderJ3") : day === 5 ? t("reminderJ5") : t("reminderJ7")}
                        </span>
                      );
                    })}
                  </div>
                  {pr.reminder_enabled !== false && (
                    <button className="text-[10px] text-gray-400 hover:text-red-500 ml-auto">
                      {t("disableReminder")}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
