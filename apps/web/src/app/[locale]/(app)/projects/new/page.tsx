"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { ArrowLeft, Plus, X, Loader2, Sparkles } from "lucide-react";

const statusOptions = ["planning", "active", "paused"] as const;
const currencyOptions = ["CHF", "EUR"] as const;

const colorPresets = [
  "#6366F1", "#EC4899", "#F59E0B", "#10B981", "#8B5CF6",
  "#EF4444", "#3B82F6", "#14B8A6", "#F97316", "#06B6D4",
];

export default function NewProjectPage() {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const router = useRouter();

  const [form, setForm] = useState({
    name: "",
    code: "",
    description: "",
    client_name: "",
    address: "",
    city: "Lausanne",
    status: "active" as string,
    start_date: "",
    end_date: "",
    budget_total: "",
    currency: "CHF",
    color: "#6366F1",
    email_keywords: [] as string[],
    email_senders: [] as string[],
  });

  const [keywordInput, setKeywordInput] = useState("");
  const [senderInput, setSenderInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Track manually added keywords to avoid overwriting them
  const manualKeywords = useRef<Set<string>>(new Set());

  // Stop words to exclude from auto-generated keywords
  const STOP_WORDS = new Set([
    "le", "la", "les", "de", "du", "des", "un", "une", "et", "en", "au", "aux",
    "sa", "sàrl", "srl", "ag", "gmbh",
    "the", "and", "for", "mit", "von", "der", "die", "das",
  ]);

  /** Extract meaningful keywords from project fields */
  function generateKeywords(): string[] {
    const parts: string[] = [];

    // Full project name as one keyword
    if (form.name.trim()) parts.push(form.name.trim().toLowerCase());

    // Project code
    if (form.code.trim()) parts.push(form.code.trim().toLowerCase());

    // Client name
    if (form.client_name.trim()) parts.push(form.client_name.trim().toLowerCase());

    // Individual significant words from name and client (3+ chars, no stop words)
    const allText = `${form.name} ${form.client_name}`;
    const words = allText
      .toLowerCase()
      .split(/[\s,.\-_/]+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
    parts.push(...words);

    // Deduplicate
    return [...new Set(parts)];
  }

  // Auto-populate keywords when relevant fields change
  useEffect(() => {
    const autoKeywords = generateKeywords();
    setForm((prev) => {
      // Merge auto-generated with manually added keywords
      const manual = [...manualKeywords.current];
      const merged = [...new Set([...autoKeywords, ...manual])];
      return { ...prev, email_keywords: merged };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name, form.code, form.client_name]);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function addKeyword() {
    const kw = keywordInput.trim().toLowerCase();
    if (kw && !form.email_keywords.includes(kw)) {
      manualKeywords.current.add(kw);
      setForm((prev) => ({
        ...prev,
        email_keywords: [...prev.email_keywords, kw],
      }));
      setKeywordInput("");
    }
  }

  function removeKeyword(kw: string) {
    manualKeywords.current.delete(kw);
    setForm((prev) => ({
      ...prev,
      email_keywords: prev.email_keywords.filter((k) => k !== kw),
    }));
  }

  function addSender() {
    const s = senderInput.trim().toLowerCase();
    if (s && !form.email_senders.includes(s)) {
      setForm((prev) => ({
        ...prev,
        email_senders: [...prev.email_senders, s],
      }));
      setSenderInput("");
    }
  }

  function removeSender(s: string) {
    setForm((prev) => ({
      ...prev,
      email_senders: prev.email_senders.filter((x) => x !== s),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    try {
      console.log("[NewProject] Submitting project:", form.name);
      const res = await fetch("/api/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      console.log("[NewProject] API response:", data);

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Erreur lors de la création du projet");
        return;
      }

      router.push("/projects");
    } catch (err) {
      console.error("[NewProject] Error:", err);
      setErrorMsg("Erreur de connexion au serveur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-[#0F0F11] p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/projects"
          className="rounded-lg p-2 text-[#71717A] hover:bg-[#27272A] hover:text-[#71717A]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#FAFAFA]">
            {t("newProject")}
          </h1>
          <p className="mt-1 text-sm text-[#71717A]">{t("newProjectDesc")}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 max-w-3xl">
        {/* Section: Informations générales */}
        <fieldset className="rounded-xl border border-[#27272A] bg-[#0F0F11] p-6 shadow-sm">
          <legend className="px-2 text-sm font-semibold text-[#FAFAFA]">
            {t("generalInfo")}
          </legend>

          <div className="grid gap-5 sm:grid-cols-2">
            {/* Nom du projet */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[#FAFAFA]">
                {t("projectName")} *
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="Résidence Les Cèdres"
                className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>

            {/* Code projet */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#FAFAFA]">
                {t("projectCode")}
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => updateField("code", e.target.value)}
                placeholder="CED-2026"
                className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>

            {/* Statut */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#FAFAFA]">
                {t("status")}
              </label>
              <select
                value={form.status}
                onChange={(e) => updateField("status", e.target.value)}
                className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-2.5 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {t(`status_${s}`)}
                  </option>
                ))}
              </select>
            </div>

            {/* Client */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#FAFAFA]">
                {t("client")}
              </label>
              <input
                type="text"
                value={form.client_name}
                onChange={(e) => updateField("client_name", e.target.value)}
                placeholder="Edifea SA"
                className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>

            {/* Ville */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#FAFAFA]">
                {t("city")}
              </label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => updateField("city", e.target.value)}
                className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>

            {/* Adresse */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[#FAFAFA]">
                {t("address")}
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
                placeholder="Chemin des Cèdres 12"
                className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>

            {/* Dates */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#FAFAFA]">
                {t("startDate")}
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => updateField("start_date", e.target.value)}
                className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-2.5 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#FAFAFA]">
                {t("endDate")}
              </label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => updateField("end_date", e.target.value)}
                className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-2.5 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>

            {/* Budget */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#FAFAFA]">
                {t("budget")}
              </label>
              <input
                type="number"
                value={form.budget_total}
                onChange={(e) => updateField("budget_total", e.target.value)}
                placeholder="28500000"
                className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#FAFAFA]">
                {t("currency")}
              </label>
              <select
                value={form.currency}
                onChange={(e) => updateField("currency", e.target.value)}
                className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-2.5 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              >
                {currencyOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Couleur */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[#FAFAFA]">
                {t("color")}
              </label>
              <div className="flex flex-wrap gap-2">
                {colorPresets.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => updateField("color", c)}
                    className={`h-8 w-8 rounded-full border-2 transition-all ${
                      form.color === c
                        ? "border-foreground scale-110"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[#FAFAFA]">
                {t("description")}
              </label>
              <textarea
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                rows={3}
                placeholder={t("descriptionPlaceholder")}
                className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
          </div>
        </fieldset>

        {/* Section: Classification emails */}
        <fieldset className="mt-6 rounded-xl border border-[#27272A] bg-[#0F0F11] p-6 shadow-sm">
          <legend className="px-2 text-sm font-semibold text-[#FAFAFA]">
            {t("emailClassification")}
          </legend>

          {/* Mots-clés */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#FAFAFA]">
              {t("emailKeywords")}
            </label>
            <p className="mb-2 text-xs text-[#71717A]">{t("emailKeywordsHelp")}</p>
            {form.email_keywords.length > 0 && (
              <div className="mb-2 flex items-center gap-1.5 text-[10px] text-[#71717A]">
                <Sparkles className="h-3 w-3" />
                {t("emailKeywordsAuto")}
              </div>
            )}
            {form.email_keywords.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {form.email_keywords.map((kw) => {
                  const isAuto = !manualKeywords.current.has(kw);
                  return (
                    <span
                      key={kw}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                        isAuto
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          : "bg-brand/10 text-brand"
                      }`}
                    >
                      {kw}
                      <button type="button" onClick={() => removeKeyword(kw)}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                placeholder="campus rts, ecublens..."
                className="flex-1 rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
              <button
                type="button"
                onClick={addKeyword}
                className="rounded-lg bg-[#27272A] px-3 py-2.5 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A]"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Expéditeurs connus */}
          <div className="mt-5">
            <label className="mb-1.5 block text-sm font-medium text-[#FAFAFA]">
              {t("emailSenders")}
            </label>
            <p className="mb-2 text-xs text-[#71717A]">{t("emailSendersHelp")}</p>
            <div className="flex gap-2">
              <input
                type="email"
                value={senderInput}
                onChange={(e) => setSenderInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSender())}
                placeholder="j.martin@edifea.ch"
                className="flex-1 rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
              <button
                type="button"
                onClick={addSender}
                className="rounded-lg bg-[#27272A] px-3 py-2.5 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A]"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {form.email_senders.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {form.email_senders.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-full bg-[#27272A] px-3 py-1 text-xs font-medium text-[#FAFAFA]"
                  >
                    {s}
                    <button type="button" onClick={() => removeSender(s)}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </fieldset>

        {/* Error message */}
        {errorMsg && (
          <div className="mt-6 rounded-md border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {errorMsg}
          </div>
        )}

        {/* Actions */}
        <div className="mt-8 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-500 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("createProject")}
          </button>
          <Link
            href="/projects"
            className="rounded-lg px-6 py-2.5 text-sm font-medium text-[#71717A] hover:bg-[#27272A]"
          >
            {tc("cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
