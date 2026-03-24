"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

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
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["personnel"]));

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
      const existing = (reportsData.reports || []).find(
        (r: any) => r.report_date === reportDate
      );
      if (existing) {
        setReport(existing);
        setRemarks(existing.remarks || "");
        setWeather(existing.weather || "");
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

  function toggleSection(id: string) {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  // Format date for display
  function formatDateDisplay(dateStr: string) {
    try {
      const d = new Date(dateStr + "T12:00:00");
      const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
      const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
      return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
      return dateStr;
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#F97316" }} />
      </div>
    );
  }

  // ── Inline styles ──
  const inputStyle: React.CSSProperties = {
    background: "#27272A", border: "1px solid #3F3F46", borderRadius: 6,
    padding: "7px 10px", fontSize: 12, color: "#D4D4D8", outline: "none",
  };

  const hoursInputStyle: React.CSSProperties = {
    ...inputStyle, width: 60, textAlign: "center", color: "#FAFAFA", fontWeight: 600,
  };

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Date navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <button
          type="button"
          onClick={() => {
            const d = new Date(reportDate);
            d.setDate(d.getDate() - 1);
            setReportDate(d.toISOString().split("T")[0]);
          }}
          style={{
            width: 36, height: 36, borderRadius: 8, background: "#18181B",
            border: "1px solid #3F3F46", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, color: "#A1A1AA", cursor: "pointer",
          }}
        >
          ‹
        </button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 15, fontWeight: 700, color: "#FAFAFA" }}>
            {formatDateDisplay(reportDate)}
          </div>
          {report?.status && (
            <span style={{
              fontSize: 10, padding: "3px 8px", borderRadius: 5, fontWeight: 600,
              ...(report.status === "draft"
                ? { background: "#27272A", color: "#A1A1AA" }
                : report.status === "submitted"
                ? { background: "rgba(16, 185, 129, 0.09)", color: "#34D399" }
                : { background: "rgba(59, 130, 246, 0.1)", color: "#60A5FA" }),
            }}>
              {t(report.status as any)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            const d = new Date(reportDate);
            d.setDate(d.getDate() + 1);
            const tomorrow = d.toISOString().split("T")[0];
            const today = new Date().toISOString().split("T")[0];
            if (tomorrow <= today) setReportDate(tomorrow);
          }}
          style={{
            width: 36, height: 36, borderRadius: 8, background: "#18181B",
            border: "1px solid #3F3F46", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, color: "#A1A1AA", cursor: "pointer",
          }}
        >
          ›
        </button>
      </div>

      {/* Locked banner */}
      {isLocked && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, borderRadius: 10,
          background: "rgba(251, 191, 36, 0.08)", border: "1px solid rgba(251, 191, 36, 0.2)",
          padding: "10px 14px", fontSize: 12, color: "#FBBF24",
        }}>
          🔒 Ce rapport a été envoyé et ne peut plus être modifié.
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, borderRadius: 10,
          background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)",
          padding: "10px 14px", fontSize: 12, color: "#F87171",
        }}>
          ❌ {error}
        </div>
      )}

      {/* Success banner */}
      {success && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, borderRadius: 10,
          background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.2)",
          padding: "10px 14px", fontSize: 12, color: "#34D399",
        }}>
          ✅ {success}
        </div>
      )}

      {/* ── Personnel section ── */}
      <div style={{ background: "#18181B", border: "1px solid #27272A", borderRadius: 10, overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => toggleSection("personnel")}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", cursor: "pointer", background: "none", border: "none", color: "inherit",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "#FAFAFA", display: "flex", alignItems: "center", gap: 6 }}>
            👷 {t("personnel")}
            <span style={{ fontSize: 10, color: "#71717A", background: "#27272A", padding: "2px 6px", borderRadius: 4 }}>
              {selectedCrew.size}/{crew.length}
            </span>
          </div>
          <span style={{ color: "#52525B", fontSize: 12 }}>{openSections.has("personnel") ? "▲" : "▼"}</span>
        </button>

        {openSections.has("personnel") && (
          <>
            {/* Crew checkboxes */}
            <div style={{ padding: "0 14px 10px" }}>
              {crew.map(member => {
                const isChecked = selectedCrew.has(member.id);
                return (
                  <div key={member.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #27272A" }}>
                    <div
                      onClick={() => !isLocked && toggleCrewMember(member.id)}
                      style={{
                        width: 22, height: 22, border: isChecked ? "none" : "2px solid #3F3F46",
                        borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, cursor: isLocked ? "default" : "pointer",
                        background: isChecked ? "#F97316" : "transparent",
                        color: "white", fontSize: 12,
                      }}
                    >
                      {isChecked && "✓"}
                    </div>
                    <span style={{ fontSize: 13, color: isChecked ? "#D4D4D8" : "#52525B", flex: 1 }}>
                      {member.name}
                    </span>
                    <span style={{ fontSize: 10, color: "#52525B" }}>
                      {!isChecked ? "Absent" : (member.role || "")}
                    </span>
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => removeCrew(member.id)}
                        style={{ background: "none", border: "none", color: "#3F3F46", cursor: "pointer", fontSize: 14, padding: 2 }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Add crew member inline */}
              {!isLocked && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 8 }}>
                  <input
                    type="text"
                    value={newCrewName}
                    onChange={e => setNewCrewName(e.target.value)}
                    placeholder={t("crewName")}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <input
                    type="text"
                    value={newCrewRole}
                    onChange={e => setNewCrewRole(e.target.value)}
                    placeholder={t("crewRole")}
                    style={{ ...inputStyle, width: 80 }}
                  />
                  <button
                    type="button"
                    onClick={addCrewMember}
                    disabled={!newCrewName.trim()}
                    style={{
                      background: "none", border: "none", color: newCrewName.trim() ? "#F97316" : "#3F3F46",
                      cursor: newCrewName.trim() ? "pointer" : "default", fontSize: 18, padding: 2,
                    }}
                  >
                    +
                  </button>
                </div>
              )}
            </div>

            {/* Work entries per selected crew */}
            {crew.filter(m => selectedCrew.has(m.id)).map(member => {
              const memberEntries = laborEntries
                .map((e, i) => ({ ...e, _idx: i }))
                .filter(e => e.crew_member_id === member.id);

              return (
                <div key={member.id} style={{ padding: "0 14px 10px", marginLeft: 32 }}>
                  <div style={{ fontSize: 10, color: "#71717A", marginBottom: 4, fontWeight: 600 }}>
                    {member.name}
                  </div>
                  {memberEntries.map(entry => (
                    <div key={entry._idx} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                      <input
                        type="text"
                        value={entry.work_description}
                        onChange={e => updateLabor(entry._idx, "work_description", e.target.value)}
                        placeholder={t("workDescription")}
                        disabled={isLocked}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <input
                        type="text"
                        value={entry.duration_hours ? `${entry.duration_hours}h` : ""}
                        onChange={e => {
                          const v = e.target.value.replace(/[^0-9.]/g, "");
                          updateLabor(entry._idx, "duration_hours", parseFloat(v) || 0);
                        }}
                        placeholder="0h"
                        disabled={isLocked}
                        style={hoursInputStyle}
                      />
                      <div
                        onClick={() => !isLocked && updateLabor(entry._idx, "is_driver", !entry.is_driver)}
                        style={{
                          width: 28, height: 28, borderRadius: 6,
                          background: entry.is_driver ? "rgba(249, 115, 22, 0.13)" : "#27272A",
                          border: entry.is_driver ? "1px solid #F97316" : "1px solid #3F3F46",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, cursor: isLocked ? "default" : "pointer",
                        }}
                      >
                        🚛
                      </div>
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={() => removeLabor(entry._idx)}
                          style={{ background: "none", border: "none", color: "#3F3F46", cursor: "pointer", fontSize: 14, padding: 2 }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {!isLocked && (
                    <div
                      onClick={() => addLaborLine(member.id)}
                      style={{ fontSize: 11, color: "#F97316", cursor: "pointer", padding: "4px 0", fontWeight: 500 }}
                    >
                      + {t("addWork")}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* ── Machines section ── */}
      <div style={{ background: "#18181B", border: "1px solid #27272A", borderRadius: 10, overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => toggleSection("machines")}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", cursor: "pointer", background: "none", border: "none", color: "inherit",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "#FAFAFA", display: "flex", alignItems: "center", gap: 6 }}>
            🚜 {t("machines")}
            <span style={{ fontSize: 10, color: "#71717A", background: "#27272A", padding: "2px 6px", borderRadius: 4 }}>
              {machineEntries.length}
            </span>
          </div>
          <span style={{ color: "#52525B", fontSize: 12 }}>{openSections.has("machines") ? "▲" : "▼"}</span>
        </button>

        {openSections.has("machines") && (
          <div style={{ padding: "0 14px 10px" }}>
            {machineEntries.map((machine, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                <input
                  type="text"
                  value={machine.machine_description}
                  onChange={e => updateMachine(i, "machine_description", e.target.value)}
                  placeholder={t("machineDescription")}
                  disabled={isLocked}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <input
                  type="text"
                  value={machine.duration_hours ? `${machine.duration_hours}h` : ""}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9.]/g, "");
                    updateMachine(i, "duration_hours", parseFloat(v) || 0);
                  }}
                  placeholder="0h"
                  disabled={isLocked}
                  style={hoursInputStyle}
                />
                <div
                  onClick={() => !isLocked && updateMachine(i, "is_rented", !machine.is_rented)}
                  style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: machine.is_rented ? "rgba(249, 115, 22, 0.13)" : "#27272A",
                    border: machine.is_rented ? "1px solid #F97316" : "1px solid #3F3F46",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, color: machine.is_rented ? "#F97316" : "#71717A",
                    cursor: isLocked ? "default" : "pointer",
                  }}
                >
                  L
                </div>
                {!isLocked && (
                  <button
                    type="button"
                    onClick={() => removeMachine(i)}
                    style={{ background: "none", border: "none", color: "#3F3F46", cursor: "pointer", fontSize: 14, padding: 2 }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {!isLocked && (
              <div
                onClick={addMachine}
                style={{ fontSize: 11, color: "#F97316", cursor: "pointer", padding: "4px 0", fontWeight: 500 }}
              >
                + {t("addMachine")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Delivery notes section ── */}
      <div style={{ background: "#18181B", border: "1px solid #27272A", borderRadius: 10, overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => toggleSection("delivery")}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", cursor: "pointer", background: "none", border: "none", color: "inherit",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "#FAFAFA", display: "flex", alignItems: "center", gap: 6 }}>
            📦 {t("deliveryNotes")}
            <span style={{ fontSize: 10, color: "#71717A", background: "#27272A", padding: "2px 6px", borderRadius: 4 }}>
              {deliveryNotes.length}
            </span>
          </div>
          <span style={{ color: "#52525B", fontSize: 12 }}>{openSections.has("delivery") ? "▲" : "▼"}</span>
        </button>

        {openSections.has("delivery") && (
          <div style={{ padding: "0 14px 10px" }}>
            {deliveryNotes.map((note, i) => (
              <div key={i} style={{ background: "#27272A", borderRadius: 8, padding: 10, marginBottom: 6 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <input
                    type="text"
                    value={note.note_number}
                    onChange={e => updateNote(i, "note_number", e.target.value)}
                    placeholder={t("noteNumber")}
                    disabled={isLocked}
                    style={{ ...inputStyle, flex: 0.4, background: "#18181B" }}
                  />
                  <input
                    type="text"
                    value={note.supplier_name}
                    onChange={e => updateNote(i, "supplier_name", e.target.value)}
                    placeholder={t("supplier")}
                    disabled={isLocked}
                    style={{ ...inputStyle, flex: 0.6, background: "#18181B" }}
                  />
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => removeNote(i)}
                      style={{ background: "none", border: "none", color: "#3F3F46", cursor: "pointer", fontSize: 14, padding: 2 }}
                    >
                      ×
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {note.photo_url ? (
                    <img src={note.photo_url} alt="Bon" style={{ height: 48, width: 48, borderRadius: 6, objectFit: "cover" }} />
                  ) : (
                    <label style={{
                      width: 48, height: 48, borderRadius: 6, background: "#3F3F46",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, cursor: isLocked ? "default" : "pointer",
                    }}>
                      📷
                      {!isLocked && (
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          style={{ display: "none" }}
                          onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) handlePhotoCapture(i, f);
                          }}
                        />
                      )}
                    </label>
                  )}
                  <div style={{ fontSize: 10, color: "#71717A" }}>
                    {note.photo_url ? "Photo enregistrée" : (
                      <>Photo du bon de livraison<br /><span style={{ color: "#52525B" }}>Appuyer pour prendre en photo</span></>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {!isLocked && (
              <div
                onClick={addDeliveryNote}
                style={{ fontSize: 11, color: "#F97316", cursor: "pointer", padding: "4px 0", fontWeight: 500 }}
              >
                + {t("addNote")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Remarks section ── */}
      <div style={{ background: "#18181B", border: "1px solid #27272A", borderRadius: 10, overflow: "hidden" }}>
        <button
          type="button"
          onClick={() => toggleSection("remarks")}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", cursor: "pointer", background: "none", border: "none", color: "inherit",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "#FAFAFA", display: "flex", alignItems: "center", gap: 6 }}>
            💬 {t("remarks")}
          </div>
          <span style={{ color: "#52525B", fontSize: 12 }}>{openSections.has("remarks") ? "▲" : "▼"}</span>
        </button>

        {openSections.has("remarks") && (
          <div style={{ padding: "0 14px 10px" }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: "#71717A", marginBottom: 3, fontWeight: 600 }}>
                {t("weather") || "Météo"}
              </div>
              <input
                type="text"
                value={weather}
                onChange={e => setWeather(e.target.value)}
                placeholder="Ex: Ensoleillé, 18°C"
                disabled={isLocked}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder={t("remarksPlaceholder") || "Notes, incidents, retards..."}
              disabled={isLocked}
              style={{
                ...inputStyle, width: "100%", minHeight: 60, resize: "vertical",
                fontFamily: "'Inter', sans-serif",
              }}
            />
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      {!isLocked && (
        <div style={{ display: "flex", gap: 8, padding: "6px 0" }}>
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            style={{
              flex: 1, padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600,
              textAlign: "center", cursor: saving ? "not-allowed" : "pointer",
              background: "#27272A", color: "#D4D4D8", border: "1px solid #3F3F46",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "..." : `💾 ${t("saveDraft")}`}
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            style={{
              flex: 1, padding: 12, borderRadius: 10, fontSize: 13, fontWeight: 600,
              textAlign: "center", cursor: saving ? "not-allowed" : "pointer",
              background: "linear-gradient(135deg, #F97316, #EA580C)", color: "white", border: "none",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "..." : `📤 ${t("submit")}`}
          </button>
        </div>
      )}
    </div>
  );
}
