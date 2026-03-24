"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useProject } from "@/lib/hooks/use-supabase-data";
import {
  ArrowLeft,
  Plus,
  X,
  Trash2,
  UserPlus,
  FolderOpen,
  Loader2,
  AlertTriangle,
} from "lucide-react";

const statusOptions = ["planning", "active", "paused", "completed", "archived"] as const;
const colorPresets = [
  "#6366F1", "#EC4899", "#F59E0B", "#10B981", "#8B5CF6",
  "#EF4444", "#3B82F6", "#14B8A6", "#F97316", "#06B6D4",
];

export default function ProjectSettingsPage() {
  const params = useParams();
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const router = useRouter();

  const { project, loading: projectLoading } = useProject(params.id as string);

  const [form, setForm] = useState({
    name: "",
    code: "",
    description: "",
    client_name: "",
    address: "",
    city: "",
    status: "active",
    start_date: "",
    end_date: "",
    budget_total: "",
    currency: "CHF",
    color: "#6366F1",
    email_keywords: [] as string[],
    email_senders: [] as string[],
    outlook_folder: "",
  });

  const [keywordInput, setKeywordInput] = useState("");
  const [senderInput, setSenderInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Populate form when project loads
  useEffect(() => {
    if (!project) return;
    setForm({
      name: project.name || "",
      code: project.code || "",
      description: project.description || "",
      client_name: project.client_name || "",
      address: project.address || "",
      city: project.city || "",
      status: project.status || "active",
      start_date: project.start_date || "",
      end_date: project.end_date || "",
      budget_total: project.budget_total?.toString() || "",
      currency: project.currency || "CHF",
      color: project.color || "#6366F1",
      email_keywords: project.email_keywords || [],
      email_senders: project.email_senders || [],
      outlook_folder: "",
    });
  }, [project]);

  if (projectLoading) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <p className="text-[#71717A]">{t("projectNotFound")}</p>
      </div>
    );
  }

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function addKeyword() {
    const kw = keywordInput.trim().toLowerCase();
    if (kw && !form.email_keywords.includes(kw)) {
      setForm((prev) => ({ ...prev, email_keywords: [...prev.email_keywords, kw] }));
      setKeywordInput("");
    }
  }

  function removeKeyword(kw: string) {
    setForm((prev) => ({ ...prev, email_keywords: prev.email_keywords.filter((k) => k !== kw) }));
  }

  function addSender() {
    const s = senderInput.trim().toLowerCase();
    if (s && !form.email_senders.includes(s)) {
      setForm((prev) => ({ ...prev, email_senders: [...prev.email_senders, s] }));
      setSenderInput("");
    }
  }

  function removeSender(s: string) {
    setForm((prev) => ({ ...prev, email_senders: prev.email_senders.filter((x) => x !== s) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        code: form.code || null,
        description: form.description || null,
        client_name: form.client_name || null,
        address: form.address || null,
        city: form.city || null,
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        budget_total: form.budget_total ? parseFloat(form.budget_total) : null,
        currency: form.currency,
        color: form.color,
        email_keywords: form.email_keywords,
        email_senders: form.email_senders,
      };

      const res = await fetch(`/api/projects/${project!.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setSaveMessage(data.error || "Erreur");
        return;
      }

      router.push(`/projects/${project!.id}`);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleteConfirmName !== project!.name) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${project!.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erreur lors de la suppression");
        return;
      }
      router.push("/projects");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/projects/${project.id}`}
          className="rounded-md p-2 text-[#71717A] hover:bg-[#27272A] hover:text-[#71717A]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-[#FAFAFA]">
            {t("projectSettings")}
          </h1>
          <p className="mt-1 text-sm text-[#71717A]">
            {project.name}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 max-w-3xl space-y-6">
        {/* General Info */}
        <fieldset className="rounded-md border border-[#27272A] bg-[#0F0F11] p-6">
          <legend className="px-2 text-sm font-semibold text-[#FAFAFA]">
            {t("generalInfo")}
          </legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[#71717A]">
                {t("projectName")} *
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#71717A]">
                {t("projectCode")}
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => updateField("code", e.target.value)}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#71717A]">
                {t("status")}
              </label>
              <select
                value={form.status}
                onChange={(e) => updateField("status", e.target.value)}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
              >
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{t(`status_${s}`)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#71717A]">
                {t("client")}
              </label>
              <input
                type="text"
                value={form.client_name}
                onChange={(e) => updateField("client_name", e.target.value)}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#71717A]">
                {t("city")}
              </label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => updateField("city", e.target.value)}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[#71717A]">
                {t("address")}
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#71717A]">
                {t("startDate")}
              </label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => updateField("start_date", e.target.value)}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#71717A]">
                {t("endDate")}
              </label>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => updateField("end_date", e.target.value)}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[#71717A]">
                {t("color")}
              </label>
              <div className="flex flex-wrap gap-2">
                {colorPresets.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => updateField("color", c)}
                    className={`h-8 w-8 rounded-full border-2 transition-all ${form.color === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[#71717A]">
                {t("description")}
              </label>
              <textarea
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                rows={3}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
              />
            </div>
          </div>
        </fieldset>

        {/* Email Classification */}
        <fieldset className="rounded-md border border-[#27272A] bg-[#0F0F11] p-6">
          <legend className="px-2 text-sm font-semibold text-[#FAFAFA]">
            {t("emailClassification")}
          </legend>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#71717A]">
              {t("emailKeywords")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                placeholder="mot-cle..."
                className="flex-1 rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
              />
              <button type="button" onClick={addKeyword} className="rounded-md bg-[#27272A] px-3 py-2 hover:bg-[#27272A]">
                <Plus className="h-4 w-4 text-[#71717A]" />
              </button>
            </div>
            {form.email_keywords.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {form.email_keywords.map((kw) => (
                  <span key={kw} className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
                    {kw}
                    <button type="button" onClick={() => removeKeyword(kw)}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="mt-5">
            <label className="mb-1.5 block text-sm font-medium text-[#71717A]">
              {t("emailSenders")}
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={senderInput}
                onChange={(e) => setSenderInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSender())}
                placeholder="email@example.ch"
                className="flex-1 rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
              />
              <button type="button" onClick={addSender} className="rounded-md bg-[#27272A] px-3 py-2 hover:bg-[#27272A]">
                <Plus className="h-4 w-4 text-[#71717A]" />
              </button>
            </div>
            {form.email_senders.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {form.email_senders.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 rounded-full bg-[#27272A] px-3 py-1 text-xs font-medium text-[#71717A]">
                    {s}
                    <button type="button" onClick={() => removeSender(s)}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Outlook folder */}
          <div className="mt-5">
            <label className="mb-1.5 block text-sm font-medium text-[#71717A]">
              <span className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-[#71717A]" />
                {t("outlookFolder")}
              </span>
            </label>
            <input
              type="text"
              value={form.outlook_folder}
              onChange={(e) => updateField("outlook_folder", e.target.value)}
              placeholder={t("outlookFolderPlaceholder")}
              className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
            />
            <p className="mt-1 text-xs text-[#71717A]">
              {t("outlookFolderHelp")}
            </p>
          </div>
        </fieldset>

        {/* Members */}
        <fieldset className="rounded-md border border-[#27272A] bg-[#0F0F11] p-6">
          <legend className="px-2 text-sm font-semibold text-[#FAFAFA]">
            {t("members")}
          </legend>
          <div className="flex items-center justify-between rounded-md border border-dashed border-[#27272A] p-4">
            <p className="text-sm text-[#71717A]">{t("membersPlaceholder")}</p>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md bg-[#27272A] px-3 py-2 text-sm font-medium text-[#71717A] hover:bg-[#27272A]"
            >
              <UserPlus className="h-4 w-4" />
              {t("addMember")}
            </button>
          </div>
        </fieldset>

        {/* Save / Cancel */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-brand px-6 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {tc("save")}
          </button>
          <Link
            href={`/projects/${project.id}`}
            className="rounded-md px-6 py-2 text-sm font-medium text-[#71717A] hover:bg-[#27272A]"
          >
            {tc("cancel")}
          </Link>
          {saveMessage && (
            <span className="text-sm text-red-600 dark:text-red-400">{saveMessage}</span>
          )}
        </div>
      </form>

      {/* ── Zone dangereuse ── */}
      <div className="mt-12 max-w-3xl rounded-md border border-red-200 bg-red-500/10 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-800 dark:text-red-400">Zone dangereuse</h3>
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              La suppression est irreversible. Les emails classes repasseront en &quot;Non classe&quot;.
            </p>

            {!showDeleteDialog ? (
              <button
                type="button"
                onClick={() => setShowDeleteDialog(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-md border border-red-300 bg-[#0F0F11] px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer ce projet
              </button>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-red-700 dark:text-red-400">
                  Tapez <strong>&quot;{project.name}&quot;</strong> pour confirmer :
                </p>
                <input
                  type="text"
                  value={deleteConfirmName}
                  onChange={(e) => setDeleteConfirmName(e.target.value)}
                  placeholder={project.name}
                  className="w-full rounded-md border border-red-300 bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-200"
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={deleteConfirmName !== project.name || deleting}
                    onClick={handleDelete}
                    className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Trash2 className="h-4 w-4" />
                    Confirmer la suppression
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowDeleteDialog(false); setDeleteConfirmName(""); }}
                    className="rounded-md px-4 py-2 text-sm text-[#71717A] hover:bg-[#27272A]"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
