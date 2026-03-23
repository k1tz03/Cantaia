"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Plus, Trash2, Camera, Loader2, CheckCircle2, ChevronDown, ChevronUp,
  Truck, Save, Send, AlertCircle, Lock
} from "lucide-react";

interface CrewMember {
  id: string;
  name: string;
  role: string | null;
}

interface LaborEntry {
  crew_member_id: string;
  work_description: string;
  duration_hours: number;
  is_driver: boolean;
}

interface MachineEntry {
  machine_description: string;
  duration_hours: number;
  is_rented: boolean;
}

interface DeliveryNoteEntry {
  note_number: string;
  supplier_name: string;
  photo_url: string;
  photo_file?: File;
}

interface Report {
  id?: string;
  status: string;
  remarks: string;
  weather: string;
}

interface ReportFormProps {
  projectId: string;
}

export function ReportForm({ projectId }: ReportFormProps) {
  const t = useTranslations("portal");
  const [reportDate, setReportDate] = useState(new Date().toISOString().split("T")[0]);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form state
  const [selectedCrew, setSelectedCrew] = useState<Set<string>>(new Set());
  const [laborEntries, setLaborEntries] = useState<LaborEntry[]>([]);
  const [machineEntries, setMachineEntries] = useState<MachineEntry[]>([]);
  const [deliveryNotes, setDeliveryNotes] = useState<DeliveryNoteEntry[]>([]);
  const [remarks, setRemarks] = useState("");
  const [weather, setWeather] = useState("");

  // Sections
  const [openSection, setOpenSection] = useState<string>("personnel");

  // New crew member
  const [newCrewName, setNewCrewName] = useState("");
  const [newCrewRole, setNewCrewRole] = useState("");

  // Fetch crew + existing report
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/portal/${projectId}/crew`).then(r => r.json()),
      fetch(`/api/portal/${projectId}/reports`).then(r => r.json()),
    ]).then(([crewData, reportsData]) => {
      setCrew(crewData.crew || []);
      // Find report for selected date
      const existing = (reportsData.reports || []).find(
        (r: any) => r.report_date === reportDate
      );
      if (existing) {
        setReport(existing);
        setRemarks(existing.remarks || "");
        setWeather(existing.weather || "");
        // Load entries
        fetch(`/api/portal/${projectId}/reports/${existing.id}`)
          .then(r => r.json())
          .then(d => {
            if (d.entries) {
              const labor = d.entries.filter((e: any) => e.entry_type === "labor");
              const machines = d.entries.filter((e: any) => e.entry_type === "machine");
              const notes = d.entries.filter((e: any) => e.entry_type === "delivery_note");
              setLaborEntries(labor.map((e: any) => ({
                crew_member_id: e.crew_member_id || "",
                work_description: e.work_description || "",
                duration_hours: Number(e.duration_hours) || 0,
                is_driver: e.is_driver || false,
              })));
              setSelectedCrew(new Set(labor.map((e: any) => e.crew_member_id)));
              setMachineEntries(machines.map((e: any) => ({
                machine_description: e.machine_description || "",
                duration_hours: Number(e.duration_hours) || 0,
                is_rented: e.is_rented || false,
              })));
              setDeliveryNotes(notes.map((e: any) => ({
                note_number: e.note_number || "",
                supplier_name: e.supplier_name || "",
                photo_url: e.photo_url || "",
              })));
            }
          });
      } else {
        setReport(null);
        setLaborEntries([]);
        setMachineEntries([]);
        setDeliveryNotes([]);
        setSelectedCrew(new Set());
        setRemarks("");
        setWeather("");
      }
    }).finally(() => setLoading(false));
  }, [projectId, reportDate]);

  function toggleCrewMember(id: string) {
    const next = new Set(selectedCrew);
    if (next.has(id)) {
      next.delete(id);
      setLaborEntries(prev => prev.filter(e => e.crew_member_id !== id));
    } else {
      next.add(id);
      setLaborEntries(prev => [...prev, { crew_member_id: id, work_description: "", duration_hours: 0, is_driver: false }]);
    }
    setSelectedCrew(next);
  }

  function addLaborLine(crewId: string) {
    setLaborEntries(prev => [...prev, { crew_member_id: crewId, work_description: "", duration_hours: 0, is_driver: false }]);
  }

  function updateLabor(index: number, field: keyof LaborEntry, value: any) {
    setLaborEntries(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
  }

  function removeLabor(index: number) {
    setLaborEntries(prev => prev.filter((_, i) => i !== index));
  }

  function addMachine() {
    setMachineEntries(prev => [...prev, { machine_description: "", duration_hours: 0, is_rented: false }]);
  }

  function updateMachine(index: number, field: keyof MachineEntry, value: any) {
    setMachineEntries(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
  }

  function removeMachine(index: number) {
    setMachineEntries(prev => prev.filter((_, i) => i !== index));
  }

  function addDeliveryNote() {
    setDeliveryNotes(prev => [...prev, { note_number: "", supplier_name: "", photo_url: "" }]);
  }

  function updateNote(index: number, field: keyof DeliveryNoteEntry, value: any) {
    setDeliveryNotes(prev => prev.map((e, i) => i === index ? { ...e, [field]: value } : e));
  }

  function removeNote(index: number) {
    setDeliveryNotes(prev => prev.filter((_, i) => i !== index));
  }

  async function handlePhotoCapture(index: number, file: File) {
    // Upload photo
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/portal/${projectId}/reports/${report?.id || "temp"}/upload`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        updateNote(index, "photo_url", data.file_url);
      }
    } catch { /* ignore */ }
  }

  async function addCrewMember() {
    if (!newCrewName.trim()) return;
    const res = await fetch(`/api/portal/${projectId}/crew`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCrewName.trim(), role: newCrewRole.trim() || null }),
    });
    if (res.ok) {
      const member = await res.json();
      setCrew(prev => [...prev, member]);
      setNewCrewName("");
      setNewCrewRole("");
    }
  }

  async function removeCrew(id: string) {
    await fetch(`/api/portal/${projectId}/crew?id=${id}`, { method: "DELETE" });
    setCrew(prev => prev.filter(c => c.id !== id));
    setSelectedCrew(prev => { const n = new Set(prev); n.delete(id); return n; });
    setLaborEntries(prev => prev.filter(e => e.crew_member_id !== id));
  }

  async function buildEntries() {
    const entries: any[] = [];
    for (const labor of laborEntries) {
      entries.push({ entry_type: "labor", ...labor });
    }
    for (const machine of machineEntries) {
      entries.push({ entry_type: "machine", ...machine });
    }
    for (const note of deliveryNotes) {
      entries.push({ entry_type: "delivery_note", note_number: note.note_number, supplier_name: note.supplier_name, photo_url: note.photo_url });
    }
    return entries;
  }

  async function handleSave(submit: boolean = false) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      let reportId = report?.id;

      if (!reportId) {
        // Create report
        const res = await fetch(`/api/portal/${projectId}/reports`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report_date: reportDate }),
        });
        const data = await res.json();
        if (res.status === 409) {
          reportId = data.report_id;
        } else if (res.ok) {
          reportId = data.id;
          setReport(data);
        } else {
          setError(data.error || "Erreur");
          return;
        }
      }

      // Save entries
      const entries = await buildEntries();
      const res = await fetch(`/api/portal/${projectId}/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remarks,
          weather,
          entries,
          ...(submit ? { status: "submitted" } : {}),
        }),
      });

      if (res.ok) {
        setSuccess(submit ? t("submitted") : t("draft"));
        if (submit) {
          setReport(prev => prev ? { ...prev, status: "submitted" } : prev);
        }
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Erreur");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  const isLocked = report?.status === "submitted" || report?.status === "locked";

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;
  }

  function SectionHeader({ id, title, count }: { id: string; title: string; count?: number }) {
    const isOpen = openSection === id;
    return (
      <button
        type="button"
        onClick={() => setOpenSection(isOpen ? "" : id)}
        className="w-full flex items-center justify-between bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100"
      >
        <span className="text-sm font-semibold text-gray-900">
          {title} {count !== undefined && <span className="text-gray-400">({count})</span>}
        </span>
        {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* Date picker */}
      <div className="flex items-center gap-3">
        <input
          type="date"
          value={reportDate}
          onChange={e => setReportDate(e.target.value)}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
        />
        {report?.status && (
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
            report.status === "draft" ? "bg-gray-100 text-gray-600" :
            report.status === "submitted" ? "bg-green-100 text-green-700" :
            "bg-blue-100 text-blue-700"
          }`}>
            {t(report.status as any)}
          </span>
        )}
      </div>

      {isLocked && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-700 border border-amber-200">
          <Lock className="h-4 w-4 shrink-0" />
          Ce rapport a été envoyé et ne peut plus être modifié. Changez la date pour créer un nouveau rapport.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {success}
        </div>
      )}

      {/* Personnel section */}
      <SectionHeader id="personnel" title={t("personnel")} count={selectedCrew.size} />
      {openSection === "personnel" && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
          {crew.map(member => (
            <div key={member.id}>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedCrew.has(member.id)}
                  onChange={() => toggleCrewMember(member.id)}
                  disabled={isLocked}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900">{member.name}</span>
                  {member.role && <span className="text-xs text-gray-500 ml-2">{member.role}</span>}
                </div>
                <button type="button" onClick={() => removeCrew(member.id)} className="text-gray-300 hover:text-red-500" disabled={isLocked}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {selectedCrew.has(member.id) && (
                <div className="ml-7 mt-2 space-y-2">
                  {laborEntries.filter(e => e.crew_member_id === member.id).map((entry) => {
                    const globalIdx = laborEntries.indexOf(entry);
                    return (
                      <div key={globalIdx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={entry.work_description}
                          onChange={e => updateLabor(globalIdx, "work_description", e.target.value)}
                          placeholder={t("workDescription")}
                          disabled={isLocked}
                          className="flex-1 rounded border border-gray-200 px-2 py-1.5 text-xs bg-gray-50"
                        />
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="24"
                          value={entry.duration_hours || ""}
                          onChange={e => updateLabor(globalIdx, "duration_hours", parseFloat(e.target.value) || 0)}
                          disabled={isLocked}
                          className="w-14 rounded border border-gray-200 px-2 py-1.5 text-xs text-center bg-gray-50"
                        />
                        <span className="text-xs text-gray-400">{t("hours")}</span>
                        <button
                          type="button"
                          onClick={() => updateLabor(globalIdx, "is_driver", !entry.is_driver)}
                          disabled={isLocked}
                          className={`p-1 rounded ${entry.is_driver ? "text-blue-600 bg-blue-50" : "text-gray-300"}`}
                          title={t("driver")}
                        >
                          <Truck className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => removeLabor(globalIdx)} disabled={isLocked} className="text-gray-300 hover:text-red-500">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => addLaborLine(member.id)}
                    disabled={isLocked}
                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> {t("addWork")}
                  </button>
                </div>
              )}
            </div>
          ))}
          {/* Add crew member */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <input
              type="text"
              value={newCrewName}
              onChange={e => setNewCrewName(e.target.value)}
              placeholder={t("crewName")}
              disabled={isLocked}
              className="flex-1 rounded border border-gray-200 px-2 py-1.5 text-xs"
            />
            <input
              type="text"
              value={newCrewRole}
              onChange={e => setNewCrewRole(e.target.value)}
              placeholder={t("crewRole")}
              disabled={isLocked}
              className="w-24 rounded border border-gray-200 px-2 py-1.5 text-xs"
            />
            <button type="button" onClick={addCrewMember} disabled={isLocked || !newCrewName.trim()} className="text-blue-600 disabled:text-gray-300">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Machines section */}
      <SectionHeader id="machines" title={t("machines")} count={machineEntries.length} />
      {openSection === "machines" && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-2">
          {machineEntries.map((machine, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={machine.machine_description}
                onChange={e => updateMachine(i, "machine_description", e.target.value)}
                placeholder={t("machineDescription")}
                disabled={isLocked}
                className="flex-1 rounded border border-gray-200 px-2 py-1.5 text-xs bg-gray-50"
              />
              <input
                type="number"
                step="0.5"
                min="0"
                value={machine.duration_hours || ""}
                onChange={e => updateMachine(i, "duration_hours", parseFloat(e.target.value) || 0)}
                disabled={isLocked}
                className="w-14 rounded border border-gray-200 px-2 py-1.5 text-xs text-center bg-gray-50"
              />
              <span className="text-xs text-gray-400">{t("hours")}</span>
              <button
                type="button"
                onClick={() => updateMachine(i, "is_rented", !machine.is_rented)}
                disabled={isLocked}
                className={`text-xs px-1.5 py-0.5 rounded ${machine.is_rented ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-400"}`}
              >
                {t("rented")}
              </button>
              <button type="button" onClick={() => removeMachine(i)} disabled={isLocked} className="text-gray-300 hover:text-red-500">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addMachine} disabled={isLocked} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
            <Plus className="h-3 w-3" /> {t("addMachine")}
          </button>
        </div>
      )}

      {/* Delivery notes section */}
      <SectionHeader id="delivery" title={t("deliveryNotes")} count={deliveryNotes.length} />
      {openSection === "delivery" && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
          {deliveryNotes.map((note, i) => (
            <div key={i} className="space-y-2 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={note.note_number}
                  onChange={e => updateNote(i, "note_number", e.target.value)}
                  placeholder={t("noteNumber")}
                  disabled={isLocked}
                  className="flex-1 rounded border border-gray-200 px-2 py-1.5 text-xs bg-gray-50"
                />
                <input
                  type="text"
                  value={note.supplier_name}
                  onChange={e => updateNote(i, "supplier_name", e.target.value)}
                  placeholder={t("supplier")}
                  disabled={isLocked}
                  className="flex-1 rounded border border-gray-200 px-2 py-1.5 text-xs bg-gray-50"
                />
                <button type="button" onClick={() => removeNote(i)} disabled={isLocked} className="text-gray-300 hover:text-red-500">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                {note.photo_url ? (
                  <img src={note.photo_url} alt="Bon" className="h-16 w-16 rounded object-cover" />
                ) : null}
                <label className={`flex items-center gap-1.5 text-xs text-blue-600 cursor-pointer ${isLocked ? "opacity-50 pointer-events-none" : ""}`}>
                  <Camera className="h-3.5 w-3.5" />
                  {note.photo_url ? t("retakePhoto") : t("takePhoto")}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handlePhotoCapture(i, f);
                    }}
                  />
                </label>
              </div>
            </div>
          ))}
          <button type="button" onClick={addDeliveryNote} disabled={isLocked} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
            <Plus className="h-3 w-3" /> {t("addNote")}
          </button>
        </div>
      )}

      {/* Weather + Remarks section */}
      <SectionHeader id="remarks" title={t("remarks")} />
      {openSection === "remarks" && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">{t("weather") || "Météo"}</label>
            <input
              type="text"
              value={weather}
              onChange={e => setWeather(e.target.value)}
              placeholder="Ex: Ensoleillé, 18°C"
              disabled={isLocked}
              className="w-full rounded border border-gray-200 px-3 py-2 text-sm bg-gray-50"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">{t("remarks")}</label>
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder={t("remarksPlaceholder")}
              disabled={isLocked}
              rows={3}
              className="w-full rounded border border-gray-200 px-3 py-2 text-sm bg-gray-50 resize-none"
            />
          </div>
        </div>
      )}

      {/* Actions */}
      {!isLocked && (
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("saveDraft")}
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t("submit")}
          </button>
        </div>
      )}
    </div>
  );
}
