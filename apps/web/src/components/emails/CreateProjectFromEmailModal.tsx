"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  X,
  Loader2,
  Building2,
  MapPin,
  FileText,
  User,
  Users,
} from "lucide-react";
import type { EmailRecord, SuggestedProjectData } from "@cantaia/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateProjectFromEmailModalProps {
  email: EmailRecord;
  suggestedProject: SuggestedProjectData | null;
  onClose: () => void;
  onCreated: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateProjectFromEmailModal({
  email,
  suggestedProject,
  onClose,
  onCreated,
}: CreateProjectFromEmailModalProps) {
  const t = useTranslations("classification");

  // Form state — pre-filled from AI-extracted data
  const [name, setName] = useState(suggestedProject?.name ?? "");
  const [reference, setReference] = useState(suggestedProject?.reference ?? "");
  const [client, setClient] = useState(suggestedProject?.client ?? "");
  const [city, setCity] = useState(suggestedProject?.location ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contacts = suggestedProject?.extracted_contacts ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/emails/create-project-from-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_id: email.id,
          project: {
            name: name.trim(),
            code: reference.trim() || null,
            client_name: client.trim() || null,
            city: city.trim() || null,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t("createError"));
      }

      onCreated();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erreur inattendue";
      setError(message);
      console.error("[CreateProjectFromEmail] error:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal card */}
      <div className="relative z-10 w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              {t("createProjectTitle")}
            </h2>
            <p className="text-[11px] text-slate-500 truncate max-w-[360px]">
              {email.sender_name || email.sender_email} — &laquo;{email.subject}&raquo;
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto p-5">
          <div className="space-y-4">
            {/* Project name */}
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                {t("projectName")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder={t("projectNamePlaceholder")}
              />
            </div>

            {/* Code / Reference */}
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <FileText className="h-3.5 w-3.5 text-slate-400" />
                {t("codeReference")}
              </label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder={t("codePlaceholder")}
              />
            </div>

            {/* Client */}
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <User className="h-3.5 w-3.5 text-slate-400" />
                {t("client")}
              </label>
              <input
                type="text"
                value={client}
                onChange={(e) => setClient(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder={t("clientPlaceholder")}
              />
            </div>

            {/* City */}
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                {t("city")}
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                placeholder={t("cityPlaceholder")}
              />
            </div>

            {/* Extracted contacts (read-only) */}
            {contacts.length > 0 && (
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-700">
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  {t("extractedContacts")}
                </label>
                <div className="rounded-md border border-slate-200 bg-slate-50 divide-y divide-slate-100">
                  {contacts.map((contact, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-brand shrink-0">
                        <span className="text-[10px] font-bold">
                          {contact.name
                            .split(" ")
                            .map((w) => w[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">
                          {contact.name}
                          {contact.role && (
                            <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                              ({contact.role})
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {contact.company && `${contact.company} · `}
                          {contact.email}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  {t("contactsInfo")}
                </p>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-5 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("createProject")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
