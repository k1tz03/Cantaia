"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Send,
  Plus,
  Trash2,
  CheckCircle,
  Loader2,
  Users,
  Mail,
} from "lucide-react";
import { cn, Dialog } from "@cantaia/ui";

interface Recipient {
  name: string;
  company: string;
  email: string;
  selected: boolean;
}

interface PlanDistributeModalProps {
  planNumber: string;
  planTitle: string;
  versionCode: string;
  fileName: string;
  previousRecipients: { name: string; company: string; email: string }[];
  isOpen: boolean;
  onClose: () => void;
}

export function PlanDistributeModal({
  planNumber,
  planTitle,
  versionCode,
  fileName,
  previousRecipients,
  isOpen,
  onClose,
}: PlanDistributeModalProps) {
  const t = useTranslations("plans");

  const [recipients, setRecipients] = useState<Recipient[]>(
    previousRecipients.map((r) => ({ ...r, selected: true }))
  );
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const addRecipient = () => {
    if (!newEmail) return;
    setRecipients([
      ...recipients,
      { name: newName || newEmail, company: newCompany, email: newEmail, selected: true },
    ]);
    setNewEmail("");
    setNewName("");
    setNewCompany("");
  };

  const removeRecipient = (index: number) => {
    setRecipients(recipients.filter((_, i) => i !== index));
  };

  const toggleRecipient = (index: number) => {
    setRecipients(recipients.map((r, i) => i === index ? { ...r, selected: !r.selected } : r));
  };

  const selectedCount = recipients.filter((r) => r.selected).length;

  const handleSend = () => {
    if (selectedCount === 0) return;
    setSending(true);
    // Mock: simulate sending via Outlook
    setTimeout(() => {
      setSending(false);
      setSent(true);
      setTimeout(() => onClose(), 1500);
    }, 2000);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => { if (!next) onClose(); }}
      title={t("distributePlan")}
      description={`${planNumber} — ${planTitle} (V-${versionCode})`}
      size="md"
      dismissible={!sending}
      footer={
        !sent ? (
          <>
            <button
              onClick={onClose}
              className="rounded-md border border-[#27272A] px-3 py-1.5 text-xs font-medium text-[#A1A1AA] hover:bg-[#27272A]"
            >
              {t("cancelDistribution")}
            </button>
            <button
              onClick={handleSend}
              disabled={selectedCount === 0 || sending}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-medium shadow-sm transition-colors",
                selectedCount > 0 && !sending
                  ? "bg-[#F97316] text-[#0F0F11] hover:bg-[#EA580C]"
                  : "bg-[#27272A] text-[#A1A1AA] cursor-not-allowed"
              )}
            >
              {sending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("sendingDistribution")}
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  {t("sendDistribution", { count: selectedCount })}
                </>
              )}
            </button>
          </>
        ) : undefined
      }
    >
        <div>
          {sent ? (
            <div className="flex flex-col items-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mb-3" />
              <p className="text-sm font-medium text-[#FAFAFA]">{t("distributionSent")}</p>
              <p className="text-xs text-[#A1A1AA] mt-1">{t("distributionSentDescription", { count: selectedCount })}</p>
            </div>
          ) : (
            <>
              {/* Recipients list */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {t("recipients")} ({selectedCount})
                  </label>
                  {previousRecipients.length > 0 && (
                    <span className="text-[10px] text-[#A1A1AA]">{t("fromPreviousDistribution")}</span>
                  )}
                </div>

                <div className="space-y-1.5">
                  {recipients.map((r, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-3 py-2 transition-colors",
                        r.selected
                          ? "border-[#F97316]/30 bg-[#F97316]/10"
                          : "border-[#27272A] bg-[#27272A] opacity-60"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={() => toggleRecipient(i)}
                        className="h-3.5 w-3.5 rounded border-[#27272A] text-brand focus:ring-brand"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#FAFAFA] truncate">{r.name}</p>
                        <p className="text-[10px] text-[#A1A1AA] truncate">{r.company} · {r.email}</p>
                      </div>
                      <button onClick={() => removeRecipient(i)} className="rounded p-1 text-[#A1A1AA] hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add recipient */}
              <div className="mb-4 rounded-md border border-dashed border-[#27272A] p-3">
                <p className="text-[11px] font-medium text-[#A1A1AA] mb-2">{t("addRecipient")}</p>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={t("recipientName")}
                    className="rounded-md border border-[#27272A] px-2.5 py-1.5 text-xs text-[#FAFAFA] placeholder:text-[#A1A1AA] focus:border-brand focus:outline-none"
                  />
                  <input
                    type="text"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    placeholder={t("recipientCompany")}
                    className="rounded-md border border-[#27272A] px-2.5 py-1.5 text-xs text-[#FAFAFA] placeholder:text-[#A1A1AA] focus:border-brand focus:outline-none"
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="flex-1 rounded-md border border-[#27272A] px-2.5 py-1.5 text-xs text-[#FAFAFA] placeholder:text-[#A1A1AA] focus:border-brand focus:outline-none"
                      onKeyDown={(e) => e.key === "Enter" && addRecipient()}
                    />
                    <button aria-label="Ajouter"
                      onClick={addRecipient}
                      disabled={!newEmail}
                      className="rounded-md bg-[#27272A] px-2 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA] disabled:opacity-40"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Custom message */}
              <div className="mb-4">
                <label className="text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] mb-1.5 block flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  {t("distributionMessage")}
                </label>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={3}
                  placeholder={t("distributionMessagePlaceholder")}
                  className="w-full rounded-md border border-[#27272A] px-3 py-2 text-xs text-[#FAFAFA] placeholder:text-[#A1A1AA] focus:border-brand focus:outline-none resize-none"
                />
                <p className="text-[10px] text-[#A1A1AA] mt-1">
                  {t("distributionAttachment")}: {fileName}
                </p>
              </div>
            </>
          )}
        </div>
    </Dialog>
  );
}
