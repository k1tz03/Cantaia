"use client";

import { Send, CheckCircle } from "lucide-react";
import type { Supplier, TranslateFn } from "./shared";

interface SendPriceRequestModalProps {
  previewEmail: { subject: string; body: string };
  selectedSuppliers: Set<string>;
  suppliers: Supplier[];
  sendDeadline: string;
  setSendDeadline: (v: string) => void;
  sendLanguage: "fr" | "en" | "de";
  setSendLanguage: (v: "fr" | "en" | "de") => void;
  sendingStatus: "idle" | "sending" | "sent";
  onSend: () => void;
  onClose: () => void;
  t: TranslateFn;
}

export function SendPriceRequestModal({
  previewEmail,
  selectedSuppliers,
  suppliers,
  sendDeadline,
  setSendDeadline,
  sendLanguage,
  setSendLanguage,
  sendingStatus,
  onSend,
  onClose,
  t,
}: SendPriceRequestModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[#0F0F11] rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-[#27272A] flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#FAFAFA]">{t("priceRequest")}</h3>
          <button onClick={onClose} className="text-[#71717A] hover:text-[#71717A] text-xl">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#71717A] mb-1">{t("deadline")}</label>
              <input
                type="date"
                value={sendDeadline}
                onChange={(e) => setSendDeadline(e.target.value)}
                className="w-full px-3 py-2 border border-[#27272A] rounded-md text-sm bg-[#0F0F11]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#71717A] mb-1">Langue</label>
              <select
                value={sendLanguage}
                onChange={(e) => setSendLanguage(e.target.value as "fr" | "en" | "de")}
                className="w-full px-3 py-2 border border-[#27272A] rounded-md text-sm bg-[#0F0F11]"
              >
                <option value="fr">Français</option>
                <option value="en">English</option>
                <option value="de">Deutsch</option>
              </select>
            </div>
          </div>

          <div className="bg-[#27272A] border border-[#27272A] rounded-lg p-3">
            <div className="text-xs font-medium text-[#71717A] mb-2">
              {selectedSuppliers.size} {t("tabSuppliers").toLowerCase()} {t("filterStatus").toLowerCase()}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(new Set(
                Array.from(selectedSuppliers).map((key) => key.split(":")[1])
              )).map((supplierId) => {
                const supplier = suppliers.find((s) => s.id === supplierId);
                return (
                  <span key={supplierId} className="text-xs bg-[#F97316]/10 text-[#F97316] px-2 py-0.5 rounded">
                    {supplier?.company_name || supplierId}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="border border-[#27272A] rounded-lg overflow-hidden">
            <div className="bg-[#27272A] px-4 py-2 border-b border-[#27272A]">
              <div className="text-xs text-[#71717A]">Objet :</div>
              <div className="text-sm font-medium text-[#FAFAFA]">{previewEmail.subject}</div>
            </div>
            <div className="px-4 py-3 text-sm text-[#FAFAFA] whitespace-pre-wrap leading-relaxed max-h-60 overflow-auto">
              {previewEmail.body}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#27272A] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-[#27272A] rounded-md text-sm text-[#FAFAFA] hover:bg-[#27272A]"
          >
            {t("title") === "Soumissions" ? "Annuler" : "Cancel"}
          </button>
          <button
            onClick={onSend}
            disabled={sendingStatus !== "idle"}
            className="px-6 py-2 bg-gold text-white rounded-md text-sm font-medium hover:bg-gold-dark disabled:opacity-50 flex items-center gap-2"
          >
            {sendingStatus === "sending" && <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {sendingStatus === "sent" && <CheckCircle className="h-3.5 w-3.5" />}
            {sendingStatus === "idle" && <Send className="h-3.5 w-3.5" />}
            {sendingStatus === "sent" ? t("sent") : t("sendRequests")}
          </button>
        </div>
      </div>
    </div>
  );
}
