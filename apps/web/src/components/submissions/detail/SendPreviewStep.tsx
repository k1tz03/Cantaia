"use client";

import { useState } from "react";
import { ArrowLeft, Send, Eye, Loader2, CheckCircle2, AlertCircle, Mail } from "lucide-react";
import type { SubmissionLot, Supplier } from "./shared";
import type { SupplierAssignment } from "./PriceRequestWizard";

interface SendPreviewStepProps {
  submissionId: string;
  lots: SubmissionLot[];
  suppliers: Supplier[];
  assignments: SupplierAssignment;
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

export function SendPreviewStep({ submissionId, lots, suppliers, assignments, onBack, onComplete }: SendPreviewStepProps) {
  const [previewOpen, setPreviewOpen] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; saved: number; errors: number } | null>(null);
  const [error, setError] = useState("");

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

  async function handlePreview(supplierId: string, groupName: string) {
    setLoadingPreview(true);
    setPreviewOpen(supplierId);
    try {
      const params = new URLSearchParams({ group: groupName, supplier_id: supplierId });
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
        .filter(([_, ids]) => ids.length > 0)
        .map(([groupName, supplierIds]) => ({
          material_group: groupName,
          supplier_ids: supplierIds,
        }));

      const res = await fetch(`/api/submissions/${submissionId}/send-price-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups }),
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
        <h3 className="text-xl font-semibold text-foreground mb-2">Demandes envoyees !</h3>
        <p className="text-sm text-muted-foreground mb-1">
          {sendResult.sent} email{sendResult.sent > 1 ? "s" : ""} envoye{sendResult.sent > 1 ? "s" : ""}
          {sendResult.saved > 0 && `, ${sendResult.saved} sauvegarde${sendResult.saved > 1 ? "s" : ""}`}
        </p>
        {sendResult.errors > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {sendResult.errors} erreur{sendResult.errors > 1 ? "s" : ""}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Recapitulatif et envoi</h3>
        <p className="text-sm text-muted-foreground">Verifiez les demandes avant envoi</p>
      </div>

      {/* Summary banner */}
      <div className="mb-6 rounded-lg bg-primary/5 border border-primary/20 p-4 flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold text-foreground">{totalEmails} email{totalEmails > 1 ? "s" : ""}</span>
        </div>
        <span className="text-sm text-muted-foreground">a {totalEmails} fournisseur{totalEmails > 1 ? "s" : ""}</span>
        <span className="text-sm text-muted-foreground">pour {totalGroups} groupe{totalGroups > 1 ? "s" : ""}</span>
        <span className="text-sm text-muted-foreground">({totalItems} postes)</span>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden mb-6">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Fournisseur</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Groupes</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Postes</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(supplierGroups).map(({ supplier, groups, totalItems: items }) => (
              <tr key={supplier.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-foreground">{supplier.company_name}</p>
                  <p className="text-xs text-muted-foreground">{supplier.email}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {groups.map((g) => (
                      <span key={g} className="inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{g}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{items}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handlePreview(supplier.id, groups[0])}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <Eye className="h-3 w-3" />
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
          <div className="w-full max-w-2xl rounded-lg bg-background shadow-xl max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            {loadingPreview ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : previewData ? (
              <>
                <h4 className="text-sm font-semibold text-foreground mb-1">A : {previewData.to}</h4>
                <h4 className="text-sm font-semibold text-foreground mb-3">Sujet : {previewData.subject}</h4>
                <pre className="whitespace-pre-wrap text-xs text-foreground bg-muted rounded-lg p-4 font-mono">
                  {previewData.body_text}
                </pre>
                <div className="mt-4 flex justify-end">
                  <button onClick={() => setPreviewOpen(null)} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                    Fermer
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Erreur de chargement</p>
            )}
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>
        <button
          onClick={handleSendAll}
          disabled={sending || totalEmails === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Envoyer {totalEmails} demande{totalEmails > 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}
