"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronUp,
  Mail,
  Check,
  X,
  RefreshCw,
  Sparkles,
  PlusCircle,
  Tag,
  Loader2,
  Trash2,
} from "lucide-react";
import { cn } from "@cantaia/ui";
import type { EmailRecord, Project } from "@cantaia/database";
import { CreateProjectFromEmailModal } from "./CreateProjectFromEmailModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClassificationSuggestionsProps {
  emails: EmailRecord[];
  projects: Project[];
  onAction: () => void; // Called after any action to refresh data
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_KEYS: Record<string, string> = {
  newsletter: "categoryNewsletter",
  spam: "categorySpam",
  personal: "categoryPersonal",
  administrative: "categoryAdministrative",
  project: "categoryProject",
};

function getCategoryLabel(
  cat: string | null,
  t: (key: string) => string
): string {
  if (!cat) return t("categoryUnknown");
  const key = CATEGORY_KEYS[cat];
  return key ? t(key) : cat;
}

// ---------------------------------------------------------------------------
// Sub-component: project dropdown
// ---------------------------------------------------------------------------

function ProjectDropdown({
  projects,
  onSelect,
  onClose,
  triggerRef,
}: {
  projects: Project[];
  onSelect: (projectId: string) => void;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations("classification");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, triggerRef]);

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.code ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div
      ref={dropdownRef}
      className="absolute z-30 mt-1 w-64 rounded-md border border-slate-200 bg-white shadow-lg"
    >
      <div className="p-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchProject")}
          autoFocus
          className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand focus:outline-none"
        />
      </div>
      <div className="max-h-48 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-400">{t("noProjectFound")}</p>
        ) : (
          filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 transition-colors"
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: p.color || "#1E3A5F" }}
              />
              <span className="text-slate-700 truncate font-medium">{p.name}</span>
              {p.code && (
                <span className="text-[10px] text-slate-400 shrink-0">{p.code}</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: single suggestion row
// ---------------------------------------------------------------------------

function SuggestionRow({
  email,
  projects,
  onAction,
}: {
  email: EmailRecord;
  projects: Project[];
  onAction: () => void;
}) {
  const t = useTranslations("classification");
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const dropdownBtnRef = useRef<HTMLButtonElement>(null);

  // ---- API calls ----

  async function confirmClassification() {
    setLoading(true);
    try {
      await fetch("/api/emails/confirm-classification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: email.id, action: "confirm" }),
      });
      onAction();
    } catch (err) {
      console.error("[ClassificationSuggestions] confirm error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function changeProject(projectId: string) {
    setShowDropdown(false);
    setLoading(true);
    try {
      await fetch("/api/emails/confirm-classification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_id: email.id,
          action: "change_project",
          project_id: projectId,
        }),
      });
      onAction();
    } catch (err) {
      console.error("[ClassificationSuggestions] change project error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function rejectClassification() {
    setLoading(true);
    try {
      await fetch("/api/emails/confirm-classification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: email.id, action: "reject" }),
      });
      onAction();
    } catch (err) {
      console.error("[ClassificationSuggestions] reject error:", err);
    } finally {
      setLoading(false);
    }
  }

  // ---- Resolve matched project name ----

  const matchedProject = email.project_id
    ? projects.find((p) => p.id === email.project_id)
    : null;

  const confidence = email.ai_project_match_confidence
    ? Math.round(email.ai_project_match_confidence * 100)
    : null;

  // ---- Render by classification_status ----

  const isSuggested = email.classification_status === "suggested";
  const isNewProject = email.classification_status === "new_project_suggested";
  const isNoProject = email.classification_status === "classified_no_project";

  return (
    <>
      <div
        className={cn(
          "rounded-lg border bg-white p-3.5 transition-all",
          loading && "opacity-60 pointer-events-none",
          isSuggested && "border-slate-200",
          isNewProject && "border-emerald-200 bg-emerald-50/30",
          isNoProject && "border-slate-200 bg-slate-50/50"
        )}
      >
        {/* Email header line */}
        <div className="flex items-start gap-2 mb-2">
          <Mail className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700 truncate">
                {email.sender_name || email.sender_email}
              </span>
              <span className="text-[10px] text-slate-400 shrink-0">
                {new Date(email.received_at).toLocaleDateString("fr-CH", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </span>
            </div>
            <p className="text-xs text-slate-600 truncate">
              &laquo;{email.subject}&raquo;
            </p>
          </div>
          {loading && (
            <Loader2 className="h-4 w-4 animate-spin text-brand shrink-0" />
          )}
        </div>

        {/* AI suggestion line */}
        {isSuggested && (
          <div className="flex items-center gap-1.5 mb-2.5 ml-6">
            <Sparkles className="h-3.5 w-3.5 text-green-500 shrink-0" />
            <span className="text-xs text-slate-600">
              {t("suggestion")}{" "}
              <span className="font-semibold text-slate-800">
                {matchedProject?.name ?? t("unknownProject")}
              </span>
              {confidence !== null && (
                <span className="ml-1 text-[10px] text-green-600 font-medium">
                  ({t("confidence")} {confidence}%)
                </span>
              )}
            </span>
          </div>
        )}

        {isNewProject && email.suggested_project_data && (
          <div className="flex items-center gap-1.5 mb-2.5 ml-6">
            <PlusCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <span className="text-xs text-slate-600">
              {t("newProject")}{" "}
              <span className="font-semibold text-emerald-700">
                {email.suggested_project_data.name}
              </span>
              {email.suggested_project_data.location && (
                <span className="text-[10px] text-slate-400 ml-1">
                  — {email.suggested_project_data.location}
                </span>
              )}
            </span>
          </div>
        )}

        {isNoProject && (
          <div className="flex items-center gap-1.5 mb-2.5 ml-6">
            <Tag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-500">
              {getCategoryLabel(email.email_category, t)} {t("notAProject")}
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 ml-6 flex-wrap">
          {isSuggested && (
            <>
              <button
                onClick={confirmClassification}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
                {t("confirm")}
              </button>

              <div className="relative">
                <button
                  ref={dropdownBtnRef}
                  onClick={() => setShowDropdown(!showDropdown)}
                  disabled={loading}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="h-3 w-3" />
                  {t("changeProject")}
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showDropdown && (
                  <ProjectDropdown
                    projects={projects}
                    onSelect={changeProject}
                    onClose={() => setShowDropdown(false)}
                    triggerRef={dropdownBtnRef}
                  />
                )}
              </div>

              <button
                onClick={rejectClassification}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-50"
              >
                <X className="h-3 w-3" />
                {t("ignore")}
              </button>
            </>
          )}

          {isNewProject && (
            <>
              <button
                onClick={() => setShowCreateModal(true)}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                <PlusCircle className="h-3 w-3" />
                {t("createProject")}
              </button>

              <div className="relative">
                <button
                  ref={dropdownBtnRef}
                  onClick={() => setShowDropdown(!showDropdown)}
                  disabled={loading}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="h-3 w-3" />
                  {t("classifyExisting")}
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showDropdown && (
                  <ProjectDropdown
                    projects={projects}
                    onSelect={changeProject}
                    onClose={() => setShowDropdown(false)}
                    triggerRef={dropdownBtnRef}
                  />
                )}
              </div>

              <button
                onClick={rejectClassification}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-50"
              >
                <X className="h-3 w-3" />
                {t("ignore")}
              </button>
            </>
          )}

          {isNoProject && (
            <>
              <div className="relative">
                <button
                  ref={dropdownBtnRef}
                  onClick={() => setShowDropdown(!showDropdown)}
                  disabled={loading}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="h-3 w-3" />
                  {t("itsAProject")}
                  <ChevronDown className="h-3 w-3" />
                </button>
                {showDropdown && (
                  <ProjectDropdown
                    projects={projects}
                    onSelect={changeProject}
                    onClose={() => setShowDropdown(false)}
                    triggerRef={dropdownBtnRef}
                  />
                )}
              </div>

              <button
                onClick={rejectClassification}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                {t("ignore")}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Create project modal */}
      {showCreateModal && (
        <CreateProjectFromEmailModal
          email={email}
          suggestedProject={email.suggested_project_data ?? null}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            onAction();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ClassificationSuggestions({
  emails,
  projects,
  onAction,
}: ClassificationSuggestionsProps) {
  const t = useTranslations("classification");
  const [collapsed, setCollapsed] = useState(false);

  // Filter to only pending classification statuses
  const pendingEmails = emails.filter(
    (e) =>
      e.classification_status === "suggested" ||
      e.classification_status === "new_project_suggested" ||
      e.classification_status === "classified_no_project"
  );

  if (pendingEmails.length === 0) return null;

  // Sort: new_project_suggested first, then suggested, then classified_no_project
  const ORDER: Record<string, number> = {
    new_project_suggested: 0,
    suggested: 1,
    classified_no_project: 2,
  };
  const sorted = [...pendingEmails].sort(
    (a, b) =>
      (ORDER[a.classification_status] ?? 9) -
      (ORDER[b.classification_status] ?? 9)
  );

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-4 py-3 hover:bg-amber-50/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-semibold text-slate-800">
            {t("toProcess")}
          </span>
          <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">
            {pendingEmails.length}
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="space-y-2 px-4 pb-4">
          {sorted.map((email) => (
            <SuggestionRow
              key={email.id}
              email={email}
              projects={projects}
              onAction={onAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}
