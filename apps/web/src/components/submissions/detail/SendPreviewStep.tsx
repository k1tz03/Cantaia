"use client";

import { useState, useRef } from "react";
import { ArrowLeft, Send, Loader2, CheckCircle2, AlertCircle, Mail, Search, Paperclip, Camera, X } from "lucide-react";
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
  const [previewOpen, setPreviewOpen] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; saved: number; errors: number } | null>(null);
  const [error, setError] = useState("");
  const [editedBodies, setEditedBodies] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasScreenCapture = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

  // Build summary: supplier -> groups
  const supplierGroups: Record<string, { supplier: Supplier; groups: string[]; totalItems: number }> = {};
  for (const [groupName, supplierIds] of Object.entries(assignments)) {
    const lot = lots.find((l) => l.name === groupName);
    for (const sId of supplierIds) {
      if (!supplierGroups[sId]) {
        const s = suppliers.find((sup) => sup.id === sId);
        if (!s) continue;
        supplierGroups[sId] = { supplier: s, groups: [], totalItems: 0 };
      }
      supplierGroups[sId].groups.push(groupName);
      supplierGroups[sId].totalItems += (lot as any)?.items_count || 0;
    }
  }

  const totalEmails = Object.keys(supplierGroups).length;
  const totalGroups = Object.keys(assignments).filter((g) => assignments[g].length > 0).length;
  const totalItems = Object.values(supplierGroups).reduce((sum, sg) => sum + sg.totalItems, 0);

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

  function handleFileAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const valid = files.filter(f => f.size <= 10 * 1024 * 1024);
    setAttachments(prev => [...prev, ...valid]);
    e.target.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }

  async function handleScreenCapture() {
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
      setAttachments(prev => [...prev, file]);
    } catch {
      // User cancelled or API not supported
    } finally {
      setIsCapturing(false);
    }
  }

  async function handlePreview(supplierId: string, groupName: string) {
    setLoadingPreview(true);
    setPreviewOpen(supplierId);
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

      // Convert file attachments to base64
      const base64Attachments = await Promise.all(
        attachments.map(async (file) => ({
          filename: file.name,
          contentType: file.type,
          content: await fileToBase64(file),
        }))
      );

      const payload: Record<string, unknown> = { groups };
      if (selectedItemIds && selectedItemIds.size > 0) {
        payload.item_ids = Array.from(selectedItemIds);
      }
      if (deadline) {
        payload.deadline = deadline;
      }
      if (base64Attachments.length > 0) {
        payload.attachments = base64Attachments;
      }
      if (Object.keys(editedBodies).length > 0) {
        payload.custom_bodies = editedBodies;
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
      setError("Erreur réseau");
    } finally {
      setSending(false);
    }
  }

  // Success state
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
          <p className="text-sm text-amber-600 text-amber-400">
            {sendResult.errors} erreur{sendResult.errors > 1 ? "s" : ""}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[#FAFAFA]">Recapitulatif et envoi</h3>
        <p className="text-sm text-[#71717A]">Verifiez les demandes avant envoi</p>
      </div>

      {/* Summary banner */}
      <div className="mb-6 rounded-lg bg-[#F97316]/5 border border-[#F97316]/20 p-4 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-[#F97316]" />
          <span className="text-sm font-semibold text-[#FAFAFA]">{totalEmails} email{totalEmails > 1 ? "s" : ""}</span>
        </div>
        <span className="text-sm text-[#71717A]">a {totalEmails} fournisseur{totalEmails > 1 ? "s" : ""}</span>
        <span className="text-sm text-[#71717A]">pour {totalGroups} groupe{totalGroups > 1 ? "s" : ""}</span>
        <span className="text-sm text-[#71717A]">({totalItems} postes)</span>
        {deadline && (
          <span className="text-sm text-[#71717A] ml-auto">
            Deadline : <span className="text-[#FAFAFA] font-medium">{new Date(deadline).toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric" })}</span>
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Attachments section */}
      <div className="mb-6 rounded-lg border border-[#27272A] p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-[#A1A1AA]">Pièces jointes (envoyées avec chaque demande)</h4>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#27272A] px-2.5 py-1.5 text-xs font-medium text-[#FAFAFA] hover:bg-[#1C1C1F]"
            >
              <Paperclip className="h-3.5 w-3.5" />
              Ajouter un fichier
            </button>
            {hasScreenCapture && (
              <button
                type="button"
                onClick={handleScreenCapture}
                disabled={isCapturing}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#27272A] px-2.5 py-1.5 text-xs font-medium text-[#FAFAFA] hover:bg-[#1C1C1F] disabled:opacity-50"
              >
                <Camera className="h-3.5 w-3.5" />
                {isCapturing ? "Capture..." : "Capture d'écran"}
              </button>
            )}
          </div>
        </div>
        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {attachments.map((file, i) => (
              <div key={i} className="inline-flex items-center gap-1.5 rounded-md bg-[#27272A] px-2.5 py-1.5 text-xs text-[#FAFAFA]">
                <Paperclip className="h-3 w-3 text-[#71717A]" />
                <span className="max-w-[200px] truncate">{file.name}</span>
                <span className="text-[#71717A]">({formatFileSize(file.size)})</span>
                <button type="button" onClick={() => removeAttachment(i)} className="ml-1 text-[#71717A] hover:text-red-400">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[#52525B]">Aucune pièce jointe. Ajoutez des fiches techniques, plans ou documents.</p>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-[#27272A] overflow-hidden mb-6">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#27272A] bg-[#27272A]/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-[#71717A] uppercase">Fournisseur</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#71717A] uppercase">Groupes</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#71717A] uppercase">Postes</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-[#71717A] uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(supplierGroups).map(({ supplier, groups, totalItems: items }) => (
              <tr key={supplier.id} className="border-b border-[#27272A] last:border-0">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-[#FAFAFA]">{supplier.company_name}</p>
                  <p className="text-xs text-[#71717A]">{supplier.email}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {groups.map((g) => (
                      <span key={g} className="inline-block rounded-full bg-[#27272A] px-2 py-0.5 text-xs text-[#FAFAFA]">{g}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-[#71717A]">{items}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handlePreview(supplier.id, groups[0])}
                    className="inline-flex items-center gap-1 rounded-md border border-[#27272A] px-2.5 py-1 text-xs font-medium text-[#FAFAFA] hover:bg-[#1C1C1F]"
                  >
                    <Search className="h-3 w-3" />
                    Previsualiser
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
                    <span className="text-[#71717A] w-14 shrink-0">À :</span>
                    <span className="text-[#FAFAFA]">{previewData.to}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[#71717A] w-14 shrink-0">Sujet :</span>
                    <span className="text-[#FAFAFA] font-medium">{previewData.subject}</span>
                  </div>
                </div>

                <label className="block text-xs font-medium text-[#71717A] mb-1">Corps du message (modifiable)</label>
                <textarea
                  value={editedBodies[previewOpen] ?? previewData.body_text}
                  onChange={(e) => setEditedBodies(prev => ({ ...prev, [previewOpen!]: e.target.value }))}
                  className="w-full min-h-[300px] text-xs text-[#FAFAFA] bg-[#0F0F11] rounded-lg p-4 font-mono resize-y border border-[#27272A] focus:border-[#F97316] focus:outline-none"
                />

                {attachments.length > 0 && (
                  <div className="mt-3">
                    <span className="text-xs text-[#71717A]">Pièces jointes ({attachments.length}) :</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {attachments.map((file, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded bg-[#27272A] px-2 py-0.5 text-xs text-[#A1A1AA]">
                          <Paperclip className="h-2.5 w-2.5" />
                          {file.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex justify-between items-center">
                  {editedBodies[previewOpen] !== undefined && (
                    <span className="text-xs text-[#F97316]">Texte modifié — sera utilisé pour ce fournisseur</span>
                  )}
                  <div className="ml-auto flex gap-2">
                    {editedBodies[previewOpen] !== undefined && (
                      <button
                        onClick={() => setEditedBodies(prev => { const next = { ...prev }; delete next[previewOpen!]; return next; })}
                        className="rounded-md border border-[#27272A] px-3 py-2 text-xs font-medium text-[#71717A] hover:bg-[#1C1C1F]"
                      >
                        Réinitialiser
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
          className="inline-flex items-center gap-2 rounded-lg bg-[#F97316] px-5 py-2.5 text-sm font-medium text-[#F97316]-foreground hover:bg-[#EA580C] disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Envoyer {totalEmails} demande{totalEmails > 1 ? "s" : ""}
        </button>
      </div>

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
