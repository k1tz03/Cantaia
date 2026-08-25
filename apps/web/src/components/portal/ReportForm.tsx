"use client";

/**
 * Daily site report — the screen the whole product is built around.
 *
 * Design constraints, all of them non-negotiable on a construction site:
 *  - OFFLINE FIRST. Everything typed is written to localStorage on each change
 *    and replayed when the network comes back. A basement must never cost a day
 *    of hours. Photos are queued in IndexedDB.
 *  - GLOVES. Every target is at least 44px; inputs are 16px so iOS never zooms.
 *  - IMPUTATION. Each labour/machine line can be charged to a CFC position or a
 *    planning task (migration 093) — that is what turns hours into a margin.
 *  - SIGNATURE. The foreman can sign the report on the device (bon de régie).
 *  - FR/DE. Local dictionary, no next-intl: the portal is public.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CloudOff,
  HardHat,
  Loader2,
  MessageSquare,
  Package,
  PenLine,
  Plus,
  RefreshCw,
  Save,
  Send,
  Truck,
  X,
} from "lucide-react";
import { usePortalI18n, type PortalKey } from "./portal-i18n";
import { SignaturePad } from "./SignaturePad";
import {
  buildDraftKey,
  clearDraft,
  deletePendingPhoto,
  getPendingPhoto,
  loadDraft,
  newPendingPhotoId,
  purgeStaleDrafts,
  savePendingPhoto,
  saveDraft,
  useOnlineStatus,
} from "@/lib/portal/offline";

// ── Types ────────────────────────────────────────────────────────────

interface CrewMember {
  id: string;
  name: string;
  role: string | null;
}

/** One selectable imputation target: a submission position or a planning task. */
interface ImputationOption {
  value: string;
  label: string;
  group: "cfc" | "task";
  cfc_code: string | null;
  planning_task_id: string | null;
}

interface SupplierOption {
  id: string;
  company_name: string;
}

interface LaborEntry {
  key: string;
  crew_member_id: string;
  work_description: string;
  duration_hours: number;
  is_driver: boolean;
  cfc_code: string | null;
  planning_task_id: string | null;
}

interface MachineEntry {
  key: string;
  machine_description: string;
  duration_hours: number;
  is_rented: boolean;
  cfc_code: string | null;
  planning_task_id: string | null;
}

interface DeliveryNoteEntry {
  key: string;
  note_number: string;
  supplier_name: string;
  supplier_id: string | null;
  /** Persisted value: a storage PATH (re-signed on read), never a raw URL. */
  photo_url: string;
  /** Short-lived signed URL for the <img> preview — NOT persisted (it expires). */
  photo_display_url?: string;
  /** Set when the photo is queued in IndexedDB (captured offline). */
  pending_photo_id: string | null;
  /** Queued photo could not be recovered after an app restart. */
  photo_missing?: boolean;
}

interface Report {
  id?: string;
  status: string;
  updated_at?: string | null;
  signature_data?: string | null;
  signed_by?: string | null;
  signed_at?: string | null;
}

type SyncState = "idle" | "saving" | "saved" | "pending" | "error";

interface DraftSnapshot {
  v: 1;
  updatedAt: number;
  laborEntries: LaborEntry[];
  machineEntries: MachineEntry[];
  deliveryNotes: DeliveryNoteEntry[];
  selectedCrew: string[];
  remarks: string;
  weather: string;
  signature: string | null;
  /** A save was attempted offline and still has to reach the server. */
  pendingSubmit: boolean | null;
}

interface ReportFormProps {
  projectId: string;
  userName?: string;
  /** Called when a portal request returns 401 (the 7-day session expired), so
   *  the shell can drop back to the PIN screen. The local draft survives. */
  onSessionExpired?: () => void;
}

const REF_CACHE_PREFIX = "cantaia_portal_ref";

let keySeed = 0;
function newKey(prefix: string): string {
  keySeed += 1;
  return `${prefix}-${Date.now()}-${keySeed}`;
}

/** Server said no (4xx/5xx) — as opposed to "the request never left the phone". */
function serverError(message?: string): Error {
  const error = new Error(message || "server");
  (error as Error & { isServerError?: true }).isServerError = true;
  return error;
}

function isServerError(error: unknown): boolean {
  return Boolean((error as { isServerError?: boolean } | null)?.isServerError);
}

function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().split("T")[0];
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().split("T")[0];
}

// ── Shared presentational bits ───────────────────────────────────────

const INPUT_CLASS =
  "min-h-[44px] w-full rounded-lg border border-[#3F3F46] bg-[#27272A] px-3 text-[16px] text-[#FAFAFA] " +
  "placeholder:text-[#A1A1AA] outline-none focus-visible:border-[#F97316] " +
  "focus-visible:ring-2 focus-visible:ring-[#F97316]/40 disabled:opacity-60";

