"use client";

// Hub Personnel — espace privé du propriétaire (superadmin uniquement).
// Derniers emails synchronisés, emails importants conservés, et coffre-fort
// de documents personnels (fiches de paie, contrats, ...) sur bucket privé.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  Mail,
  Star,
  FileText,
  Download,
  Trash2,
  Upload,
  Loader2,
  Search,
  Paperclip,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  X,
} from "lucide-react";

interface HubEmail {
  id: string;
  subject: string | null;
  sender_name: string | null;
  sender_email: string | null;
  received_at: string | null;
  body_preview: string | null;
  classification: string | null;
  ai_summary: string | null;
  has_attachments: boolean | null;
  is_saved: boolean;
}

interface HubDocument {
  id: string;
  category: string;
  title: string;
  notes: string | null;
  document_date: string | null;
  file_name: string;
  file_size: number;
  file_type: string | null;
  created_at: string;
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: "fiche_paie", label: "Fiches de paie" },
  { key: "contrat", label: "Contrats" },
  { key: "facture", label: "Factures" },
  { key: "impots", label: "Impôts" },
  { key: "sante", label: "Santé" },
  { key: "identite", label: "Identité" },
  { key: "autre", label: "Autres" },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label])
);

function formatBytes(bytes: number): string {
  if (!bytes) return "0 o";
  const units = ["o", "Ko", "Mo", "Go"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-CH", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

const CLASSIFICATION_BADGES: Record<string, { label: string; className: string }> = {
  urgent: { label: "Urgent", className: "bg-[#EF4444]/15 text-[#EF4444]" },
  action_required: { label: "Action requise", className: "bg-[#F59E0B]/15 text-[#F59E0B]" },
  waiting_response: { label: "En attente", className: "bg-[#3B82F6]/15 text-[#3B82F6]" },
  info_only: { label: "Info", className: "bg-[#27272A] text-[#A1A1AA]" },
  archived: { label: "Archivé", className: "bg-[#27272A] text-[#71717A]" },
};

export default function HubPage() {
  const router = useRouter();
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  // Emails
  const [emailTab, setEmailTab] = useState<"recent" | "saved">("recent");
  const [recentEmails, setRecentEmails] = useState<HubEmail[]>([]);
  const [savedEmails, setSavedEmails] = useState<HubEmail[]>([]);
  const [emailSearch, setEmailSearch] = useState("");
  const [emailsLoading, setEmailsLoading] = useState(false);

  // Documents
  const [documents, setDocuments] = useState<HubDocument[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadCategory, setUploadCategory] = useState("fiche_paie");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDate, setUploadDate] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchEmails = useCallback(async (q: string) => {
    setEmailsLoading(true);
    try {
      const res = await fetch(`/api/hub/emails?limit=25${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const data = await res.json();
      setRecentEmails(data.emails || []);
    } catch {
      // silencieux
    } finally {
      setEmailsLoading(false);
    }
  }, [router]);

  const fetchSavedEmails = useCallback(async () => {
    try {
      const res = await fetch("/api/hub/saved-emails");
      if (!res.ok) return;
      const data = await res.json();
      setSavedEmails(data.emails || []);
    } catch {
      // silencieux
    }
  }, []);

  const fetchDocuments = useCallback(async (category: string | null) => {
    try {
      const res = await fetch(`/api/hub/documents${category ? `?category=${category}` : ""}`);
      if (!res.ok) return;
      const data = await res.json();
      setDocuments(data.documents || []);
      if (!category) setTotalSize(data.totalSize || 0);
    } catch {
      // silencieux
    }
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([fetchEmails(""), fetchSavedEmails(), fetchDocuments(null)]);
      setLoading(false);
    })();
  }, [fetchEmails, fetchSavedEmails, fetchDocuments]);

  // Recherche emails débouncée
  useEffect(() => {
    const t = setTimeout(() => {
      fetchEmails(emailSearch.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [emailSearch, fetchEmails]);

  async function toggleSaveEmail(email: HubEmail) {
    const wasSaved = email.is_saved;
    // Optimiste
    setRecentEmails((prev) =>
      prev.map((e) => (e.id === email.id ? { ...e, is_saved: !wasSaved } : e))
    );
    try {
      if (wasSaved) {
        await fetch(`/api/hub/saved-emails?email_record_id=${email.id}`, { method: "DELETE" });
      } else {
        await fetch("/api/hub/saved-emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email_record_id: email.id }),
        });
      }
      await fetchSavedEmails();
    } catch {
      // rollback
      setRecentEmails((prev) =>
        prev.map((e) => (e.id === email.id ? { ...e, is_saved: wasSaved } : e))
      );
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      setUploadError("Sélectionnez un fichier.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("category", uploadCategory);
      if (uploadTitle.trim()) fd.append("title", uploadTitle.trim());
      if (uploadDate) fd.append("document_date", uploadDate);

      const res = await fetch("/api/hub/documents", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || "Échec de l'upload");
        return;
      }
      setShowUpload(false);
      setSelectedFile(null);
      setUploadTitle("");
      setUploadDate("");
      await fetchDocuments(categoryFilter);
      if (categoryFilter) await fetchDocuments(null); // refresh totalSize
    } catch {
      setUploadError("Erreur réseau lors de l'upload");
    } finally {
      setUploading(false);
    }
  }

  async function downloadDocument(doc: HubDocument) {
    try {
      const res = await fetch(`/api/hub/documents/${doc.id}`);
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, "_blank");
      }
    } catch {
      // silencieux
    }
  }

  async function deleteDocument(doc: HubDocument) {
    if (!window.confirm(`Supprimer définitivement « ${doc.title} » ?`)) return;
    try {
      const res = await fetch(`/api/hub/documents/${doc.id}`, { method: "DELETE" });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
        await fetchDocuments(null);
        if (categoryFilter) await fetchDocuments(categoryFilter);
      }
    } catch {
      // silencieux
    }
  }

  function renderEmailCard(email: HubEmail) {
    const badge = email.classification ? CLASSIFICATION_BADGES[email.classification] : null;
    return (
      <div
        key={email.id}
        className="rounded-lg border border-[#27272A] bg-[#18181B] p-3 hover:border-[#3F3F46] transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-[13px] font-semibold text-[#FAFAFA]">
                {email.sender_name || email.sender_email || "Expéditeur inconnu"}
              </p>
              {email.has_attachments && <Paperclip className="h-3 w-3 shrink-0 text-[#71717A]" />}
              <span className="ml-auto shrink-0 text-[11px] text-[#71717A]">
                {formatDate(email.received_at)}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[13px] text-[#D4D4D8]">
              {email.subject || "(Sans objet)"}
            </p>
            <p className="mt-1 line-clamp-2 text-[12px] text-[#71717A]">
              {email.ai_summary || email.body_preview || ""}
            </p>
            {badge && (
              <span
                className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
            )}
          </div>
          <button
            onClick={() => toggleSaveEmail(email)}
            className={`shrink-0 rounded-md p-1.5 transition-colors ${
              email.is_saved
                ? "text-[#F59E0B] hover:bg-[#F59E0B]/10"
                : "text-[#52525B] hover:bg-[#27272A] hover:text-[#A1A1AA]"
            }`}
            title={email.is_saved ? "Retirer des emails conservés" : "Conserver cet email"}
          >
            <Star className={`h-4 w-4 ${email.is_saved ? "fill-[#F59E0B]" : ""}`} />
          </button>
        </div>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#0F0F11] p-8">
        <div className="max-w-md rounded-xl border border-[#27272A] bg-[#18181B] p-8 text-center">
          <Lock className="mx-auto h-10 w-10 text-[#EF4444]" />
          <h1 className="mt-4 font-display text-lg font-bold text-[#FAFAFA]">Accès réservé</h1>
          <p className="mt-2 text-sm text-[#A1A1AA]">
            Le Hub Personnel est un espace privé réservé au propriétaire de la plateforme.
          </p>
        </div>
      </div>
    );
  }

  const emailsToShow = emailTab === "recent" ? recentEmails : savedEmails;

  return (
    <div className="min-h-full bg-[#0F0F11] px-5 py-6 lg:px-7">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#F97316] to-[#EA580C]">
          <Lock className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-bold text-[#FAFAFA]">Hub Personnel</h1>
          <p className="flex items-center gap-1.5 text-[12px] text-[#71717A]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#10B981]" />
            Espace privé — visible uniquement par vous
          </p>
        </div>
        <button
          onClick={() => {
            fetchEmails(emailSearch.trim());
            fetchSavedEmails();
            fetchDocuments(categoryFilter);
          }}
          className="flex items-center gap-2 rounded-lg border border-[#27272A] bg-[#18181B] px-3 py-2 text-[12px] font-medium text-[#A1A1AA] hover:border-[#3F3F46] hover:text-[#D4D4D8] transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Actualiser
        </button>
      </div>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Emails conservés", value: String(savedEmails.length), icon: Star, color: "#F59E0B" },
          { label: "Documents au coffre", value: String(documents.length), icon: FileText, color: "#F97316" },
          { label: "Espace utilisé", value: formatBytes(totalSize), icon: Upload, color: "#3B82F6" },
          { label: "Derniers emails", value: String(recentEmails.length), icon: Mail, color: "#10B981" },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="rounded-xl border border-[#27272A] bg-[#18181B] p-4">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4" style={{ color: kpi.color }} />
                <p className="text-[11px] font-medium uppercase tracking-wide text-[#71717A]">
                  {kpi.label}
                </p>
              </div>
              <p className="mt-2 font-display text-2xl font-bold text-[#FAFAFA]">
                {loading ? "—" : kpi.value}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* ── Colonne Emails ── */}
        <section className="rounded-xl border border-[#27272A] bg-[#111113] p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Mail className="h-4 w-4 text-[#F97316]" />
            <h2 className="font-display text-sm font-bold text-[#FAFAFA]">Mes emails</h2>
            <div className="ml-auto flex rounded-lg border border-[#27272A] bg-[#18181B] p-0.5">
              <button
                onClick={() => setEmailTab("recent")}
                className={`rounded-md px-3 py-1 text-[12px] font-medium transition-colors ${
                  emailTab === "recent" ? "bg-[#F97316]/15 text-[#F97316]" : "text-[#71717A] hover:text-[#A1A1AA]"
                }`}
              >
                Récents
              </button>
              <button
                onClick={() => setEmailTab("saved")}
                className={`rounded-md px-3 py-1 text-[12px] font-medium transition-colors ${
                  emailTab === "saved" ? "bg-[#F59E0B]/15 text-[#F59E0B]" : "text-[#71717A] hover:text-[#A1A1AA]"
                }`}
              >
                Conservés ({savedEmails.length})
              </button>
            </div>
          </div>

          {emailTab === "recent" && (
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#52525B]" />
              <input
                value={emailSearch}
                onChange={(e) => setEmailSearch(e.target.value)}
                placeholder="Rechercher un email..."
                className="w-full rounded-lg border border-[#27272A] bg-[#18181B] py-2 pl-9 pr-3 text-[13px] text-[#FAFAFA] placeholder-[#52525B] outline-none focus:border-[#F97316]/50"
              />
            </div>
          )}

          <div className="space-y-2">
            {emailsLoading && emailTab === "recent" ? (
              <div className="flex items-center justify-center py-10 text-[#71717A]">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : emailsToShow.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#27272A] p-8 text-center text-[13px] text-[#71717A]">
                {emailTab === "recent"
                  ? "Aucun email synchronisé. Lancez une synchronisation depuis le module Mail."
                  : "Aucun email conservé. Cliquez sur l'étoile d'un email récent pour le garder ici."}
              </div>
            ) : (
              emailsToShow.map(renderEmailCard)
            )}
          </div>
        </section>

        {/* ── Colonne Coffre-fort ── */}
        <section className="rounded-xl border border-[#27272A] bg-[#111113] p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#F97316]" />
            <h2 className="font-display text-sm font-bold text-[#FAFAFA]">Coffre-fort documents</h2>
            <button
              onClick={() => {
                setShowUpload(!showUpload);
                setUploadError(null);
              }}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-[#F97316] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#EA580C] transition-colors"
            >
              {showUpload ? <X className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
              {showUpload ? "Annuler" : "Ajouter"}
            </button>
          </div>

          {/* Formulaire upload */}
          {showUpload && (
            <div className="mb-4 rounded-lg border border-[#F97316]/30 bg-[#18181B] p-4">
              <div className="space-y-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#3F3F46] py-4 text-[13px] text-[#A1A1AA] hover:border-[#F97316]/50 hover:text-[#D4D4D8] transition-colors"
                >
                  <Paperclip className="h-4 w-4" />
                  {selectedFile ? `${selectedFile.name} (${formatBytes(selectedFile.size)})` : "Choisir un fichier (PDF, image, Excel, Word — max 25 Mo)"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.docx,.doc,.csv,.txt,.eml"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    className="rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-[13px] text-[#FAFAFA] outline-none focus:border-[#F97316]/50"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={uploadDate}
                    onChange={(e) => setUploadDate(e.target.value)}
                    className="rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-[13px] text-[#FAFAFA] outline-none focus:border-[#F97316]/50"
                    title="Date du document (ex: mois de la fiche de paie)"
                  />
                </div>
                <input
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Titre (ex: Fiche de paie — Juillet 2026)"
                  className="w-full rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-[13px] text-[#FAFAFA] placeholder-[#52525B] outline-none focus:border-[#F97316]/50"
                />
                {uploadError && (
                  <div className="flex items-center gap-2 rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-[12px] text-[#EF4444]">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {uploadError}
                  </div>
                )}
                <button
                  onClick={handleUpload}
                  disabled={uploading || !selectedFile}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97316] py-2 text-[13px] font-semibold text-white hover:bg-[#EA580C] disabled:opacity-50 transition-colors"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? "Envoi en cours..." : "Enregistrer au coffre-fort"}
                </button>
              </div>
            </div>
          )}

          {/* Filtres catégorie */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button
              onClick={() => {
                setCategoryFilter(null);
                fetchDocuments(null);
              }}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                categoryFilter === null
                  ? "bg-[#F97316]/15 text-[#F97316]"
                  : "bg-[#18181B] text-[#71717A] hover:text-[#A1A1AA]"
              }`}
            >
              Tous
            </button>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => {
                  setCategoryFilter(c.key);
                  fetchDocuments(c.key);
                }}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                  categoryFilter === c.key
                    ? "bg-[#F97316]/15 text-[#F97316]"
                    : "bg-[#18181B] text-[#71717A] hover:text-[#A1A1AA]"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Liste documents */}
          <div className="space-y-2">
            {documents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#27272A] p-8 text-center text-[13px] text-[#71717A]">
                Aucun document{categoryFilter ? " dans cette catégorie" : ""}. Vos fiches de paie et
                documents importants seront conservés ici, à part et en privé.
              </div>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-lg border border-[#27272A] bg-[#18181B] p-3 hover:border-[#3F3F46] transition-colors"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F97316]/10">
                    <FileText className="h-4 w-4 text-[#F97316]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[#FAFAFA]">{doc.title}</p>
                    <p className="text-[11px] text-[#71717A]">
                      {CATEGORY_LABELS[doc.category] || doc.category}
                      {doc.document_date ? ` · ${formatDate(doc.document_date)}` : ""}
                      {` · ${formatBytes(Number(doc.file_size) || 0)}`}
                    </p>
                  </div>
                  <button
                    onClick={() => downloadDocument(doc)}
                    className="shrink-0 rounded-md p-1.5 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#3B82F6] transition-colors"
                    title="Télécharger"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deleteDocument(doc)}
                    className="shrink-0 rounded-md p-1.5 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#EF4444] transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
