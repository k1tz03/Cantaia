"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X, Loader2, AlertCircle } from "lucide-react";

interface TicketCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function TicketCreateModal({ open, onClose, onCreated }: TicketCreateModalProps) {
  const t = useTranslations("support");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("question");
  const [priority, setPriority] = useState("medium");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (!open) return null;

  const missingSubject = !subject.trim();
  const missingMessage = !message.trim() || message.trim().length < 10;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setError("");
    if (missingSubject || missingMessage) return;

    setSaving(true);
    try {
      // We pass files as empty attachments for now — the API creates the ticket,
      // then we could upload attachments to it. For simplicity, we upload first
      // to a temp path and include the URLs in the message.
      // Actually, let's just create the ticket with the message, no attachments on creation.
      // Users can add attachments via replies.

      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          priority,
          message: message.trim(),
          attachments: [],
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erreur serveur");
        setSaving(false);
        return;
      }

      // Reset
      setSubject("");
      setCategory("question");
      setPriority("medium");
      setMessage("");
      setSubmitted(false);
      onCreated();
      onClose();
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  const fieldErrorClass = "border-red-400 ring-1 ring-red-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-background shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-foreground">{t("newTicket")}</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-inset ring-red-500/20">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Subject */}
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">{t("subject")} *</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                className={`w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${submitted && missingSubject ? fieldErrorClass : "border-border"}`}
                placeholder={t("subjectPlaceholder")}
              />
            </div>

            {/* Category + Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">{t("category")} *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  <option value="bug">{t("categoryBug")}</option>
                  <option value="question">{t("categoryQuestion")}</option>
                  <option value="feature_request">{t("categoryFeature")}</option>
                  <option value="billing">{t("categoryBilling")}</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">{t("priority")} *</label>
                <div className="flex gap-3 mt-1.5">
                  {(["low", "medium", "high"] as const).map((p) => (
                    <label key={p} className="flex items-center gap-1.5 text-sm text-foreground">
                      <input
                        type="radio"
                        name="priority"
                        checked={priority === p}
                        onChange={() => setPriority(p)}
                        className="h-3.5 w-3.5 border-border text-primary"
                      />
                      {t(`priority${p.charAt(0).toUpperCase() + p.slice(1)}` as any)}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Message */}
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">{t("message")} *</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className={`w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${submitted && missingMessage ? fieldErrorClass : "border-border"}`}
                placeholder={t("messagePlaceholder")}
              />
              {submitted && missingMessage && (
                <p className="mt-1 text-xs text-red-600">Min. 10 caractères</p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-border px-5 py-3.5 flex items-center justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("send")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
