"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

/**
 * Modal that creates a reception reserve.
 *
 * Reachable from both entry points of the Clôture module: the reception form
 * (`/projects/[id]/closure/reception`) and the reserve register
 * (`/projects/[id]/reserves`). Creating a reserve also creates the task that
 * carries it — that happens server-side in POST /api/reserves.
 */

export interface ReserveCreatedPayload {
  reserve: Record<string, any>;
  task_id: string | null;
  task_error?: string;
}

const SEVERITY_OPTIONS = [
  { value: "minor", label: "Mineure", hint: "n'empêche pas l'usage", tone: "text-amber-400" },
  { value: "major", label: "Majeure", hint: "gêne l'exploitation", tone: "text-orange-400" },
  { value: "blocking", label: "Bloquante", hint: "empêche la réception", tone: "text-red-400" },
] as const;

export function ReserveFormModal({
  projectId,
  receptionId,
  defaultLotName,
  defaultCfcCode,
  defaultCompany,
  onClose,
  onCreated,
}: {
  projectId: string;
  receptionId?: string | null;
  defaultLotName?: string;
  defaultCfcCode?: string;
  defaultCompany?: string;
  onClose: () => void;
  onCreated: (payload: ReserveCreatedPayload) => void;
}) {
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [severity, setSeverity] = useState<"minor" | "major" | "blocking">("minor");
  const [deadline, setDeadline] = useState("");
  const [company, setCompany] = useState(defaultCompany || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = description.trim().length > 0 && !saving;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/reserves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          reception_id: receptionId || null,
          description: description.trim(),
          location: location.trim() || null,
          severity,
          deadline: deadline || null,
          lot_name: defaultLotName || null,
          cfc_code: defaultCfcCode || null,
          responsible_company: company.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "La réserve n'a pas pu être enregistrée.");
      }

      onCreated({ reserve: data.reserve, task_id: data.task_id ?? null, task_error: data.task_error });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-[#27272A] bg-[#18181B] shadow-xl">
        <div className="flex items-center justify-between border-b border-[#27272A] px-5 py-4">
          <h3 className="text-sm font-semibold text-[#FAFAFA]">Ajouter une réserve</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="text-xs font-medium text-[#A1A1AA]">Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Ex. : Fissure sur le mur nord du séjour, à reprendre avant la réception définitive"
              className="mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#52525B] focus:border-[#F97316] focus:outline-none"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-[#A1A1AA]">Localisation</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Étage, local, façade…"
                className="mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#52525B] focus:border-[#F97316] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#A1A1AA]">Entreprise responsable</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Nom de l'entreprise"
                className="mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#52525B] focus:border-[#F97316] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-[#A1A1AA]">Sévérité</label>
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              {SEVERITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSeverity(opt.value)}
                  className={`rounded-md border px-3 py-2 text-left transition-colors ${
                    severity === opt.value
                      ? "border-[#F97316] bg-[#F97316]/10"
                      : "border-[#27272A] bg-[#0F0F11] hover:border-[#3F3F46]"
                  }`}
                >
                  <span className={`block text-xs font-semibold ${opt.tone}`}>{opt.label}</span>
                  <span className="block text-[10px] text-[#A1A1AA]">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-[#A1A1AA]">Délai de levée</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none sm:w-56"
            />
            <p className="mt-1 text-[11px] text-[#A1A1AA]">
              Une tâche « Lever la réserve » est créée automatiquement avec cette échéance.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#27272A] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-[#A1A1AA] hover:bg-[#27272A]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2 text-sm font-semibold text-[#0F0F11] hover:bg-[#EA580C] disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Créer la réserve
          </button>
        </div>
      </div>
    </div>
  );
}
