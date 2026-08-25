"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2, Mail, Send, X } from "lucide-react";
import { withFallback } from "./pv-i18n";
import type { PVParticipant } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface PVSendModalProps {
  participants: PVParticipant[];
  projectName: string;
  /** Meeting id — used to persist an edited opposition deadline. */
  meetingId: string;
  meetingNumber: number | string | null;
  /** Days printed on the PDF and repeated in the mail. */
  oppositionDeadlineDays: number;
  sending: boolean;
  onSend: (payload: {
    recipients: string[];
    message?: string;
  }) => Promise<{ ok: boolean; error?: string; warnings?: string[] }>;
  onClose: () => void;
  onSent: () => void;
}

/**
 * "Envoyer le PV" — the step that turns a written PV into a circulated,
 * opposable one. Recipients default to the participants who have an address:
 * the séance decided who is concerned, the modal should not ask again.
 */
export function PVSendModal({
  participants,
  projectName,
  meetingId,
  meetingNumber,
  oppositionDeadlineDays,
  sending,
  onSend,
  onClose,
  onSent,
}: PVSendModalProps) {
  const t = withFallback(useTranslations("pv"));

  // Editable per-meeting deadline. Persisted on blur so the PDF and the mail
  // announce the value the user actually intends, not a fixed org default.
  const [deadline, setDeadline] = useState<number>(oppositionDeadlineDays);
  const persistDeadline = async (value: number) => {
    if (!Number.isInteger(value) || value < 0 || value > 365) return;
    if (value === oppositionDeadlineDays) return;
    try {
      await fetch(`/api/pv/${meetingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opposition_deadline_days: value }),
      });
    } catch {
      /* non-blocking: the value still rides the send if the PUT is retried */
    }
  };

  const withEmail = useMemo(
    () => participants.filter((p) => p.email && EMAIL_RE.test(p.email.trim())),
    [participants]
  );

  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(withEmail.map((p) => p.email!.trim().toLowerCase()))
  );
  const [extra, setExtra] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  /** Free-form field accepts commas, semicolons, newlines and spaces. */
  const extraAddresses = useMemo(
    () =>
      extra
        .split(/[,;\s]+/)
        .map((a) => a.trim())
        .filter(Boolean),
    [extra]
  );
  const invalidExtra = extraAddresses.filter((a) => !EMAIL_RE.test(a));

  const recipients = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const p of withEmail) {
      const address = p.email!.trim();
      if (!checked.has(address.toLowerCase())) continue;
      if (seen.has(address.toLowerCase())) continue;
      seen.add(address.toLowerCase());
      list.push(address);
    }
    for (const address of extraAddresses) {
      if (!EMAIL_RE.test(address)) continue;
      if (seen.has(address.toLowerCase())) continue;
      seen.add(address.toLowerCase());
      list.push(address);
    }
    return list;
  }, [withEmail, checked, extraAddresses]);

  const toggle = (email: string) => {
    const key = email.trim().toLowerCase();
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSend = async () => {
    setError(null);
    if (recipients.length === 0) {
      setError(t("send_recipients") + " : " + t("send_no_participant_email"));
      return;
    }
    if (invalidExtra.length > 0) {
      setError(`${t("invalid_address")} : ${invalidExtra.slice(0, 3).join(", ")}`);
      return;
    }

    // Persist any pending deadline edit before the send route re-reads it.
    await persistDeadline(deadline);

    const result = await onSend({
      recipients,
      message: message.trim() || undefined,
    });

    if (!result.ok) {
      setError(result.error || t("send_error"));
      return;
    }
    onSent();
  };

  const seance = meetingNumber != null ? ` n°${meetingNumber}` : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-[#27272A] bg-[#18181B] shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#27272A] px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#F97316]/10">
              <Mail className="h-4 w-4 text-[#F97316]" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[#FAFAFA]">
                {t("send_pv_title")}
              </h3>
              <p className="mt-0.5 text-xs text-[#A1A1AA]">
                {projectName}
                {seance}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded p-1 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <p className="text-xs leading-relaxed text-[#A1A1AA]">
            {t("send_pv_intro")}
          </p>

          {/* Participants */}
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-[#A1A1AA]">
              {t("send_participants")}
            </label>
            {withEmail.length === 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{t("send_no_participant_email")}</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                {withEmail.map((p, i) => {
                  const address = p.email!.trim();
                  const isChecked = checked.has(address.toLowerCase());
                  return (
                    <label
                      key={`${address}-${i}`}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 hover:border-[#3F3F46]"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(address)}
                        disabled={sending}
                        className="h-3.5 w-3.5 accent-[#F97316]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-[#FAFAFA]">
                          {p.name || address}
                          {!p.present && (
                            <span className="ml-1.5 text-[10px] text-[#A1A1AA]">
                              {t("participant_excused")}
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-[#A1A1AA]">
                          {[p.company, address].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Extra recipients */}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#A1A1AA]">
              {t("send_extra_recipients")}
            </label>
            <input
              type="text"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              disabled={sending}
              placeholder={t("send_extra_placeholder")}
              className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#52525B] focus:border-[#F97316] focus:outline-none disabled:opacity-50"
            />
            {invalidExtra.length > 0 && (
              <p className="mt-1 text-xs text-red-400">
                {invalidExtra.slice(0, 3).join(", ")}
              </p>
            )}
          </div>

          {/* Message */}
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#A1A1AA]">
              {t("send_message")}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={sending}
              rows={4}
              placeholder={t("send_message_placeholder")}
              className="w-full resize-y rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#52525B] focus:border-[#F97316] focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Opposition deadline — editable, persisted per meeting */}
          <div className="rounded-md border-l-2 border-[#F97316] bg-[#0F0F11] px-3 py-2.5">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#F97316]">
              {t("send_opposition")}
              <input
                type="number"
                min={0}
                max={365}
                value={deadline}
                disabled={sending}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setDeadline(Number.isNaN(v) ? 0 : Math.max(0, Math.min(365, v)));
                }}
                onBlur={() => persistDeadline(deadline)}
                className="w-16 rounded border border-[#27272A] bg-[#18181B] px-2 py-1 text-sm font-normal normal-case text-[#FAFAFA] focus:border-[#F97316] focus:outline-none disabled:opacity-50"
              />
              <span className="font-normal normal-case text-[#A1A1AA]">
                {t("send_opposition_days")}
              </span>
            </label>
            <p className="mt-1 text-xs leading-relaxed text-[#A1A1AA]">
              {t("send_opposition_hint")}
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-[#27272A] px-5 py-4">
          <span className="text-xs text-[#A1A1AA]">
            {recipients.length} {t("sent_to_count")}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="rounded-md border border-[#27272A] px-4 py-2 text-sm text-[#FAFAFA] hover:bg-[#27272A] disabled:opacity-50"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || recipients.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-[#0F0F11] hover:bg-[#EA580C] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("send_sending")}
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  {t("send_confirm")}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
