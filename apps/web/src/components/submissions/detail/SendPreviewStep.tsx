"use client";

import { useState, useRef } from "react";
import { ArrowLeft, Send, Loader2, CheckCircle2, AlertCircle, Mail, Search, Paperclip, Camera, X, Package, Users } from "lucide-react";
import type { SubmissionLot, Supplier } from "./shared";
import type { SupplierAssignment } from "./PriceRequestWizard";

interface SendPreviewStepProps {
  submissionId: string;
  lots: SubmissionLot[];
  suppliers: Supplier[];
  assignments: SupplierAssignment;
  selectedItemIds?: Set<string>;
  deadline?: string | null;
  onBack: () => void;
  onComplete?: () => void;
}

interface PreviewData {
  subject: string;
  body_text: string;
  to: string;
  supplier_name: string;
  items_count: number;
}

export function SendPreviewStep({ submissionId, lots, suppliers, assignments, selectedItemIds, deadline, onBack, onComplete }: SendPreviewStepProps) {
  // Preview state
  const [previewOpen, setPreviewOpen] = useState<string | null>(null);
  const [previewGroupName, setPreviewGroupName] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Send state
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; saved: number; errors: number } | null>(null);
  const [error, setError] = useState("");

  // Per-supplier email edits
  const [editedBodies, setEditedBodies] = useState<Record<string, string>>({});
  const [editedSubjects, setEditedSubjects] = useState<Record<string, string>>({});

  // Per-group attachments
  const [groupAttachments, setGroupAttachments] = useState<Record<string, File[]>>({});
  const [isCapturing, setIsCapturing] = useState(false);
  const activeGroupRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasScreenCapture = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

  // Build group-centric data (inverted from the old supplier-centric model)
  const activeGroups = Object.entries(assignments)
    .filter(([, ids]) => ids.length > 0)
    .map(([groupName, supplierIds]) => {
      const lot = lots.find(l => l.name === groupName);
      const groupSuppliers = supplierIds
        .map(sId => suppliers.find(s => s.id === sId))
        .filter(Boolean) as Supplier[];
      return {
        groupName,
        suppliers: groupSuppliers,
        itemsCount: (lot as any)?.items_count || 0,
      };
    });

  // Totals (one email per supplier-group pair)
  const totalEmails = activeGroups.reduce((sum, g) => sum + g.suppliers.length, 0);
  const totalGroups = activeGroups.length;
  const totalItems = activeGroups.reduce((sum, g) => sum + g.itemsCount, 0);
  const totalAttachments = Object.values(groupAttachments).reduce((sum, files) => sum + files.length, 0);

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── Per-group file management ──

  function triggerFileUpload(groupName: string) {
    activeGroupRef.current = groupName;
    fileInputRef.current?.click();
  }

  function handleFileAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const valid = files.filter(f => f.size <= 10 * 1024 * 1024);
    const group = activeGroupRef.current;
    if (group && valid.length > 0) {
      setGroupAttachments(prev => ({
        ...prev,
        [group]: [...(prev[group] || []), ...valid],
      }));
    }
    e.target.value = "";
    activeGroupRef.current = null;
  }

  function removeAttachment(groupName: string, index: number) {
    setGroupAttachments(prev => ({
      ...prev,
      [groupName]: (prev[groupName] || []).filter((_, i) => i !== index),
    }));
  }

  async function handleScreenCapture(groupName: string) {
    try {
      setIsCapturing(true);
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];

      const video = document.createElement("video");
      video.srcObject = stream;
      video.autoplay = true;

      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => { video.play(); resolve(); };
      });
      await new Promise((r) => setTimeout(r, 200));

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0);
      track.stop();

      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/png")
      );
      const file = new File([blob], `capture-${Date.now()}.png`, { type: "image/png" });
      setGroupAttachments(prev => ({
        ...prev,
        [groupName]: [...(prev[groupName] || []), file],
      }));
    } catch {
      // User cancelled or API not supported
    } finally {
      setIsCapturing(false);
    }
  }

  // ── Preview ──

  async function handlePreview(supplierId: string, groupName: string) {
    setLoadingPreview(true);
    setPreviewOpen(supplierId);
    setPreviewGroupName(groupName);
    try {
      const params = new URLSearchParams({ group: groupName, supplier_id: supplierId });
      if (selectedItemIds && selectedItemIds.size > 0) {
        params.set("item_ids", Array.from(selectedItemIds).join(","));
      }
      const res = await fetch(`/api/submissions/${submissionId}/preview-email?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPreviewData(data);
      }
    } catch {
      setPreviewData(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  // ── Send ──

  async function handleSendAll() {
    setSending(true);
    setError("");
    try {
      const groups = Object.entries(assignments)
        .filter(([, ids]) => ids.length > 0)
        .map(([groupName, supplierIds]) => ({
          material_group: groupName,
          supplier_ids: supplierIds,
        }));

      // Convert per-group file attachments to base64
      const groupAttachmentsBase64: Record<string, Array<{ filename: string; contentType: string; content: string }>> = {};
      for (const [groupName, files] of Object.entries(groupAttachments)) {
        if (files.length > 0) {
          groupAttachmentsBase64[groupName] = await Promise.all(
            files.map(async (file) => ({
              filename: file.name,
              contentType: file.type,
              content: await fileToBase64(file),
            }))
          );
        }
      }

      const payload: Record<string, unknown> = { groups };
      if (selectedItemIds && selectedItemIds.size > 0) {
        payload.item_ids = Array.from(selectedItemIds);
      }
      if (deadline) {
        payload.deadline = deadline;
      }
      if (Object.keys(groupAttachmentsBase64).length > 0) {
        payload.group_attachments = groupAttachmentsBase64;
      }
      if (Object.keys(editedBodies).length > 0) {
        payload.custom_bodies = editedBodies;
      }
      if (Object.keys(editedSubjects).length > 0) {
        payload.custom_subjects = editedSubjects;
      }

      const res = await fetch(`/api/submissions/${submissionId}/send-price-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        setSendResult({
          sent: data.sent || data.sent_count || 0,
          saved: data.saved || data.saved_count || 0,
          errors: data.errors?.length || 0,
        });
        onComplete?.();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erreur lors de l'envoi");
      }
    } catch {
      setError("Erreur reseau");
    } finally {
      setSending(false);
    }
  }

  // ── Render: Success state ──

  if (sendResult) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
        <h3 className="text-xl font-semibold text-[#FAFAFA] mb-2">Demandes envoyees !</h3>
        <p className="text-sm text-[#71717A] mb-1">
          {sendResult.sent} email{sendResult.sent > 1 ? "s" : ""} envoye{sendResult.sent > 1 ? "s" : ""}
          {sendResult.saved > 0 && `, ${sendResult.saved} sauvegarde${sendResult.saved > 1 ? "s" : ""}`}
        </p>
        {sendResult.errors > 0 && (
          <p className="text-sm text-amber-400">
            {sendResult.errors} erreur{sendResult.errors > 1 ? "s" : ""}
          </p>
        )}
      </div>
    );
  }

  // Attachments for the currently previewed group
  const previewGroupAttachments = previewGroupName ? (groupAttachments[previewGroupName] || []) : [];

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[#FAFAFA]">Recapitulatif et envoi</h3>
        <p className="text-sm text-[#71717A]">Verifiez les demandes avant envoi</p>
      </div>

      {/* Summary banner */}
      <div className="mb-6 rounded-lg bg-[#F97316]/5 border border-[#F97316]/20 p-4 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-[#F97316]" />
          <span className="text-sm font-semibold text-[#FAFAFA]">{totalEmails} email{totalEmails > 1 ? "s" : ""}</span>
        </div>
        <span className="text-sm text-[#71717A]">{totalGroups} groupe{totalGroups > 1 ? "s" : ""}</span>
        <span className="text-sm text-[#71717A]">{totalItems} postes</span>
        {totalAttachments > 0 && (
          <span className="text-sm text-[#71717A]">
            <Paperclip className="inline h-3.5 w-3.5 mr-0.5" />
            {totalAttachments} fichier{totalAttachments > 1 ? "s" : ""} joint{totalAttachments > 1 ? "s" : ""}
          </span>
        )}
        {deadline && (
          <span className="text-sm text-[#71717A] ml-auto">
            Deadline : <span className="text-[#FAFAFA] font-medium">{new Date(deadline).toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric" })}</span>
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Group cards */}
      <div className="space-y-4 mb-6">
        {activeGroups.map(({ groupName, suppliers: groupSuppliers, itemsCount }) => {
          const files = groupAttachments[groupName] || [];

          return (
            <div key={groupName} className="rounded-lg border border-[#27272A] overflow-hidden">
              {/* Group header */}
              <div className="px-4 py-3 bg-[#27272A]/50 border-b border-[#27272A] flex items-center gap-3">
                <Package className="h-4 w-4 text-[#F97316]" />
                <span className="text-sm font-semibold text-[#FAFAFA]">{groupName}</span>
                <span className="text-xs text-[#71717A]">{itemsCount} poste{itemsCount > 1 ? "s" : ""}</span>
                <div className="flex items-center gap-1 ml-auto">
                  <Users className="h-3.5 w-3.5 text-[#71717A]" />
                  <span className="text-xs text-[#71717A]">{groupSuppliers.length} fournisseur{groupSuppliers.length > 1 ? "s" : ""}</span>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {/* Suppliers list with preview buttons */}
                <div className="space-y-2">
                  {groupSuppliers.map((supplier) => (
                    <div key={supplier.id} className="flex items-center justify-between rounded-md bg-[#1C1C1F] px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#FAFAFA] truncate">{supplier.company_name}</p>
                        <p className="text-xs text-[#71717A] truncate">{supplier.email}</p>
                      </div>
                      <button
                        onClick={() => handlePreview(supplier.id, groupName)}
                        className="shrink-0 ml-3 inline-flex items-center gap-1 rounded-md border border-[#27272A] px-2.5 py-1 text-xs font-medium text-[#FAFAFA] hover:bg-[#27272A]"
                      >
                        <Search className="h-3 w-3" />
                        Previsualiser
                      </button>
                    </div>
                  ))}
                </div>

                {/* Per-group attachments */}
                <div className="rounded-md border border-[#27272A] bg-[#18181B] p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-[#71717A]">
                      Pieces jointes pour ce groupe
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => triggerFileUpload(groupName)}
                        className="inline-flex items-center gap-1 rounded border border-[#27272A] px-2 py-1 text-[11px] font-medium text-[#A1A1AA] hover:bg-[#1C1C1F] hover:text-[#FAFAFA]"
                      >
                        <Paperclip className="h-3 w-3" />
                        Fichier
                      </button>
                      {hasScreenCapture && (
                        <button
                          type="button"
                          onClick={() => handleScreenCapture(groupName)}
                          disabled={isCapturing}
                          className="inline-flex items-center gap-1 rounded border border-[#27272A] px-2 py-1 text-[11px] font-medium text-[#A1A1AA] hover:bg-[#1C1C1F] hover:text-[#FAFAFA] disabled:opacity-50"
                        >
                          <Camera className="h-3 w-3" />
                          Capture
                        </button>
                      )}
                    </div>
                  </div>
                  {files.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {files.map((file, i) => (
                        <div key={i} className="inline-flex items-center gap-1 rounded bg-[#27272A] px-2 py-1 text-xs text-[#FAFAFA]">
                          <Paperclip className="h-2.5 w-2.5 text-[#71717A]" />
                          <span className="max-w-[160px] truncate">{file.name}</span>
                          <span className="text-[#52525B]">({formatFileSize(file.size)})</span>
                          <button type="button" onClick={() => removeAttachment(groupName, i)} className="ml-0.5 text-[#52525B] hover:text-red-400">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-[#52525B]">
                      Aucune piece jointe. {groupSuppliers.length > 1
                        ? `Les fichiers seront envoyes aux ${groupSuppliers.length} fournisseurs de ce groupe.`
                        : "Ajoutez des fiches techniques ou plans."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Preview modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPreviewOpen(null)}>
          <div className="w-full max-w-2xl rounded-lg bg-[#18181B] shadow-xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {loadingPreview ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[#71717A]" />
              </div>
            ) : previewData ? (
              <div className="p-6">
                <div className="mb-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[#71717A] w-14 shrink-0">A :</span>
                    <span className="text-[#FAFAFA]">{previewData.to}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[#71717A] w-14 shrink-0">Sujet :</span>
                    <input
                      type="text"
                      value={editedSubjects[previewOpen!] ?? previewData.subject}
                      onChange={(e) => setEditedSubjects(prev => ({ ...prev, [previewOpen!]: e.target.value }))}
                      className="flex-1 text-sm font-medium text-[#FAFAFA] bg-[#0F0F11] rounded-md px-2.5 py-1 border border-[#27272A] focus:border-[#F97316] focus:outline-none"
                    />
                  </div>
                </div>

                <label className="block text-xs font-medium text-[#71717A] mb-1">Corps du message (modifiable)</label>
                <textarea
                  value={editedBodies[previewOpen] ?? previewData.body_text}
                  onChange={(e) => setEditedBodies(prev => ({ ...prev, [previewOpen!]: e.target.value }))}
                  className="w-full min-h-[300px] text-xs text-[#FAFAFA] bg-[#0F0F11] rounded-lg p-4 font-mono resize-y border border-[#27272A] focus:border-[#F97316] focus:outline-none"
                />

                {previewGroupAttachments.length > 0 && (
                  <div className="mt-3">
                    <span className="text-xs text-[#71717A]">Pieces jointes du groupe ({previewGroupAttachments.length}) :</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {previewGroupAttachments.map((file, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded bg-[#27272A] px-2 py-0.5 text-xs text-[#A1A1AA]">
                          <Paperclip className="h-2.5 w-2.5" />
                          {file.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex justify-between items-center">
                  {(editedBodies[previewOpen!] !== undefined || editedSubjects[previewOpen!] !== undefined) && (
                    <span className="text-xs text-[#F97316]">
                      {editedSubjects[previewOpen!] !== undefined && editedBodies[previewOpen!] !== undefined
                        ? "Sujet et texte modifies"
                        : editedSubjects[previewOpen!] !== undefined
                        ? "Sujet modifie"
                        : "Texte modifie"} — sera utilise pour ce fournisseur
                    </span>
                  )}
                  <div className="ml-auto flex gap-2">
                    {(editedBodies[previewOpen!] !== undefined || editedSubjects[previewOpen!] !== undefined) && (
                      <button
                        onClick={() => {
                          setEditedBodies(prev => { const next = { ...prev }; delete next[previewOpen!]; return next; });
                          setEditedSubjects(prev => { const next = { ...prev }; delete next[previewOpen!]; return next; });
                        }}
                        className="rounded-md border border-[#27272A] px-3 py-2 text-xs font-medium text-[#71717A] hover:bg-[#1C1C1F]"
                      >
                        Reinitialiser
                      </button>
                    )}
                    <button
                      onClick={() => setPreviewOpen(null)}
                      className="rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#EA580C]"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[#71717A] text-center py-8">Erreur de chargement</p>
            )}
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-lg border border-[#27272A] px-5 py-2.5 text-sm font-medium text-[#FAFAFA] hover:bg-[#1C1C1F]">
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>
        <button
          onClick={handleSendAll}
          disabled={sending || totalEmails === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-[#F97316] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#EA580C] disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Envoyer {totalEmails} demande{totalEmails > 1 ? "s" : ""}
        </button>
      </div>

      {/* Hidden file input (shared, routed by activeGroupRef) */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
        className="hidden"
        onChange={handleFileAdd}
      />
    </div>
  );
}
