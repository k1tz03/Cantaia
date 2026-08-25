"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, Plus, Users, X } from "lucide-react";
import { withFallback } from "./pv-i18n";
import type { PVParticipant } from "./types";

interface PVHeaderEditorProps {
  pvContent: any;
  setPvContent: (content: any) => void;
  isFinalized: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY_PARTICIPANT: PVParticipant = {
  name: "",
  company: "",
  role: "",
  present: true,
  email: "",
};

export function PVHeaderEditor({
  pvContent,
  setPvContent,
  isFinalized,
}: PVHeaderEditorProps) {
  const rawT = useTranslations("pv");
  const t = withFallback(rawT);

  const participants: PVParticipant[] = pvContent.header?.participants ?? [];

  const setHeader = (patch: Record<string, unknown>) =>
    setPvContent({ ...pvContent, header: { ...pvContent.header, ...patch } });

  const setParticipants = (next: PVParticipant[]) =>
    setHeader({ participants: next });

  const updateParticipant = (
    index: number,
    field: keyof PVParticipant,
    value: string | boolean
  ) =>
    setParticipants(
      participants.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );

  // The e-mail addresses collected here are what the "Envoyer le PV" modal
  // proposes as recipients — a participant without one simply cannot receive
  // the PV, so the warning below is worth its pixels.
  const withEmail = participants.filter(
    (p) => p.email && EMAIL_RE.test(p.email.trim())
  ).length;
  const missingEmail = participants.filter((p) => p.name?.trim()).length - withEmail;

  return (
    <div className="mb-6 space-y-4 rounded-lg border border-[#27272A] bg-[#0F0F11] p-4">
      {/* Date + location */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-[#A1A1AA]">
            {rawT("date")}
          </label>
          <input
            type="text"
            value={pvContent.header?.date || ""}
            onChange={(e) => setHeader({ date: e.target.value })}
            className="w-full rounded border border-[#27272A] bg-[#18181B] px-2 py-1.5 text-sm text-[#FAFAFA] disabled:bg-[#27272A]"
            disabled={isFinalized}
            placeholder={rawT("date")}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[#A1A1AA]">
            {rawT("location")}
          </label>
          <input
            type="text"
            value={pvContent.header?.location || ""}
            onChange={(e) => setHeader({ location: e.target.value })}
            className="w-full rounded border border-[#27272A] bg-[#18181B] px-2 py-1.5 text-sm text-[#FAFAFA] disabled:bg-[#27272A]"
            disabled={isFinalized}
          />
        </div>
      </div>

      {/* Participants + circulation addresses */}
      <div className="border-t border-[#27272A] pt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[#A1A1AA]">
            <Users className="h-3.5 w-3.5" />
            {t("participants_section")} ({participants.length})
          </h3>
          {!isFinalized && (
            <button
              type="button"
              onClick={() => setParticipants([...participants, { ...EMPTY_PARTICIPANT }])}
              className="inline-flex items-center gap-1 text-xs text-[#F97316] hover:text-[#EA580C]"
            >
              <Plus className="h-3 w-3" />
              {rawT("add_participant")}
            </button>
          )}
        </div>

        <p className="mb-2.5 text-[11px] leading-relaxed text-[#A1A1AA]">
          {t("participants_hint")}
        </p>

        {participants.length === 0 ? (
          <p className="text-xs text-[#A1A1AA]">—</p>
        ) : (
          <div className="space-y-2">
            {participants.map((p, i) => {
              const email = (p.email || "").trim();
              const emailInvalid = email.length > 0 && !EMAIL_RE.test(email);
              return (
                <div
                  key={i}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-[#27272A] bg-[#18181B] p-2"
                >
                  <input
                    type="text"
                    value={p.name || ""}
                    onChange={(e) => updateParticipant(i, "name", e.target.value)}
                    disabled={isFinalized}
                    placeholder={rawT("participant_name")}
                    className="min-w-[120px] flex-1 rounded border border-[#27272A] bg-[#0F0F11] px-2 py-1.5 text-sm text-[#FAFAFA] placeholder:text-[#52525B] focus:border-[#F97316] focus:outline-none disabled:opacity-60"
                  />
                  <input
                    type="text"
                    value={p.company || ""}
                    onChange={(e) => updateParticipant(i, "company", e.target.value)}
                    disabled={isFinalized}
                    placeholder={rawT("company")}
                    className="w-28 rounded border border-[#27272A] bg-[#0F0F11] px-2 py-1.5 text-sm text-[#FAFAFA] placeholder:text-[#52525B] focus:border-[#F97316] focus:outline-none disabled:opacity-60"
                  />
                  <input
                    type="email"
                    value={p.email || ""}
                    onChange={(e) => updateParticipant(i, "email", e.target.value)}
                    disabled={isFinalized}
                    placeholder={t("participant_email_placeholder")}
                    className={`min-w-[160px] flex-1 rounded border bg-[#0F0F11] px-2 py-1.5 text-sm text-[#FAFAFA] placeholder:text-[#52525B] focus:outline-none disabled:opacity-60 ${
                      emailInvalid
                        ? "border-red-500/50 focus:border-red-500"
                        : "border-[#27272A] focus:border-[#F97316]"
                    }`}
                  />
                  <select
                    value={p.present ? "present" : "excused"}
                    onChange={(e) =>
                      updateParticipant(i, "present", e.target.value === "present")
                    }
                    disabled={isFinalized}
                    className="rounded border border-[#27272A] bg-[#0F0F11] px-2 py-1.5 text-xs text-[#FAFAFA] focus:border-[#F97316] focus:outline-none disabled:opacity-60"
                  >
                    <option value="present">{rawT("present")}</option>
                    <option value="excused">{rawT("excused")}</option>
                  </select>
                  {!isFinalized && (
                    <button
                      type="button"
                      onClick={() =>
                        setParticipants(participants.filter((_, idx) => idx !== i))
                      }
                      className="rounded p-1 text-[#A1A1AA] hover:bg-red-500/10 hover:text-red-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {missingEmail > 0 && (
          <div className="mt-2.5 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-2.5 text-[11px] text-amber-300">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              {missingEmail} participant(s) sans adresse e-mail — ils ne recevront pas le PV.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