function Section({
  icon,
  title,
  count,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#27272A] bg-[#18181B]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-[15px] font-semibold text-[#FAFAFA]">
          <span className="text-[#F97316]" aria-hidden="true">
            {icon}
          </span>
          {title}
          {count !== undefined && (
            <span className="rounded-md bg-[#27272A] px-2 py-0.5 text-[13px] font-medium text-[#D4D4D8]">
              {count}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="h-5 w-5 shrink-0 text-[#A1A1AA]" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-5 w-5 shrink-0 text-[#A1A1AA]" aria-hidden="true" />
        )}
      </button>
      {open && <div className="border-t border-[#27272A] px-4 py-3">{children}</div>}
    </section>
  );
}

/** Real checkbox semantics on a 44px target (the old 22px <div onClick> was unusable with gloves). */
function CheckTarget({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:ring-[#F97316]/50"
    >
      <span
        className={
          "flex h-6 w-6 items-center justify-center rounded-md border-2 text-[#0F0F11] " +
          (checked ? "border-[#F97316] bg-[#F97316]" : "border-[#71717A] bg-transparent")
        }
      >
        {checked && <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
      </span>
    </button>
  );
}

/** Icon toggle (driver / rented) with pressed state and an accessible name. */
function IconToggle({
  pressed,
  onToggle,
  disabled,
  label,
  children,
}: {
  pressed: boolean;
  onToggle: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onToggle}
      className={
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors " +
        (pressed
          ? "border-[#F97316] bg-[#F97316]/15 text-[#F97316]"
          : "border-[#3F3F46] bg-[#27272A] text-[#A1A1AA]") +
        " disabled:opacity-50"
      }
    >
      {children}
    </button>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#F87171] focus-visible:ring-2 focus-visible:ring-[#F97316]/50"
    >
      <X className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

/**
 * Imputation picker: charge this line to a CFC position or a planning task.
 *
 * Module-level on purpose — defined inside the form it would be a NEW component
 * type on every keystroke, remounting the <select> (and closing the native
 * picker mid-selection on Android).
 */
function ImputationSelect({
  entry,
  options,
  label,
  emptyLabel,
  cfcGroupLabel,
  taskGroupLabel,
  onChange,
  disabled,
}: {
  entry: { cfc_code: string | null; planning_task_id: string | null };
  options: ImputationOption[];
  label: string;
  emptyLabel: string;
  cfcGroupLabel: string;
  taskGroupLabel: string;
  onChange: (patch: { cfc_code: string | null; planning_task_id: string | null }) => void;
  disabled?: boolean;
}) {
  const cfcOptions = options.filter((o) => o.group === "cfc");
  const taskOptions = options.filter((o) => o.group === "task");

  return (
    <select
      value={imputationValueOf(entry, options)}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => {
        const option = options.find((o) => o.value === e.target.value);
        onChange({
          cfc_code: option?.cfc_code ?? null,
          planning_task_id: option?.planning_task_id ?? null,
        });
      }}
      className={INPUT_CLASS + " appearance-none"}
    >
      <option value="">{emptyLabel}</option>
      {cfcOptions.length > 0 && (
        <optgroup label={cfcGroupLabel}>
          {cfcOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      )}
      {taskOptions.length > 0 && (
        <optgroup label={taskGroupLabel}>
          {taskOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

/** Which option a stored (cfc_code, planning_task_id) pair corresponds to. */
function imputationValueOf(
  entry: { cfc_code: string | null; planning_task_id: string | null },
  options: ImputationOption[],
): string {
  if (entry.planning_task_id) {
    const match = options.find(
      (o) => o.group === "task" && o.planning_task_id === entry.planning_task_id,
    );
    if (match) return match.value;
  }
  if (entry.cfc_code) {
    const match = options.find((o) => o.group === "cfc" && o.cfc_code === entry.cfc_code);
    if (match) return match.value;
  }
  return "";
}

/** Confirmation sheet — replaces the "one tap from irreversible" of the old bar. */
function ConfirmSheet({
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[430px] rounded-2xl border border-[#3F3F46] bg-[#18181B] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
      >
        <h2 className="text-[17px] font-bold text-[#FAFAFA]">{title}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[#D4D4D8]">{body}</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={
              "min-h-[48px] w-full rounded-xl px-4 text-[15px] font-bold " +
              (tone === "danger"
                ? "bg-[#EF4444] text-[#FAFAFA]"
                : "bg-[#F97316] text-[#0F0F11]")
            }
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[48px] w-full rounded-xl border border-[#3F3F46] bg-[#27272A] px-4 text-[15px] font-semibold text-[#E4E4E7]"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main form ────────────────────────────────────────────────────────

export function ReportForm({ projectId, userName = "", onSessionExpired }: ReportFormProps) {
  const { t, formatDate } = usePortalI18n();
  const online = useOnlineStatus();

  const [reportDate, setReportDate] = useState(todayIso);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [imputationOptions, setImputationOptions] = useState<ImputationOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [photoPreviews, setPhotoPreviews] = useState<Record<string, string>>({});

  // Sync
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [pendingSubmit, setPendingSubmit] = useState<boolean | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  // Form state
  const [selectedCrew, setSelectedCrew] = useState<Set<string>>(new Set());
  const [laborEntries, setLaborEntries] = useState<LaborEntry[]>([]);
  const [machineEntries, setMachineEntries] = useState<MachineEntry[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNoteEntry[]>([]);
  const [remarks, setRemarks] = useState("");
  const [weather, setWeather] = useState("");
  const [signature, setSignature] = useState<string | null>(null);

  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["personnel"]));
  const [newCrewName, setNewCrewName] = useState("");
  const [newCrewRole, setNewCrewRole] = useState("");
  const [confirm, setConfirm] = useState<
    | null
    | { kind: "submit" }
    | { kind: "removeCrew"; id: string; name: string }
  >(null);

  const draftKey = useMemo(
    () => buildDraftKey(projectId, reportDate, userName),
    [projectId, reportDate, userName],
  );
  const refCacheKey = `${REF_CACHE_PREFIX}:${projectId}`;

  const isLocked = report?.status === "submitted" || report?.status === "locked";
  // Guards the draft-persistence effect: never write an empty snapshot over a
  // restored draft during the initial load.
  const hydratedRef = useRef(false);
  const previewUrlsRef = useRef<Set<string>>(new Set());

  /** Tracked object URL — revoked when the form unmounts. */
  function trackPreviewUrl(file: File): string {
    const url = URL.createObjectURL(file);
    previewUrlsRef.current.add(url);
    return url;
  }

  function releasePreviewUrl(url: string) {
    previewUrlsRef.current.delete(url);
    URL.revokeObjectURL(url);
  }

  // ── Load: reference data (cached), server report, then local draft ──
  useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;
    setLoading(true);
    setDraftRestored(false);
    setError("");
    setSuccess("");

    async function loadReference() {
      // Cache first so the form is usable with no network at all.
      const cached = loadDraft<{
        crew: CrewMember[];
        imputationOptions: ImputationOption[];
        suppliers: SupplierOption[];
      }>(refCacheKey);
      if (cached && !cancelled) {
        setCrew(cached.crew || []);
        setImputationOptions(cached.imputationOptions || []);
        setSuppliers(cached.suppliers || []);
      }

      const [crewRes, submissionRes, planningRes, suppliersRes] = await Promise.allSettled([
        fetch(`/api/portal/${projectId}/crew`).then((r) => r.json()),
        fetch(`/api/portal/${projectId}/submission`).then((r) => r.json()),
        fetch(`/api/portal/${projectId}/planning-tasks`).then((r) => r.json()),
        fetch(`/api/portal/${projectId}/suppliers`).then((r) => r.json()),
      ]);
      if (cancelled) return;

      const freshCrew: CrewMember[] =
        crewRes.status === "fulfilled" ? crewRes.value?.crew || [] : cached?.crew || [];

      const options: ImputationOption[] = [];
      if (submissionRes.status === "fulfilled") {
        for (const group of submissionRes.value?.groups || []) {
          for (const item of group.items || []) {
            if (!item.cfc_code) continue; // without a CFC there is nothing to impute
            options.push({
              value: `cfc:${item.id}`,
              label: `${item.cfc_code} · ${item.description || item.number || ""}`.slice(0, 90),
              group: "cfc",
              cfc_code: item.cfc_code,
              planning_task_id: null,
            });
          }
        }
      }
      if (planningRes.status === "fulfilled") {
        for (const task of planningRes.value?.tasks || []) {
          options.push({
            value: `task:${task.id}`,
            label: task.cfc_code ? `${task.cfc_code} · ${task.name}` : task.name,
            group: "task",
            cfc_code: task.cfc_code || null,
            planning_task_id: task.id,
          });
        }
      }

      const freshSuppliers: SupplierOption[] =
        suppliersRes.status === "fulfilled"
          ? suppliersRes.value?.suppliers || []
          : cached?.suppliers || [];

      const resolvedOptions = options.length > 0 ? options : cached?.imputationOptions || [];

      setCrew(freshCrew);
      setImputationOptions(resolvedOptions);
      setSuppliers(freshSuppliers);
      saveDraft(refCacheKey, {
        crew: freshCrew,
        imputationOptions: resolvedOptions,
        suppliers: freshSuppliers,
      });
    }

    async function loadReport() {
      let serverReport: Report | null = null;
      let serverState: Partial<DraftSnapshot> = {};

      try {
        const reportsRes = await fetch(`/api/portal/${projectId}/reports`);
        // The 7-day session cookie expired: fall back to the PIN screen. The
        // local draft survives the reconnection (nothing is lost).
        if (reportsRes.status === 401) {
          if (!cancelled) onSessionExpired?.();
          return;
        }
        const reportsData = await reportsRes.json().catch(() => ({}));
        // Reports are unique per (project, date, author): two foremen on the
        // same site each have their own. Never adopt someone else's report —
        // we would end up signing and submitting their hours.
        const sameDay = (reportsData.reports || []).filter(
          (r: any) => r.report_date === reportDate,
        );
        const mine = userName.trim().toLowerCase();
        const existing =
          sameDay.find((r: any) => (r.submitted_by_name || "").trim().toLowerCase() === mine) ||
          (mine ? undefined : sameDay.find((r: any) => !r.submitted_by_name));

        if (existing) {
          serverReport = existing;
          const detail = await fetch(`/api/portal/${projectId}/reports/${existing.id}`).then((r) =>
            r.json(),
          );
          const entries = detail.entries || [];
          serverReport = detail.report || existing;

          const labor = entries.filter((e: any) => e.entry_type === "labor");
          serverState = {
            laborEntries: labor.map((e: any) => ({
              key: newKey("labor"),
              crew_member_id: e.crew_member_id || "",
              work_description: e.work_description || "",
              duration_hours: Number(e.duration_hours) || 0,
              is_driver: Boolean(e.is_driver),
              cfc_code: e.cfc_code || null,
              planning_task_id: e.planning_task_id || null,
            })),
            selectedCrew: labor.map((e: any) => e.crew_member_id).filter(Boolean),
            machineEntries: entries
              .filter((e: any) => e.entry_type === "machine")
              .map((e: any) => ({
                key: newKey("machine"),
                machine_description: e.machine_description || "",
                duration_hours: Number(e.duration_hours) || 0,
                is_rented: Boolean(e.is_rented),
                cfc_code: e.cfc_code || null,
                planning_task_id: e.planning_task_id || null,
              })),
            deliveryNotes: entries
              .filter((e: any) => e.entry_type === "delivery_note")
              .map((e: any) => ({
                key: newKey("note"),
                note_number: e.note_number || "",
                supplier_name: e.supplier_name || "",
                supplier_id: e.supplier_id || null,
                // photo_url holds the storage PATH; the signed URL for the
                // <img> preview is transient and comes from the server.
                photo_url: e.photo_url || "",
                photo_display_url: e.photo_display_url || undefined,
                pending_photo_id: null,
              })),
            remarks: (serverReport as any)?.remarks || "",
            weather: (serverReport as any)?.weather || "",
            signature: (serverReport as any)?.signature_data || null,
          };
        }
      } catch {
        // Offline at load: the local draft below is the only source of truth.
        if (!cancelled) setSyncState((s) => (s === "pending" ? s : "idle"));
      }

      if (cancelled) return;

      // Apply the server state first…
      setReport(serverReport);
      setLaborEntries(serverState.laborEntries || []);
      setSelectedCrew(new Set(serverState.selectedCrew || []));
      setMachineEntries(serverState.machineEntries || []);
      setDeliveryNotes(serverState.deliveryNotes || []);
      setRemarks(serverState.remarks || "");
      setWeather(serverState.weather || "");
      setSignature(serverState.signature || null);

      // …then let the device draft win — but only when it is at least as recent
      // as the server, or carries work that never synced. Otherwise a second
      // device (or an older tab) would silently overwrite fresher server data.
      const draft = loadDraft<DraftSnapshot>(draftKey);
      const serverLocked =
        serverReport?.status === "submitted" || serverReport?.status === "locked";
      const serverUpdatedMs = serverReport?.updated_at
        ? Date.parse(serverReport.updated_at) || 0
        : 0;
      const draftHasUnsynced =
        draft?.pendingSubmit !== null && draft?.pendingSubmit !== undefined;
      const draftIsFresh =
        !serverUpdatedMs || (draft?.updatedAt ?? 0) >= serverUpdatedMs || draftHasUnsynced;

      if (draft && !serverLocked && draftIsFresh) {
        setLaborEntries(draft.laborEntries || []);
        setMachineEntries(draft.machineEntries || []);
        setDeliveryNotes(draft.deliveryNotes || []);
        setSelectedCrew(new Set(draft.selectedCrew || []));
        setRemarks(draft.remarks || "");
        setWeather(draft.weather || "");
        setSignature(draft.signature ?? null);
        setDraftRestored(true);
        if (draft.pendingSubmit !== null && draft.pendingSubmit !== undefined) {
          setPendingSubmit(draft.pendingSubmit);
          setSyncState("pending");
        }
        await restorePendingPhotos(draft.deliveryNotes || []);
      } else if (draft && serverLocked) {
        clearDraft(draftKey);
      }

      if (!cancelled) {
        hydratedRef.current = true;
        setLoading(false);
      }
    }

    async function restorePendingPhotos(notes: DeliveryNoteEntry[]) {
      const previews: Record<string, string> = {};
      const missing: string[] = [];
      for (const note of notes) {
        if (!note.pending_photo_id) continue;
        const file = await getPendingPhoto(note.pending_photo_id);
        if (file) previews[note.pending_photo_id] = trackPreviewUrl(file);
        else missing.push(note.key);
      }
      if (cancelled) return;
      if (Object.keys(previews).length > 0) setPhotoPreviews((prev) => ({ ...prev, ...previews }));
      if (missing.length > 0) {
        setDeliveryNotes((prev) =>
          prev.map((n) =>
            missing.includes(n.key) ? { ...n, pending_photo_id: null, photo_missing: true } : n,
          ),
        );
      }
    }

    // Whatever happens, the form must become usable: a spinner that never ends
    // is the worst possible outcome on site.
    void loadReference().catch(() => {});
    void loadReport().catch(() => {
      if (cancelled) return;
      hydratedRef.current = true;
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // onSessionExpired is intentionally excluded: the parent recreates it each
    // render, and reloading the whole report on every render is not wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, reportDate, draftKey, refCacheKey, userName]);

  // ── Persist the draft on every change ──────────────────────────────
  useEffect(() => {
    if (!hydratedRef.current || isLocked) return;
    const snapshot: DraftSnapshot = {
      v: 1,
      updatedAt: Date.now(),
      laborEntries,
      machineEntries,
      // Never persist the transient signed preview URL — it expires within the
      // hour and would render as a broken image after a later restore. The
      // stored PATH stays; the server re-signs it on the next load.
      deliveryNotes: deliveryNotes.map(({ photo_display_url, ...rest }) => {
        void photo_display_url;
        return rest;
      }),
      selectedCrew: Array.from(selectedCrew),
      remarks,
      weather,
      signature,
      pendingSubmit,
    };
    saveDraft(draftKey, snapshot);
  }, [
    draftKey,
    isLocked,
    laborEntries,
    machineEntries,
    deliveryNotes,
    selectedCrew,
    remarks,
    weather,
    signature,
    pendingSubmit,
  ]);

  // Object URLs created for queued photos must not leak. The ref accumulates
  // every URL ever created (the state map only holds the live ones).
  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  // Housekeeping: drop day-drafts older than three weeks so the per-day keys do
  // not pile up and exhaust localStorage.
  useEffect(() => {
    purgeStaleDrafts();
  }, []);

  // ── Mutations ──────────────────────────────────────────────────────

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCrewMember(id: string) {
    setSelectedCrew((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setLaborEntries((entries) => entries.filter((e) => e.crew_member_id !== id));
      } else {
        next.add(id);
        setLaborEntries((entries) => [
          ...entries,
          {
            key: newKey("labor"),
            crew_member_id: id,
            work_description: "",
            duration_hours: 0,
            is_driver: false,
            cfc_code: null,
            planning_task_id: null,
          },
        ]);
      }
      return next;
    });
  }

  function addLaborLine(crewId: string) {
    setLaborEntries((prev) => [
      ...prev,
      {
        key: newKey("labor"),
        crew_member_id: crewId,
        work_description: "",
        duration_hours: 0,
        is_driver: false,
        cfc_code: null,
        planning_task_id: null,
      },
    ]);
  }

  function updateLabor(key: string, patch: Partial<LaborEntry>) {
    setLaborEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }

  function updateMachine(key: string, patch: Partial<MachineEntry>) {
    setMachineEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }

  function updateNote(key: string, patch: Partial<DeliveryNoteEntry>) {
    setDeliveryNotes((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }

  /** Remove a delivery note, discarding any photo blob still queued offline so
   *  it does not linger in IndexedDB forever. */
  function removeNote(key: string) {
    setDeliveryNotes((prev) => {
      const target = prev.find((n) => n.key === key);
      if (target?.pending_photo_id) void deletePendingPhoto(target.pending_photo_id);
      return prev.filter((n) => n.key !== key);
    });
  }

  async function addCrewMember() {
    if (!newCrewName.trim()) return;
    const name = newCrewName.trim();
    const role = newCrewRole.trim() || null;
    try {
      const res = await fetch(`/api/portal/${projectId}/crew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role }),
      });
      if (!res.ok) {
        setError(t("networkError"));
        return;
      }
      const member = await res.json();
      setCrew((prev) => [...prev, member]);
      setNewCrewName("");
      setNewCrewRole("");
    } catch {
      // Adding a worker needs a real id (FK), so it cannot be queued offline.
      setError(t("offline"));
    }
  }

  async function removeCrew(id: string) {
    setCrew((prev) => prev.filter((c) => c.id !== id));
    setSelectedCrew((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setLaborEntries((prev) => prev.filter((e) => e.crew_member_id !== id));
    try {
      await fetch(`/api/portal/${projectId}/crew?id=${id}`, { method: "DELETE" });
    } catch {
      /* the local removal already applied; the server copy is soft-deleted later */
    }
  }

  // ── Photos ─────────────────────────────────────────────────────────

  /**
   * Id of today's report, creating the draft when needed.
   *
   * Throws a *tagged* error on a server rejection so the caller can tell a real
   * failure (surface it) from a dead network (queue it) — pretending a 500 is
   * "waiting for connection" would retry forever in silence.
   */
  async function ensureReportId(): Promise<string> {
    if (report?.id) return report.id;
    const res = await fetch(`/api/portal/${projectId}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_date: reportDate }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 409 && data.report_id) {
      setReport({ id: data.report_id, status: "draft" });
      return data.report_id;
    }
    if (res.ok && data.id) {
      setReport(data);
      return data.id;
    }
    throw serverError(data.error);
  }

  /** Maps a server upload error CODE to a translated message (the raw server
   *  text is always FR — a germanophone foreman would otherwise read French). */
  function uploadErrorMessage(code?: string): string {
    switch (code) {
      case "UNSUPPORTED_FORMAT":
        return t("photoUnsupported");
      case "TOO_LARGE":
        return t("photoTooLarge");
      case "LOCKED":
        return t("lockedBanner");
      default:
        return t("photoUploadFailed");
    }
  }

  /**
   * Uploads one photo and returns its stored PATH plus a short-lived preview URL
   * (throws — see serverError). The entry persists the path; the URL is only for
   * the immediate <img> and is re-minted by the server on later loads.
   */
  async function uploadPhotoFile(file: File): Promise<{ path: string; previewUrl: string }> {
    const reportId = await ensureReportId();

    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/portal/${projectId}/reports/${reportId}/upload`, {
      method: "POST",
      body: formData,
    });
    if (res.status === 401) {
      onSessionExpired?.();
      throw serverError(t("networkError"));
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.file_url) {
      // Rejected by the server (unsupported format, too large): queuing it for
      // a retry would never succeed.
      throw serverError(uploadErrorMessage(data.code));
    }
    return { path: data.file_url as string, previewUrl: (data.preview_url as string) || "" };
  }

  async function handlePhotoCapture(noteKey: string, file: File) {
    setError("");
    setUploadingPhoto(noteKey);

    // Show the picture immediately whatever happens next.
    const pendingId = newPendingPhotoId();
    const previewUrl = trackPreviewUrl(file);
    setPhotoPreviews((prev) => ({ ...prev, [pendingId]: previewUrl }));

    try {
      if (!online) throw new Error("offline");
      const { path, previewUrl: signedUrl } = await uploadPhotoFile(file);
      updateNote(noteKey, {
        photo_url: path,
        photo_display_url: signedUrl || undefined,
        pending_photo_id: null,
        photo_missing: false,
      });
      releasePreviewUrl(previewUrl);
      setPhotoPreviews((prev) => {
        const next = { ...prev };
        delete next[pendingId];
        return next;
      });
    } catch (err) {
      if (isServerError(err)) {
        // The photo itself is the problem — say so instead of queuing forever.
        releasePreviewUrl(previewUrl);
        setPhotoPreviews((prev) => {
          const next = { ...prev };
          delete next[pendingId];
          return next;
        });
        setError((err as Error).message);
        return;
      }
      // Queue it: the photo travels with the next successful sync.
      const stored = await savePendingPhoto(pendingId, file);
      updateNote(noteKey, {
        pending_photo_id: stored ? pendingId : null,
        photo_missing: !stored,
      });
      setSyncState((s) => (s === "saving" ? s : "pending"));
    } finally {
      setUploadingPhoto(null);
    }
  }

  /**
   * Uploads every photo queued offline and returns the RESOLVED notes.
   *
   * The caller must build its payload from the returned array, not from state:
   * `setDeliveryNotes` does not update the closure the current save is running
   * in, and a photo uploaded here would otherwise be dropped from the very
   * PATCH that was supposed to attach it.
   */
  const flushPendingPhotos = useCallback(async (): Promise<DeliveryNoteEntry[]> => {
    const current = deliveryNotes;
    if (!current.some((n) => n.pending_photo_id)) return current;

    const resolved: DeliveryNoteEntry[] = [];
    for (const note of current) {
      if (!note.pending_photo_id) {
        resolved.push(note);
        continue;
      }

      const file = await getPendingPhoto(note.pending_photo_id);
      if (!file) {
        resolved.push({ ...note, pending_photo_id: null, photo_missing: true });
        continue;
      }

      try {
        const { path, previewUrl } = await uploadPhotoFile(file);
        await deletePendingPhoto(note.pending_photo_id);
        resolved.push({
          ...note,
          photo_url: path,
          photo_display_url: previewUrl || undefined,
          pending_photo_id: null,
          photo_missing: false,
        });
      } catch {
        // Still no luck — keep it queued for the next attempt.
        resolved.push(note);
      }
    }

    setDeliveryNotes(resolved);
    return resolved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryNotes, projectId, report?.id]);

  // ── Save / submit ──────────────────────────────────────────────────

  function buildEntries(notes: DeliveryNoteEntry[] = deliveryNotes) {
    return [
      ...laborEntries.map((e) => ({
        entry_type: "labor",
        crew_member_id: e.crew_member_id,
        work_description: e.work_description,
        duration_hours: e.duration_hours,
        is_driver: e.is_driver,
        cfc_code: e.cfc_code,
        planning_task_id: e.planning_task_id,
      })),
      ...machineEntries.map((e) => ({
        entry_type: "machine",
        machine_description: e.machine_description,
        duration_hours: e.duration_hours,
        is_rented: e.is_rented,
        cfc_code: e.cfc_code,
        planning_task_id: e.planning_task_id,
      })),
      ...notes.map((e) => ({
        entry_type: "delivery_note",
        note_number: e.note_number,
        supplier_name: e.supplier_name,
        supplier_id: e.supplier_id,
        photo_url: e.photo_url,
      })),
    ];
  }

  const performSave = useCallback(
    async (submit: boolean): Promise<boolean> => {
      setSyncState("saving");
      setError("");
      setSuccess("");

      try {
        const reportId = await ensureReportId();
        const notes = await flushPendingPhotos();

        const res = await fetch(`/api/portal/${projectId}/reports/${reportId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            remarks,
            weather,
            entries: buildEntries(notes),
            signature_data: signature,
            signed_by: userName || null,
            ...(submit ? { status: "submitted" } : {}),
          }),
        });

        if (res.status === 401) {
          // Session expired: keep everything local (the draft survives) and send
          // the crew back to the PIN screen instead of showing a raw error.
          setSyncState("pending");
          setPendingSubmit(submit);
          setError(t("sessionExpired"));
          onSessionExpired?.();
          return false;
        }

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          // A 4xx is a real rejection, not a connectivity problem: surface it
          // instead of pretending the report is queued.
          setSyncState("error");
          setError(data.error || t("networkError"));
          return false;
        }

        setSyncState("saved");
        setPendingSubmit(null);
        setSuccess(submit ? t("reportSubmitted") : t("draftSaved"));
        if (submit) {
          setReport((prev) => (prev ? { ...prev, status: "submitted" } : prev));
          clearDraft(draftKey);
        }
        return true;
      } catch (err) {
        if (isServerError(err)) {
          // The request reached the server and was refused: retrying on
          // reconnect would loop forever, so say so instead.
          setSyncState("error");
          setError((err as Error).message);
          return false;
        }
        // Network unreachable (or the device went offline mid-request): keep
        // everything locally and replay on reconnect.
        setSyncState("pending");
        setPendingSubmit(submit);
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, remarks, weather, signature, userName, laborEntries, machineEntries, deliveryNotes, draftKey, flushPendingPhotos],
  );

  // Replay automatically when the connection comes back.
  useEffect(() => {
    if (!online || syncState !== "pending") return;
    if (pendingSubmit !== null) {
      void performSave(pendingSubmit);
      return;
    }
    // A photo was queued without a save ever being attempted (pendingSubmit is
    // null): the "will send when back online" promise must still be kept.
    if (deliveryNotes.some((n) => n.pending_photo_id)) void performSave(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  function requestSave(submit: boolean) {
    if (submit) {
      setConfirm({ kind: "submit" });
      return;
    }
    void performSave(false);
  }

  // ── Imputation helpers ─────────────────────────────────────────────

  const hasImputation = imputationOptions.length > 0;

  /** Props shared by every imputation picker on the page. */
  const imputationProps = {
    options: imputationOptions,
    label: t("imputation"),
    emptyLabel: t("noImputation"),
    cfcGroupLabel: t("cfcPosition"),
    taskGroupLabel: t("planningTask"),
  };

  // ── Render ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" aria-hidden="true" />
      </div>
    );
  }

  const isToday = reportDate === todayIso();
  const totalHours =
    laborEntries.reduce((sum, e) => sum + (Number(e.duration_hours) || 0), 0) || 0;

  const statusLabel: PortalKey | null =
    report?.status === "draft"
      ? "draft"
      : report?.status === "submitted"
      ? "submitted"
      : report?.status === "locked"
      ? "locked"
      : null;

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* ── Date navigation ── */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setReportDate(shiftDate(reportDate, -1))}
          aria-label={t("previousDay")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#3F3F46] bg-[#18181B] text-[#E4E4E7]"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 text-center">
          <div className="truncate font-display text-[15px] font-bold text-[#FAFAFA]">
            {formatDate(reportDate)}
          </div>
          {statusLabel && (
            <span
              className={
                "mt-1 inline-block rounded-md px-2 py-0.5 text-[13px] font-semibold " +
                (report?.status === "draft"
                  ? "bg-[#27272A] text-[#D4D4D8]"
                  : report?.status === "submitted"
                  ? "bg-[#10B981]/15 text-[#34D399]"
                  : "bg-[#3B82F6]/15 text-[#60A5FA]")
              }
            >
              {t(statusLabel)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => !isToday && setReportDate(shiftDate(reportDate, 1))}
          disabled={isToday}
          aria-label={t("nextDay")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#3F3F46] bg-[#18181B] text-[#E4E4E7] disabled:opacity-40"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* ── Network / sync banners ── */}
      {!online && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-4 py-3 text-[14px] text-[#FBBF24]"
        >
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("offline")}</span>
        </div>
      )}

      {syncState === "pending" && (
        <div
          role="status"
          className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-4 py-3 text-[14px] text-[#FBBF24]"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-semibold">{t("pendingSync")}</p>
              <p className="mt-0.5 text-[13px] text-[#FCD34D]">{t("pendingSyncDetail")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void performSave(pendingSubmit ?? false)}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-[#F59E0B]/40 bg-[#27272A] text-[14px] font-semibold text-[#FBBF24]"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t("retryNow")}
          </button>
        </div>
      )}

      {draftRestored && syncState !== "pending" && (
        <p className="text-[13px] text-[#A1A1AA]">{t("draftRestored")}</p>
      )}

      {isLocked && (
        <div className="flex items-start gap-2 rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-4 py-3 text-[14px] text-[#FBBF24]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("lockedBanner")}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-[#EF4444]/30 bg-[#EF4444]/10 px-4 py-3 text-[14px] text-[#F87171]"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-[#10B981]/30 bg-[#10B981]/10 px-4 py-3 text-[14px] text-[#34D399]"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{success}</span>
        </div>
      )}

      {/* ── Personnel ── */}
      <Section
        icon={<HardHat className="h-5 w-5" />}
        title={t("personnel")}
        count={`${selectedCrew.size}/${crew.length}`}
        open={openSections.has("personnel")}
        onToggle={() => toggleSection("personnel")}
      >
        <ul className="divide-y divide-[#27272A]">
          {crew.map((member) => {
            const isChecked = selectedCrew.has(member.id);
            return (
              <li key={member.id} className="flex items-center gap-2 py-1">
                <CheckTarget
                  checked={isChecked}
                  disabled={isLocked}
                  onChange={() => toggleCrewMember(member.id)}
                  label={`${member.name} — ${isChecked ? t("present") : t("absent")}`}
                />
                <span
                  className={
                    "min-w-0 flex-1 truncate text-[15px] " +
                    (isChecked ? "text-[#FAFAFA]" : "text-[#A1A1AA]")
                  }
                >
                  {member.name}
                </span>
                <span className="shrink-0 text-[13px] text-[#A1A1AA]">
                  {isChecked ? member.role || t("present") : t("absent")}
                </span>
                {!isLocked && (
                  <RemoveButton
                    label={`${t("remove")} — ${member.name}`}
                    onClick={() =>
                      setConfirm({ kind: "removeCrew", id: member.id, name: member.name })
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>

        {!isLocked && (
          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-[13px] font-semibold text-[#A1A1AA]">
                {t("crewName")}
              </label>
              <input
                type="text"
                value={newCrewName}
                onChange={(e) => setNewCrewName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="w-[110px]">
              <label className="mb-1 block text-[13px] font-semibold text-[#A1A1AA]">
                {t("crewRole")}
              </label>
              <input
                type="text"
                value={newCrewRole}
                onChange={(e) => setNewCrewRole(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <button
              type="button"
              onClick={addCrewMember}
              disabled={!newCrewName.trim()}
              aria-label={t("addCrew")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#3F3F46] bg-[#27272A] text-[#F97316] disabled:opacity-40"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Work lines per selected worker */}
        {crew
          .filter((m) => selectedCrew.has(m.id))
          .map((member) => {
            const memberEntries = laborEntries.filter((e) => e.crew_member_id === member.id);
            return (
              <div key={member.id} className="mt-4 border-t border-[#27272A] pt-3">
                <p className="mb-2 text-[13px] font-bold uppercase tracking-wide text-[#A1A1AA]">
                  {member.name}
                </p>
                {memberEntries.map((entry) => (
                  <div key={entry.key} className="mb-3 rounded-lg bg-[#27272A]/50 p-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={entry.work_description}
                        onChange={(e) => updateLabor(entry.key, { work_description: e.target.value })}
                        placeholder={t("workDescription")}
                        disabled={isLocked}
                        aria-label={t("workDescription")}
                        className={INPUT_CLASS + " flex-1"}
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={entry.duration_hours ? String(entry.duration_hours) : ""}
                        onChange={(e) =>
                          updateLabor(entry.key, {
                            duration_hours: parseFloat(e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".")) || 0,
                          })
                        }
                        placeholder="0"
                        disabled={isLocked}
                        aria-label={t("hours")}
                        className={INPUT_CLASS + " w-[72px] text-center font-semibold"}
                      />
                      <IconToggle
                        pressed={entry.is_driver}
                        disabled={isLocked}
                        label={t("driver")}
                        onToggle={() => updateLabor(entry.key, { is_driver: !entry.is_driver })}
                      >
                        <Truck className="h-5 w-5" aria-hidden="true" />
                      </IconToggle>
                      {!isLocked && (
                        <RemoveButton
                          label={t("remove")}
                          onClick={() =>
                            setLaborEntries((prev) => prev.filter((e) => e.key !== entry.key))
                          }
                        />
                      )}
                    </div>
                    {hasImputation && (
                      <div className="mt-2">
                        <ImputationSelect
                          {...imputationProps}
                          entry={entry}
                          disabled={isLocked}
                          onChange={(patch) => updateLabor(entry.key, patch)}
                        />
                      </div>
                    )}
                  </div>
                ))}
                {!isLocked && (
                  <button
                    type="button"
                    onClick={() => addLaborLine(member.id)}
                    className="flex min-h-[44px] items-center gap-1.5 text-[14px] font-semibold text-[#F97316]"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    {t("addWork")}
                  </button>
                )}
              </div>
            );
          })}

        {totalHours > 0 && (
          <p className="mt-3 border-t border-[#27272A] pt-3 text-[14px] text-[#D4D4D8]">
            <span className="font-semibold text-[#FAFAFA]">
              {t("totalHours", { count: totalHours })}
            </span>
          </p>
        )}
      </Section>

      {/* ── Machines ── */}
      <Section
        icon={<Truck className="h-5 w-5" />}
        title={t("machines")}
        count={String(machineEntries.length)}
        open={openSections.has("machines")}
        onToggle={() => toggleSection("machines")}
      >
        {machineEntries.map((machine) => (
          <div key={machine.key} className="mb-3 rounded-lg bg-[#27272A]/50 p-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={machine.machine_description}
                onChange={(e) => updateMachine(machine.key, { machine_description: e.target.value })}
                placeholder={t("machineDescription")}
                disabled={isLocked}
                aria-label={t("machineDescription")}
                className={INPUT_CLASS + " flex-1"}
              />
              <input
                type="text"
                inputMode="decimal"
                value={machine.duration_hours ? String(machine.duration_hours) : ""}
                onChange={(e) =>
                  updateMachine(machine.key, {
                    duration_hours: parseFloat(e.target.value.replace(/[^0-9.,]/g, "").replace(",", ".")) || 0,
                  })
                }
                placeholder="0"
                disabled={isLocked}
                aria-label={t("hours")}
                className={INPUT_CLASS + " w-[72px] text-center font-semibold"}
              />
              <IconToggle
                pressed={machine.is_rented}
                disabled={isLocked}
                label={t("rented")}
                onToggle={() => updateMachine(machine.key, { is_rented: !machine.is_rented })}
              >
                <span className="text-[15px] font-bold">L</span>
              </IconToggle>
              {!isLocked && (
                <RemoveButton
                  label={t("remove")}
                  onClick={() =>
                    setMachineEntries((prev) => prev.filter((m) => m.key !== machine.key))
                  }
                />
              )}
            </div>
            {hasImputation && (
              <div className="mt-2">
                <ImputationSelect
                  {...imputationProps}
                  entry={machine}
                  disabled={isLocked}
                  onChange={(patch) => updateMachine(machine.key, patch)}
                />
              </div>
            )}
          </div>
        ))}
        {!isLocked && (
          <button
            type="button"
            onClick={() =>
              setMachineEntries((prev) => [
                ...prev,
                {
                  key: newKey("machine"),
                  machine_description: "",
                  duration_hours: 0,
                  is_rented: false,
                  cfc_code: null,
                  planning_task_id: null,
                },
              ])
            }
            className="flex min-h-[44px] items-center gap-1.5 text-[14px] font-semibold text-[#F97316]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("addMachine")}
          </button>
        )}
      </Section>

      {/* ── Delivery notes ── */}
      <Section
        icon={<Package className="h-5 w-5" />}
        title={t("deliveryNotes")}
        count={String(deliveryNotes.length)}
        open={openSections.has("delivery")}
        onToggle={() => toggleSection("delivery")}
      >
        <datalist id="portal-suppliers">
          {suppliers.map((s) => (
            <option key={s.id} value={s.company_name} />
          ))}
        </datalist>

        {deliveryNotes.map((note) => {
          const previewUrl = note.pending_photo_id ? photoPreviews[note.pending_photo_id] : null;
          // photo_url is a storage PATH — never render it directly; use the
          // signed display URL (server) or the offline preview blob.
          const renderUrl = note.photo_display_url || previewUrl;
          return (
            <div key={note.key} className="mb-3 rounded-lg bg-[#27272A]/50 p-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={note.note_number}
                  onChange={(e) => updateNote(note.key, { note_number: e.target.value })}
                  placeholder={t("noteNumber")}
                  disabled={isLocked}
                  aria-label={t("noteNumber")}
                  className={INPUT_CLASS + " w-[38%]"}
                />
                <input
                  type="text"
                  list="portal-suppliers"
                  value={note.supplier_name}
                  onChange={(e) => {
                    const value = e.target.value;
                    const match = suppliers.find(
                      (s) => s.company_name.toLowerCase() === value.trim().toLowerCase(),
                    );
                    // Free text stays valid: an unknown supplier never blocks the note.
                    updateNote(note.key, { supplier_name: value, supplier_id: match?.id ?? null });
                  }}
                  placeholder={t("supplier")}
                  disabled={isLocked}
                  aria-label={t("supplier")}
                  className={INPUT_CLASS + " flex-1"}
                />
                {!isLocked && (
                  <RemoveButton label={t("remove")} onClick={() => removeNote(note.key)} />
                )}
              </div>

              <div className="mt-3 flex items-center gap-3">
                {renderUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={renderUrl}
                    alt={t("photo")}
                    className="h-14 w-14 rounded-lg object-cover"
                  />
                ) : note.photo_url ? (
                  // Photo attached (saved on the server) but not previewable
                  // right now — e.g. restored from an offline draft.
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-[#3F3F46] bg-[#27272A] text-[#A1A1AA]">
                    <Package className="h-6 w-6" aria-hidden="true" />
                  </div>
                ) : (
                  <label
                    className={
                      "flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[#3F3F46] bg-[#27272A] text-[#A1A1AA] " +
                      (isLocked ? "cursor-default opacity-50" : "")
                    }
                  >
                    {uploadingPhoto === note.key ? (
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Camera className="h-6 w-6" aria-hidden="true" />
                    )}
                    <span className="sr-only">{t("takePhoto")}</span>
                    {!isLocked && uploadingPhoto === null && (
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handlePhotoCapture(note.key, f);
                          e.target.value = "";
                        }}
                      />
                    )}
                  </label>
                )}
                <p className="text-[13px] leading-snug text-[#A1A1AA]">
                  {uploadingPhoto === note.key
                    ? t("photoUploading")
                    : note.photo_missing
                    ? t("photoLost")
                    : note.pending_photo_id
                    ? t("photoPending")
                    : note.photo_url
                    ? t("photoSaved")
                    : t("deliveryPhotoHint")}
                </p>
              </div>
            </div>
          );
        })}

        {!isLocked && (
          <button
            type="button"
            onClick={() =>
              setDeliveryNotes((prev) => [
                ...prev,
                {
                  key: newKey("note"),
                  note_number: "",
                  supplier_name: "",
                  supplier_id: null,
                  photo_url: "",
                  pending_photo_id: null,
                },
              ])
            }
            className="flex min-h-[44px] items-center gap-1.5 text-[14px] font-semibold text-[#F97316]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("addNote")}
          </button>
        )}
      </Section>

      {/* ── Remarks ── */}
      <Section
        icon={<MessageSquare className="h-5 w-5" />}
        title={t("remarks")}
        open={openSections.has("remarks")}
        onToggle={() => toggleSection("remarks")}
      >
        <label className="mb-1 block text-[13px] font-semibold text-[#A1A1AA]" htmlFor="portal-weather">
          {t("weather")}
        </label>
        <input
          id="portal-weather"
          type="text"
          value={weather}
          onChange={(e) => setWeather(e.target.value)}
          placeholder={t("weatherPlaceholder")}
          disabled={isLocked}
          className={INPUT_CLASS + " mb-3"}
        />
        <label className="mb-1 block text-[13px] font-semibold text-[#A1A1AA]" htmlFor="portal-remarks">
          {t("remarks")}
        </label>
        <textarea
          id="portal-remarks"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder={t("remarksPlaceholder")}
          disabled={isLocked}
          rows={4}
          className={INPUT_CLASS + " min-h-[96px] resize-y py-2 leading-relaxed"}
        />
      </Section>

      {/* ── Signature ── */}
      <Section
        icon={<PenLine className="h-5 w-5" />}
        title={t("signature")}
        count={signature ? undefined : t("signatureOptional")}
        open={openSections.has("signature")}
        onToggle={() => toggleSection("signature")}
      >
        {isLocked && signature ? (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signature}
              alt={t("signature")}
              className="w-full rounded-lg border border-[#3F3F46] bg-[#27272A]"
            />
            {report?.signed_by && (
              <p className="mt-2 text-[13px] text-[#A1A1AA]">
                {t("signedBy")} : {report.signed_by}
              </p>
            )}
            {report?.signed_at && (
              <p className="mt-0.5 text-[13px] text-[#A1A1AA]">
                {t("signedOn")} : {formatDate(report.signed_at.split("T")[0])}
              </p>
            )}
          </div>
        ) : (
          <SignaturePad value={signature} onChange={setSignature} disabled={isLocked} />
        )}
      </Section>

      {/* ── Actions ── */}
      {!isLocked && (
        <div className="mt-1 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => requestSave(true)}
            disabled={syncState === "saving"}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] text-[16px] font-bold text-[#0F0F11] disabled:opacity-60"
          >
            {syncState === "saving" ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-5 w-5" aria-hidden="true" />
            )}
            {syncState === "saving" ? t("syncing") : t("submit")}
          </button>
          <button
            type="button"
            onClick={() => requestSave(false)}
            disabled={syncState === "saving"}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[#3F3F46] bg-transparent text-[14px] font-semibold text-[#A1A1AA] disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {t("saveDraft")}
          </button>
          <p className="text-center text-[13px] text-[#A1A1AA]">{t("savedLocally")}</p>
        </div>
      )}

      {/* ── Confirmations ── */}
      {confirm?.kind === "submit" && (
        <ConfirmSheet
          title={t("confirmSubmitTitle")}
          body={t("confirmSubmitBody")}
          confirmLabel={t("confirmSubmitCta")}
          cancelLabel={t("cancel")}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void performSave(true);
          }}
        />
      )}

      {confirm?.kind === "removeCrew" && (
        <ConfirmSheet
          tone="danger"
          title={t("confirmRemoveCrewTitle", { name: confirm.name })}
          body={t("confirmRemoveCrewBody")}
          confirmLabel={t("confirmRemoveCrewCta")}
          cancelLabel={t("cancel")}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const id = confirm.id;
            setConfirm(null);
            void removeCrew(id);
          }}
        />
      )}
    </div>
  );
}
