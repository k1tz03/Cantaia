"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useProject } from "@/lib/hooks/use-supabase-data";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  ClipboardList,
  CheckSquare,
} from "lucide-react";
import type { ReceptionParticipant, LotReception } from "@cantaia/database";
import { ReserveFormModal } from "@/components/closure/ReserveFormModal";
import { toLocalDateString } from "@/components/calendar/datetime-utils";

interface ReserveForm {
  description: string;
  location: string;
  severity: "minor" | "major" | "blocking";
  deadline: string;
}

export default function ReceptionFormPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("closure");

  const { project, loading: projectLoading } = useProject(params.id as string);

  // All hooks before early returns
  const [receptionType, setReceptionType] = useState<"provisional" | "partial" | "final">("provisional");
  const [receptionDate, setReceptionDate] = useState(toLocalDateString(new Date()));
  const [receptionLocation, setReceptionLocation] = useState("");
  const [participants, setParticipants] = useState<ReceptionParticipant[]>([]);
  const [lots, setLots] = useState<(LotReception & { reserves: ReserveForm[] })[]>([]);
  const [generalNotes, setGeneralNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [showNewParticipant, setShowNewParticipant] = useState(false);
  const [newParticipant, setNewParticipant] = useState<ReceptionParticipant>({
    name: "", role: "", company: "", present: true, signed: false,
  });
  const [initialized, setInitialized] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // ── Persisted reserves (reception_reserves rows, not the DOCX-only ones) ──
  // The reserves nested under a lot below only ever reach the generated DOCX.
  // These are the real rows: each one gets a "Lever la réserve" task and shows
  // up in the reserve register and on the Clôture tab.
  const [projectReserves, setProjectReserves] = useState<
    { id: string; description: string; severity: string; status: string; deadline: string | null }[]
  >([]);
  const [showReserveModal, setShowReserveModal] = useState(false);
  const projectId = params.id as string;

  const loadProjectReserves = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/reserves?project_id=${projectId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setProjectReserves(data.reserves || []);
    } catch {
      // Non-blocking: the reception form still works without the register.
    }
  }, [projectId]);

  useEffect(() => {
    loadProjectReserves();
  }, [loadProjectReserves]);

  // Initialize state values that depend on loaded project
  useEffect(() => {
    if (project && !initialized) {
      const meetings: { meeting_date: string; participants?: { name: string; role: string; company: string }[] }[] = [];
      const projectLots: { id: string; project_id: string; name: string; cfc_code: string; contractor_name?: string; budget_soumission?: number }[] = [];

      const lastMeeting = [...meetings].sort(
        (a, b) => new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime()
      )[0];

      setReceptionLocation(
        project.address ? `${String(project.address)}, ${String(project.city || "")}` : String(project.city || "")
      );

      setParticipants(
        lastMeeting?.participants?.map((p) => ({
          name: p.name,
          role: p.role,
          company: p.company,
          present: true,
          signed: false,
        })) || [
          { name: "", role: "Direction des travaux", company: "", present: true, signed: false },
          { name: "", role: "Maître d'ouvrage", company: "", present: true, signed: false },
        ]
      );

      setLots(
        projectLots.map((lot) => ({
          lot_id: lot.id,
          lot_name: lot.name,
          cfc_code: lot.cfc_code,
          company: lot.contractor_name || "",
          contract_amount: lot.budget_soumission || 0,
          final_amount: lot.budget_soumission || 0,
          status: "accepted" as const,
          notes: "",
          reserves: [],
        }))
      );

      setInitialized(true);
    }
  }, [project, initialized]);

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
        <p className="text-[#A1A1AA]">{t("projectNotFound")}</p>
      </div>
    );
  }

  const addParticipant = () => {
    if (newParticipant.name.trim()) {
      setParticipants([...participants, { ...newParticipant }]);
      setNewParticipant({ name: "", role: "", company: "", present: true, signed: false });
      setShowNewParticipant(false);
    }
  };

  const removeParticipant = (index: number) => {
    setParticipants(participants.filter((_, i) => i !== index));
  };

  const updateLot = (index: number, field: string, value: string | number) => {
    const updated = [...lots];
    (updated[index] as any)[field] = value;
    setLots(updated);
  };

  const addReserve = (lotIndex: number) => {
    const updated = [...lots];
    updated[lotIndex].reserves.push({
      description: "",
      location: "",
      severity: "minor",
      deadline: "",
    });
    setLots(updated);
  };

  const updateReserve = (lotIndex: number, reserveIndex: number, field: string, value: string) => {
    const updated = [...lots];
    (updated[lotIndex].reserves[reserveIndex] as any)[field] = value;
    setLots(updated);
  };

  const removeReserve = (lotIndex: number, reserveIndex: number) => {
    const updated = [...lots];
    updated[lotIndex].reserves = updated[lotIndex].reserves.filter((_, i) => i !== reserveIndex);
    setLots(updated);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const response = await fetch("/api/projects/closure/generate-pv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          reception_type: receptionType,
          reception_date: receptionDate,
          reception_location: receptionLocation,
          participants,
          lots: lots.map(({ reserves, ...lot }) => ({
            ...lot,
            reserves: lot.status === "reserves" ? reserves : [],
          })),
          general_notes: generalNotes,
          project_name: project.name,
          project_code: project.code,
        }),
      });

      if (response.ok) {
        // Read headers BEFORE consuming body
        const dbStatus = response.headers.get("X-DB-Save-Status");

        const blob = await response.blob();
        const { saveFileWithDialog } = await import("@/lib/tauri");
        await saveFileWithDialog(`PVR-${project.code || "PROJ"}-001.docx`, blob);

        // If the generate-pv route failed to save to DB, try a secondary save
        // via the closure/data API endpoint (belt-and-suspenders approach)
        if (dbStatus !== "ok") {
          console.warn("[Reception] DB save failed in generate-pv — attempting secondary save via closure/data API");
          try {
            await fetch(`/api/projects/${project.id}/closure/data`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "ensure-reception",
                reception_type: receptionType,
                reception_date: receptionDate,
              }),
            });
          } catch (e) {
            console.warn("[Reception] Secondary save also failed:", e);
          }
        }

        // ALWAYS save a localStorage marker as ultimate fallback
        // This ensures step 4 is marked complete even if ALL server-side saves fail
        // (e.g., migration 010 not applied → project_receptions table doesn't exist)
        try {
          localStorage.setItem(
            `cantaia_pv_generated_${project.id}`,
            JSON.stringify({
              generated_at: new Date().toISOString(),
              reception_type: receptionType,
              reception_date: receptionDate,
              filename: `PVR-${project.code || "PROJ"}-001.docx`,
            })
          );
          console.log("[Reception] localStorage marker saved for project", project.id);
        } catch {
          // localStorage might be full or disabled — non-fatal
        }

        // Navigate back to closure page with cache-bust param
        router.push(`/projects/${project.id}/closure?t=${Date.now()}`);
      } else {
        setGenerateError("Erreur lors de la génération du PV");
      }
    } catch (error) {
      console.error("[Reception] Generation error:", error);
      setGenerateError(error instanceof Error ? error.message : "Erreur inattendue");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href={`/projects/${project.id}/closure`}
          className="mt-1 rounded-md p-2 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#A1A1AA]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-[#FAFAFA]">
            {t("generateReceptionPV")}
          </h1>
          <p className="mt-1 text-sm text-[#A1A1AA]">{project.name}</p>
        </div>
      </div>

      <div className="mt-8 max-w-4xl space-y-8">
        {/* Reception type */}
        <div>
          <label className="text-sm font-semibold text-[#FAFAFA]">{t("receptionType")}</label>
          <div className="mt-2 flex gap-3">
            {(["provisional", "partial", "final"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setReceptionType(type)}
                className={`rounded-md border px-4 py-2 text-sm transition-colors ${
                  receptionType === type
                    ? "border-brand bg-brand/5 text-brand font-medium"
                    : "border-[#27272A] text-[#A1A1AA] hover:bg-[#27272A]"
                }`}
              >
                {t(type)}
              </button>
            ))}
          </div>
        </div>

        {/* Date & Location */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-[#FAFAFA]">{t("receptionDate")}</label>
            <input
              type="date"
              value={receptionDate}
              onChange={(e) => setReceptionDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-[#FAFAFA]">{t("receptionLocation")}</label>
            <input
              type="text"
              value={receptionLocation}
              onChange={(e) => setReceptionLocation(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Participants */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-[#FAFAFA]">{t("participants")}</label>
            <button
              type="button"
              onClick={() => setShowNewParticipant(true)}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand/80"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("addParticipant")}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {participants.map((p, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-md border border-[#27272A] bg-[#0F0F11] p-3"
              >
                <input
                  type="checkbox"
                  checked={p.present}
                  onChange={(e) => {
                    const updated = [...participants];
                    updated[i] = { ...updated[i], present: e.target.checked };
                    setParticipants(updated);
                  }}
                  className="h-4 w-4 rounded border-[#27272A] text-brand"
                />
                <div className="flex-1 text-sm">
                  <span className="font-medium text-[#FAFAFA]">{p.name}</span>
                  <span className="mx-1 text-[#A1A1AA]">—</span>
                  <span className="text-[#A1A1AA]">{p.role}</span>
                  <span className="mx-1 text-[#A1A1AA]">—</span>
                  <span className="text-[#A1A1AA]">{p.company}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeParticipant(i)}
                  className="p-1 text-[#A1A1AA] hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {showNewParticipant && (
            <div className="mt-3 rounded-md border border-[#F97316]/20 bg-[#F97316]/10 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  type="text"
                  placeholder={t("participantName")}
                  value={newParticipant.name}
                  onChange={(e) => setNewParticipant({ ...newParticipant, name: e.target.value })}
                  className="rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder={t("participantRole")}
                  value={newParticipant.role}
                  onChange={(e) => setNewParticipant({ ...newParticipant, role: e.target.value })}
                  className="rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder={t("participantCompany")}
                  value={newParticipant.company}
                  onChange={(e) => setNewParticipant({ ...newParticipant, company: e.target.value })}
                  className="rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={addParticipant}
                  className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90"
                >
                  {t("addParticipant")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewParticipant(false)}
                  className="rounded-md border border-[#27272A] px-3 py-1.5 text-xs font-medium text-[#A1A1AA] hover:bg-[#27272A]"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Lots */}
        <div>
          <label className="text-sm font-semibold text-[#FAFAFA]">{t("lots")}</label>
          <div className="mt-3 space-y-4">
            {lots.map((lot, lotIndex) => (
              <div
                key={lotIndex}
                className="rounded-md border border-[#27272A] bg-[#0F0F11] p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs font-medium text-[#A1A1AA]">CFC {lot.cfc_code}</span>
                    <p className="text-sm font-medium text-[#FAFAFA]">{lot.lot_name} — {lot.company}</p>
                  </div>
                  <span className="text-xs text-[#A1A1AA]">
                    {t("contractAmount")}: {lot.contract_amount.toLocaleString("fr-CH")} CHF
                  </span>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="text-xs text-[#A1A1AA]">{t("finalAmount")}</label>
                    <input
                      type="number"
                      value={lot.final_amount}
                      onChange={(e) => updateLot(lotIndex, "final_amount", Number(e.target.value))}
                      className="mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[#A1A1AA]">{t("lotStatus")}</label>
                    <select
                      value={lot.status}
                      onChange={(e) => updateLot(lotIndex, "status", e.target.value)}
                      className="mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                    >
                      <option value="accepted">{t("accepted")}</option>
                      <option value="reserves">{t("withReserves")}</option>
                      <option value="refused">{t("refused")}</option>
                    </select>
                  </div>
                  {lot.final_amount !== lot.contract_amount && lot.contract_amount > 0 && (
                    <div className="flex items-end">
                      <span className={`text-xs font-medium ${lot.final_amount > lot.contract_amount ? "text-red-400" : "text-green-400"}`}>
                        {lot.final_amount > lot.contract_amount ? "+" : ""}
                        {((lot.final_amount - lot.contract_amount) / lot.contract_amount * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Reserves for this lot */}
                {lot.status === "reserves" && (
                  <div className="mt-3 space-y-3 border-t border-[#27272A] pt-3">
                    {lot.reserves.map((reserve, rIndex) => (
                      <div key={rIndex} className="rounded-md border border-amber-200 bg-amber-500/10 p-3">
                        <div className="flex items-start justify-between">
                          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                            {t("reserves")} #{rIndex + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeReserve(lotIndex, rIndex)}
                            className="p-0.5 text-amber-400 hover:text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            placeholder={t("reserveDescription")}
                            value={reserve.description}
                            onChange={(e) => updateReserve(lotIndex, rIndex, "description", e.target.value)}
                            className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                          />
                          <div className="grid gap-2 sm:grid-cols-3">
                            <input
                              type="text"
                              placeholder={t("reserveLocation")}
                              value={reserve.location}
                              onChange={(e) => updateReserve(lotIndex, rIndex, "location", e.target.value)}
                              className="rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                            />
                            <select
                              value={reserve.severity}
                              onChange={(e) => updateReserve(lotIndex, rIndex, "severity", e.target.value)}
                              className="rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                            >
                              <option value="minor">{t("minor")}</option>
                              <option value="major">{t("major")}</option>
                              <option value="blocking">{t("blocking")}</option>
                            </select>
                            <input
                              type="date"
                              value={reserve.deadline}
                              onChange={(e) => updateReserve(lotIndex, rIndex, "deadline", e.target.value)}
                              className="rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addReserve(lotIndex)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:text-amber-400"
                    >
                      <Plus className="h-3 w-3" />
                      {t("addReserve")}
                    </button>
                  </div>
                )}
              </div>
            ))}

            {lots.length === 0 && (
              <div className="rounded-md border border-dashed border-[#27272A] bg-[#27272A] p-6 text-center">
                <AlertTriangle className="mx-auto h-6 w-6 text-[#A1A1AA]" />
                <p className="mt-2 text-sm text-[#A1A1AA]">
                  Aucun lot CFC enregistré pour ce projet.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Réserves du projet (persistées + tâche automatique) */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-semibold text-[#FAFAFA]">{t("reserves")}</label>
              <p className="mt-0.5 text-xs text-[#A1A1AA]">
                Chaque réserve crée une tâche « Lever la réserve » assignable, avec son délai.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowReserveModal(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#F97316]/40 bg-[#F97316]/10 px-3 py-1.5 text-xs font-medium text-[#F97316] hover:bg-[#F97316]/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter une réserve
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {projectReserves.length === 0 ? (
              <div className="rounded-md border border-dashed border-[#27272A] bg-[#27272A]/40 p-6 text-center">
                <ClipboardList className="mx-auto h-6 w-6 text-[#52525B]" />
                <p className="mt-2 text-sm text-[#A1A1AA]">Aucune réserve enregistrée.</p>
              </div>
            ) : (
              projectReserves.map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-[#27272A] bg-[#0F0F11] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#FAFAFA]">
                      <span className="mr-2 font-mono text-xs text-[#A1A1AA]">
                        R-{String(i + 1).padStart(3, "0")}
                      </span>
                      {r.description}
                    </p>
                    <p className="mt-0.5 text-xs text-[#A1A1AA]">
                      {t(r.severity)}
                      {r.deadline ? ` — échéance ${r.deadline}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      r.status === "verified"
                        ? "bg-green-500/10 text-green-400"
                        : "bg-amber-500/10 text-amber-400"
                    }`}
                  >
                    {r.status === "verified" ? t("reserveVerified") : t("reserveOpen")}
                  </span>
                </div>
              ))
            )}

            {projectReserves.length > 0 && (
              <Link
                href={`/projects/${project.id}/reserves`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#F97316] hover:text-[#EA580C]"
              >
                <CheckSquare className="h-3.5 w-3.5" />
                {t("viewReserves")} ({projectReserves.length})
              </Link>
            )}
          </div>
        </div>

        {/* General notes */}
        <div>
          <label className="text-sm font-medium text-[#FAFAFA]">Notes générales</label>
          <textarea
            value={generalNotes}
            onChange={(e) => setGeneralNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Observations générales sur la réception..."
          />
        </div>

        {/* Error banner */}
        {generateError && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-400">{generateError}</p>
          </div>
        )}

        {/* Generate button */}
        <div className="border-t border-[#27272A] pt-6">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("generating")}
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" />
                {t("generatePV")}
              </>
            )}
          </button>
        </div>
      </div>

      {showReserveModal && (
        <ReserveFormModal
          projectId={projectId}
          onClose={() => setShowReserveModal(false)}
          onCreated={() => loadProjectReserves()}
        />
      )}
    </div>
  );
}
