"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Users,
  Trash2,
  X,
  Eye,
  EyeOff,
  Monitor,
  Link2,
  Loader2,
  UserPlus,
  Building2,
  Globe,
  Check,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────

interface OrgMember {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  avatar_url: string | null;
  role: string;
}

interface ExternalCalendar {
  id: string;
  member_email: string;
  member_name: string;
  source: "microsoft" | "ics";
  color: string;
  is_active: boolean;
  last_synced_at: string | null;
  sync_error: string | null;
  added_by_name: string;
}

interface VisibilityState {
  [key: string]: boolean; // userId or calendarId → visible
}

// ── LocalStorage ──────────────────────────────────────────

const LS_KEY = "cantaia_calendar_visibility";

function getStoredVisibility(): VisibilityState {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(LS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function storeVisibility(state: VisibilityState) {
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }
}

// ── Color pool ────────────────────────────────────────────

const MEMBER_COLORS = [
  "#3B82F6", "#10B981", "#A855F7", "#F59E0B",
  "#EF4444", "#06B6D4", "#EC4899", "#F97316",
  "#8B5CF6", "#14B8A6", "#E11D48", "#2563EB",
];

function memberColor(index: number): string {
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}

function initials(first: string | null, last: string | null, email: string): string {
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

function displayName(m: OrgMember): string {
  const name = `${m.first_name || ""} ${m.last_name || ""}`.trim();
  return name || m.email;
}

// ── Props ─────────────────────────────────────────────────

interface TeamCalendarsPanelProps {
  open: boolean;
  onClose: () => void;
  onVisibilityChange?: (visibility: VisibilityState) => void;
}

// ── Component ─────────────────────────────────────────────

export function TeamCalendarsPanel({
  open,
  onClose,
  onVisibilityChange,
}: TeamCalendarsPanelProps) {
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [externals, setExternals] = useState<ExternalCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibility, setVisibility] = useState<VisibilityState>(getStoredVisibility);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addTab, setAddTab] = useState<"outlook" | "ics">("outlook");
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addIcsUrl, setAddIcsUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Fetch data ────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [membersRes, externalsRes] = await Promise.all([
        fetch("/api/admin/clients"),
        fetch("/api/calendar/external"),
      ]);

      if (membersRes.ok) {
        const data = await membersRes.json();
        const members = data.members || data.clients || data.data || [];
        setOrgMembers(members);
      }

      if (externalsRes.ok) {
        const data = await externalsRes.json();
        setExternals(data.calendars || []);
      }
    } catch (err) {
      console.error("Failed to fetch team data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  // ── Close on outside click ────────────────────────────

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay to prevent immediate close on the opening click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open, onClose]);

  // ── Toggle visibility ─────────────────────────────────

  function toggleVisibility(id: string) {
    setVisibility((prev) => {
      const next = { ...prev, [id]: prev[id] === false ? true : (prev[id] === undefined ? false : !prev[id]) };
      // Default is visible (true), so if not in state = visible
      storeVisibility(next);
      onVisibilityChange?.(next);
      return next;
    });
  }

  function isVisible(id: string): boolean {
    return visibility[id] !== false; // default true
  }

  // ── Add external calendar ─────────────────────────────

  async function handleAdd() {
    if (!addEmail.trim() || !addName.trim()) return;
    if (addTab === "ics" && !addIcsUrl.trim()) return;

    setAdding(true);
    try {
      const res = await fetch("/api/calendar/external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: addEmail.trim(),
          display_name: addName.trim(),
          source_type: addTab === "outlook" ? "microsoft_graph" : "ics_url",
          ics_url: addTab === "ics" ? addIcsUrl.trim() : undefined,
        }),
      });

      if (res.status === 409) {
        toast.error("Ce calendrier existe deja");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Erreur lors de l'ajout");
        return;
      }

      toast.success(`Calendrier de ${addName.trim()} ajoute`);
      setAddEmail("");
      setAddName("");
      setAddIcsUrl("");
      setShowAddForm(false);
      fetchData();
    } catch {
      toast.error("Erreur reseau");
    } finally {
      setAdding(false);
    }
  }

  // ── Remove external calendar ──────────────────────────

  async function handleRemove(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/calendar/external?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Erreur lors de la suppression");
        return;
      }
      toast.success("Calendrier supprime");
      fetchData();
    } catch {
      toast.error("Erreur reseau");
    } finally {
      setDeleting(null);
    }
  }

  // ── Render ────────────────────────────────────────────

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-[420px] max-w-full h-full bg-[#0F0F11] border-l border-[#27272A] shadow-2xl shadow-black/60 flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#27272A]">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-[#F97316]" />
            <h2 className="text-base font-semibold text-[#FAFAFA]">
              Calendriers equipe
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md text-[#71717A] hover:text-[#FAFAFA] hover:bg-[#27272A] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 text-[#F97316] animate-spin" />
            </div>
          ) : (
            <div className="space-y-1">
              {/* ── Section: Membres Cantaia ──────────────── */}
              <div className="px-5 pt-4 pb-2">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="w-3.5 h-3.5 text-[#F97316]" />
                  <h3 className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider">
                    Membres de l&apos;organisation
                  </h3>
                  <span className="ml-auto rounded-full bg-[#F97316]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#F97316]">
                    {orgMembers.length}
                  </span>
                </div>

                <div className="space-y-1">
                  {orgMembers.map((member, i) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#18181B] transition-colors group"
                    >
                      {/* Avatar with color */}
                      <div
                        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                        style={{ backgroundColor: memberColor(i) }}
                      >
                        {initials(member.first_name, member.last_name, member.email)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[#FAFAFA] font-medium truncate">
                          {displayName(member)}
                        </p>
                        <p className="text-[11px] text-[#52525B] truncate">
                          {member.email}
                        </p>
                      </div>

                      {/* Visibility toggle */}
                      <button
                        onClick={() => toggleVisibility(member.id)}
                        className={`flex-shrink-0 p-1.5 rounded-md transition-colors ${
                          isVisible(member.id)
                            ? "text-[#10B981] hover:bg-[#10B981]/10"
                            : "text-[#52525B] hover:bg-[#27272A]"
                        }`}
                        title={isVisible(member.id) ? "Masquer" : "Afficher"}
                      >
                        {isVisible(member.id) ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <EyeOff className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  ))}

                  {orgMembers.length === 0 && (
                    <p className="text-xs text-[#52525B] px-3 py-4 text-center">
                      Aucun membre dans l&apos;organisation
                    </p>
                  )}
                </div>
              </div>

              {/* ── Separator ──────────────────────────────── */}
              <div className="mx-5 border-t border-[#27272A]" />

              {/* ── Section: Calendriers externes ─────────── */}
              <div className="px-5 pt-4 pb-2">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-3.5 h-3.5 text-[#3B82F6]" />
                  <h3 className="text-xs font-semibold text-[#A1A1AA] uppercase tracking-wider">
                    Calendriers externes
                  </h3>
                  <span className="ml-auto rounded-full bg-[#3B82F6]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#3B82F6]">
                    {externals.length}
                  </span>
                </div>

                <p className="text-[11px] text-[#52525B] mb-3 leading-relaxed">
                  Ajoutez les calendriers de collegues hors Cantaia (Microsoft 365 ou lien ICS)
                  pour voir leurs disponibilites.
                </p>

                <div className="space-y-1">
                  {externals.map((cal) => (
                    <div
                      key={cal.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#18181B] transition-colors group"
                    >
                      {/* Color dot */}
                      <div
                        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                        style={{ backgroundColor: cal.color }}
                      >
                        {cal.member_name.slice(0, 2).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] text-[#FAFAFA] font-medium truncate">
                            {cal.member_name}
                          </p>
                          {cal.source === "microsoft" ? (
                            <Monitor className="w-3 h-3 text-[#3B82F6] flex-shrink-0" />
                          ) : (
                            <Link2 className="w-3 h-3 text-[#A855F7] flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-[11px] text-[#52525B] truncate">
                            {cal.member_email}
                          </p>
                          {cal.sync_error && (
                            <AlertTriangle className="w-3 h-3 text-[#F59E0B] flex-shrink-0" />
                          )}
                        </div>
                      </div>

                      {/* Visibility toggle */}
                      <button
                        onClick={() => toggleVisibility(`ext_${cal.id}`)}
                        className={`flex-shrink-0 p-1.5 rounded-md transition-colors ${
                          isVisible(`ext_${cal.id}`)
                            ? "text-[#10B981] hover:bg-[#10B981]/10"
                            : "text-[#52525B] hover:bg-[#27272A]"
                        }`}
                        title={isVisible(`ext_${cal.id}`) ? "Masquer" : "Afficher"}
                      >
                        {isVisible(`ext_${cal.id}`) ? (
                          <Eye className="w-4 h-4" />
                        ) : (
                          <EyeOff className="w-4 h-4" />
                        )}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleRemove(cal.id)}
                        disabled={deleting === cal.id}
                        className="flex-shrink-0 p-1.5 rounded-md text-[#52525B] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                        title="Supprimer"
                      >
                        {deleting === cal.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>

                {/* ── Add button / form ───────────────────── */}
                {!showAddForm ? (
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#27272A] px-4 py-3 text-[13px] text-[#71717A] hover:text-[#FAFAFA] hover:border-[#3F3F46] hover:bg-[#18181B] transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    Ajouter un calendrier externe
                  </button>
                ) : (
                  <div className="mt-3 rounded-lg border border-[#27272A] bg-[#18181B] p-4 space-y-3">
                    {/* Tab switcher */}
                    <div className="flex items-center bg-[#0F0F11] border border-[#27272A] rounded-lg p-0.5">
                      <button
                        onClick={() => setAddTab("outlook")}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                          addTab === "outlook"
                            ? "bg-[#3B82F6] text-white"
                            : "text-[#71717A] hover:text-[#A1A1AA]"
                        }`}
                      >
                        <Monitor className="w-3 h-3" />
                        Microsoft 365
                      </button>
                      <button
                        onClick={() => setAddTab("ics")}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                          addTab === "ics"
                            ? "bg-[#A855F7] text-white"
                            : "text-[#71717A] hover:text-[#A1A1AA]"
                        }`}
                      >
                        <Link2 className="w-3 h-3" />
                        Lien ICS
                      </button>
                    </div>

                    {/* Name field */}
                    <div>
                      <label className="block text-[11px] text-[#71717A] mb-1">
                        Nom complet
                      </label>
                      <input
                        type="text"
                        value={addName}
                        onChange={(e) => setAddName(e.target.value)}
                        placeholder="Jean Dupont"
                        className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-xs text-[#FAFAFA] placeholder-[#52525B] outline-none focus:border-[#F97316]/50"
                      />
                    </div>

                    {/* Email field */}
                    <div>
                      <label className="block text-[11px] text-[#71717A] mb-1">
                        Adresse email
                      </label>
                      <input
                        type="email"
                        value={addEmail}
                        onChange={(e) => setAddEmail(e.target.value)}
                        placeholder="jean.dupont@entreprise.ch"
                        className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-xs text-[#FAFAFA] placeholder-[#52525B] outline-none focus:border-[#F97316]/50"
                      />
                    </div>

                    {/* ICS URL field (only for ICS tab) */}
                    {addTab === "ics" && (
                      <div>
                        <label className="block text-[11px] text-[#71717A] mb-1">
                          URL du calendrier ICS
                        </label>
                        <input
                          type="url"
                          value={addIcsUrl}
                          onChange={(e) => setAddIcsUrl(e.target.value)}
                          placeholder="https://outlook.office365.com/owa/calendar/..."
                          className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-xs text-[#FAFAFA] placeholder-[#52525B] outline-none focus:border-[#F97316]/50"
                        />
                        <p className="mt-1 text-[10px] text-[#52525B]">
                          Outlook &gt; Parametres &gt; Calendrier &gt; Calendriers partages &gt; Publier un calendrier
                        </p>
                      </div>
                    )}

                    {/* Outlook info */}
                    {addTab === "outlook" && (
                      <div className="flex items-start gap-2 rounded-lg bg-[#3B82F6]/5 border border-[#3B82F6]/20 p-2.5">
                        <Monitor className="w-3.5 h-3.5 text-[#3B82F6] mt-0.5 flex-shrink-0" />
                        <p className="text-[10px] text-[#A1A1AA] leading-relaxed">
                          Le calendrier sera lu via Microsoft Graph si le membre fait partie
                          du meme tenant Azure AD. Sinon, utilisez un lien ICS.
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleAdd}
                        disabled={adding || !addEmail.trim() || !addName.trim() || (addTab === "ics" && !addIcsUrl.trim())}
                        className="flex items-center gap-1.5 rounded-md bg-[#F97316] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#EA580C] transition-colors disabled:opacity-50"
                      >
                        {adding ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                        Ajouter
                      </button>
                      <button
                        onClick={() => {
                          setShowAddForm(false);
                          setAddEmail("");
                          setAddName("");
                          setAddIcsUrl("");
                        }}
                        className="rounded-md border border-[#27272A] px-3 py-1.5 text-xs text-[#71717A] hover:text-[#FAFAFA] hover:border-[#3F3F46] transition-colors"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
