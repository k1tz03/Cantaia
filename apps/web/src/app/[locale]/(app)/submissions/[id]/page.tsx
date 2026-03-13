"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  FileSpreadsheet,
  Send,
  BarChart3,
  ClipboardList,
  Loader2,
  AlertCircle,
  RefreshCw,
  Eye,
  Plus,
  Clock,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  X,
  Calculator,
  CheckSquare,
  ListFilter,
} from "lucide-react";

// ── Local types matching API response ────────────────────────
interface SubmissionData {
  id: string;
  project_id: string;
  organization_id: string;
  file_name: string | null;
  file_type: string | null;
  file_url: string | null;
  analysis_status: string;
  analysis_error: string | null;
  created_at: string;
  updated_at: string;
  projects?: {
    id: string;
    name: string;
    code: string | null;
    color: string | null;
    client_name: string | null;
    city: string | null;
    address: string | null;
  };
}

interface SubmissionItem {
  id: string;
  submission_id: string;
  item_number: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  cfc_code: string | null;
  material_group: string;
  product_name: string | null;
  status: string;
}

interface BudgetEstimate {
  item_id: string;
  item_number: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  material_group: string;
  prix_min: number;
  prix_median: number;
  prix_max: number;
  confidence: number;
  source: string;
}

interface BudgetResult {
  estimates: BudgetEstimate[];
  total_min: number;
  total_median: number;
  total_max: number;
  crb_count: number;
  ai_count: number;
  unestimated_count: number;
}

interface PriceRequestData {
  id: string;
  submission_id: string;
  supplier_id: string | null;
  tracking_code: string;
  material_group: string;
  items_requested: any[];
  sent_at: string | null;
  status: string;
  deadline: string | null;
  relance_count: number;
  last_relance_at: string | null;
  suppliers?: {
    id: string;
    company_name: string;
    contact_name: string | null;
    email: string | null;
  };
}

interface QuoteData {
  id: string;
  request_id: string;
  submission_id: string;
  item_id: string;
  unit_price_ht: number | null;
  total_ht: number | null;
  currency: string;
  confidence: number | null;
  extracted_at: string;
}

type Tab = "items" | "requests" | "comparison" | "budget" | "summary";

export default function SubmissionDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [activeTab, setActiveTab] = useState<Tab>("items");
  const [loading, setLoading] = useState(true);
  const [submission, setSubmission] = useState<SubmissionData | null>(null);
  const [items, setItems] = useState<SubmissionItem[]>([]);
  const [priceRequests, setPriceRequests] = useState<PriceRequestData[]>([]);
  const [quotes, setQuotes] = useState<QuoteData[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/submissions/${id}`);
      const json = await res.json();
      if (!json.success) return;
      setSubmission(json.submission);
      setItems(json.items || []);
      setPriceRequests(json.priceRequests || []);
      setQuotes(json.quotes || []);

      // Auto-expand all groups
      const groups = new Set<string>((json.items || []).map((i: SubmissionItem) => i.material_group));
      setExpandedGroups(groups);
    } catch (err) {
      console.error("[submission detail] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll during analysis — with 5min client-side timeout matching server maxDuration
  useEffect(() => {
    if (!submission || (submission.analysis_status !== "analyzing" && submission.analysis_status !== "pending")) return;
    setAnalyzing(true);
    const startTime = Date.now();
    const interval = setInterval(async () => {
      // Client-side 300s timeout (matches server maxDuration=300)
      if (Date.now() - startTime > 300_000) {
        // Check server one last time before declaring timeout
        try {
          const res = await fetch(`/api/submissions/${id}`);
          const json = await res.json();
          if (json.success && json.submission.analysis_status === "done") {
            setSubmission(json.submission);
            setItems(json.items || []);
            setPriceRequests(json.priceRequests || []);
            setQuotes(json.quotes || []);
            const groups = new Set<string>((json.items || []).map((i: SubmissionItem) => i.material_group));
            setExpandedGroups(groups);
            setAnalyzing(false);
            clearInterval(interval);
            return;
          }
        } catch {}
        setAnalyzing(false);
        setSubmission((prev) =>
          prev ? { ...prev, analysis_status: "error", analysis_error: "L'analyse a pris trop de temps. Cliquez sur « Ré-analyser » pour réessayer." } : prev
        );
        clearInterval(interval);
        return;
      }
      try {
        const res = await fetch(`/api/submissions/${id}`);
        const json = await res.json();
        if (!json.success) return;
        setSubmission(json.submission);
        if (json.submission.analysis_status === "done" || json.submission.analysis_status === "error") {
          setItems(json.items || []);
          setPriceRequests(json.priceRequests || []);
          setQuotes(json.quotes || []);
          const groups = new Set<string>((json.items || []).map((i: SubmissionItem) => i.material_group));
          setExpandedGroups(groups);
          setAnalyzing(false);
          clearInterval(interval);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [submission?.analysis_status, id]);

  const handleReanalyze = () => {
    if (!submission) return;
    setAnalyzing(true);
    setSubmission({ ...submission, analysis_status: "analyzing", analysis_error: null });
    // Fire-and-forget: backend returns 202 immediately, polling handles status
    fetch(`/api/submissions/${id}/analyze`, { method: "POST" }).catch(() => {});
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 text-brand animate-spin" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="p-6 text-center">
        <h2 className="text-lg font-medium text-gray-900">Soumission introuvable</h2>
        <Link href="/submissions" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
          Retour aux soumissions
        </Link>
      </div>
    );
  }

  const materialGroups = [...new Set(items.map((i) => i.material_group))].sort();

  const tabs: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: "items", label: "Postes", icon: FileSpreadsheet, count: items.length },
    { key: "requests", label: "Demandes de prix", icon: Send, count: priceRequests.length },
    { key: "comparison", label: "Analyse comparative", icon: BarChart3, count: quotes.length },
    { key: "budget", label: "Budget IA", icon: Calculator },
    { key: "summary", label: "Récapitulatif", icon: ClipboardList },
  ];

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/submissions" className="p-1 hover:bg-gray-100 rounded">
            <ArrowLeft className="h-4 w-4 text-gray-500" />
          </Link>
          {submission.projects && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: submission.projects.color || "#94a3b8" }} />
              <span className="text-sm text-gray-500">{submission.projects.name}</span>
            </div>
          )}
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {submission.file_name || "Soumission"}
            </h1>
            <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
              <AnalysisStatusBadge status={submission.analysis_status} />
              {items.length > 0 && (
                <span>{items.length} postes · {materialGroups.length} groupes</span>
              )}
              <span>{new Date(submission.created_at).toLocaleDateString("fr-CH")}</span>
            </div>
          </div>
          {(submission.analysis_status === "done" || submission.analysis_status === "error") && (
            <button
              onClick={handleReanalyze}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 flex items-center gap-1.5"
            >
              <RefreshCw className="h-3 w-3" />
              Ré-analyser
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 -mb-4 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? "text-brand border-brand bg-white"
                    : "text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full ml-1">
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Analysis in progress */}
      {analyzing && (
        <div className="mx-6 mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
          <Loader2 className="h-5 w-5 text-blue-600 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-900">Analyse IA en cours...</p>
            <p className="text-xs text-blue-600">Extraction des postes du descriptif</p>
          </div>
        </div>
      )}

      {/* Analysis error */}
      {submission.analysis_status === "error" && submission.analysis_error && (
        <div className="mx-6 mt-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-900">Erreur d'analyse</p>
            <p className="text-xs text-red-600">{submission.analysis_error}</p>
          </div>
        </div>
      )}

      {/* Tab content */}
      <div className="p-6">
        {activeTab === "items" && (
          <ItemsTabContent
            items={items}
            materialGroups={materialGroups}
            expandedGroups={expandedGroups}
            setExpandedGroups={setExpandedGroups}
            quotes={quotes}
          />
        )}
        {activeTab === "requests" && (
          <RequestsTabContent
            submissionId={id}
            materialGroups={materialGroups}
            items={items}
            priceRequests={priceRequests}
            onRefresh={fetchData}
          />
        )}
        {activeTab === "comparison" && (
          <ComparisonTabContent
            items={items}
            materialGroups={materialGroups}
            priceRequests={priceRequests}
            quotes={quotes}
          />
        )}
        {activeTab === "budget" && (
          <BudgetTabContent
            submissionId={id}
            items={items}
            budgetEstimate={(submission as any).budget_estimate}
          />
        )}
        {activeTab === "summary" && (
          <SummaryTabContent
            submission={submission}
            items={items}
            materialGroups={materialGroups}
            priceRequests={priceRequests}
          />
        )}
      </div>
    </div>
  );
}

// ── Analysis status badge ────────────────────────────────────
function AnalysisStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: "En attente", className: "bg-gray-100 text-gray-600" },
    analyzing: { label: "Analyse en cours...", className: "bg-purple-100 text-purple-700" },
    done: { label: "Analysé", className: "bg-green-100 text-green-700" },
    error: { label: "Erreur", className: "bg-red-100 text-red-700" },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${c.className}`}>
      {c.label}
    </span>
  );
}

// ── Tab 1: Items grouped by material_group ───────────────────
function ItemsTabContent({
  items,
  materialGroups,
  expandedGroups,
  setExpandedGroups,
  quotes,
}: {
  items: SubmissionItem[];
  materialGroups: string[];
  expandedGroups: Set<string>;
  setExpandedGroups: React.Dispatch<React.SetStateAction<Set<string>>>;
  quotes: QuoteData[];
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <FileSpreadsheet className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">Aucun poste extrait</p>
        <p className="text-xs text-gray-400 mt-1">Lancez l'analyse IA pour extraire les postes du descriptif</p>
      </div>
    );
  }

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {materialGroups.map((group) => {
        const groupItems = items.filter((i) => i.material_group === group);
        const expanded = expandedGroups.has(group);
        const quotedCount = groupItems.filter((i) => i.status === "quoted").length;

        return (
          <div key={group} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleGroup(group)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <svg className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                <span className="text-sm font-medium text-gray-900">{group}</span>
                <span className="text-xs text-gray-400">{groupItems.length} postes</span>
              </div>
              {quotedCount > 0 && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  {quotedCount}/{groupItems.length} cotés
                </span>
              )}
            </button>
            {expanded && (
              <div className="border-t border-gray-200 overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="bg-gray-50 text-[11px] font-medium text-gray-500 uppercase">
                      <th className="text-left px-4 py-2 w-20">N°</th>
                      <th className="text-left px-4 py-2">Description</th>
                      <th className="text-center px-4 py-2 w-16">Unité</th>
                      <th className="text-right px-4 py-2 w-20">Quantité</th>
                      <th className="text-center px-4 py-2 w-20">CFC</th>
                      <th className="text-center px-4 py-2 w-20">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {groupItems.map((item) => {
                      const itemQuotes = quotes.filter((q) => q.item_id === item.id);
                      const bestPrice = itemQuotes.length > 0
                        ? Math.min(...itemQuotes.filter((q) => q.unit_price_ht != null).map((q) => q.unit_price_ht!))
                        : null;
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 text-sm">
                          <td className="px-4 py-2 text-xs font-mono text-gray-500">{item.item_number || "—"}</td>
                          <td className="px-4 py-2 text-gray-900">
                            <div>{item.description}</div>
                            {item.product_name && (
                              <span className="inline-block mt-0.5 text-[11px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                                {item.product_name}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center text-xs text-gray-500">{item.unit || "—"}</td>
                          <td className="px-4 py-2 text-right text-gray-600">
                            {item.quantity != null ? Number(item.quantity).toLocaleString("fr-CH") : "—"}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {item.cfc_code && (
                              <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                {item.cfc_code}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {item.status === "quoted" ? (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                                {bestPrice != null ? `${bestPrice.toFixed(2)} CHF` : "Coté"}
                              </span>
                            ) : (
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                                En attente
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Tab 2: Price requests per material group ─────────────────
function RequestsTabContent({
  submissionId,
  materialGroups,
  items,
  priceRequests,
  onRefresh,
}: {
  submissionId: string;
  materialGroups: string[];
  items: SubmissionItem[];
  priceRequests: PriceRequestData[];
  onRefresh: () => void;
}) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<Record<string, string[]>>({});
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split("T")[0];
  });
  const [relancing, setRelancing] = useState<string | null>(null);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ company_name: "", email: "", contact_name: "", phone: "" });
  const [saveToDb, setSaveToDb] = useState(true);
  const [addingSupplier, setAddingSupplier] = useState(false);
  const [previewData, setPreviewData] = useState<{ subject: string; body: string; to: string; supplier_name: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSupplier, setPreviewSupplier] = useState<string>("");
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [showRelanceModal, setShowRelanceModal] = useState(false);
  const [relanceRequest, setRelanceRequest] = useState<PriceRequestData | null>(null);
  const [relanceSubject, setRelanceSubject] = useState("");
  const [relanceBody, setRelanceBody] = useState("");
  // Cross-category selection mode
  const [selectionMode, setSelectionMode] = useState<"group" | "free">("group");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [freeSupplierIds, setFreeSupplierIds] = useState<string[]>([]);

  // Load org suppliers
  useEffect(() => {
    fetch("/api/suppliers")
      .then((r) => r.json())
      .then((json) => {
        if (json.suppliers) setSuppliers(json.suppliers);
        else if (Array.isArray(json)) setSuppliers(json);
      })
      .catch(() => {});
  }, []);

  function toggleSupplier(group: string, supplierId: string) {
    setSelectedSuppliers((prev) => {
      const current = prev[group] || [];
      const next = current.includes(supplierId)
        ? current.filter((id) => id !== supplierId)
        : [...current, supplierId];
      return { ...prev, [group]: next };
    });
  }

  const hasSelection = selectionMode === "free"
    ? selectedItemIds.size > 0 && freeSupplierIds.length > 0
    : Object.values(selectedSuppliers).some((ids) => ids.length > 0);

  async function handleSend() {
    setSending(true);
    setSendResult(null);
    try {
      const groups = selectionMode === "free"
        ? [{
            material_group: "Sélection personnalisée",
            supplier_ids: freeSupplierIds,
            item_ids: [...selectedItemIds],
          }]
        : Object.entries(selectedSuppliers)
          .filter(([, ids]) => ids.length > 0)
          .map(([group, ids]) => ({
            material_group: group,
            supplier_ids: ids,
          }));

      // Collect manual supplier info for temp IDs
      const manualSuppliers = suppliers
        .filter((s: any) => s._manual && s.id.startsWith("temp-"))
        .map((s: any) => ({
          id: s.id,
          company_name: s.company_name,
          email: s.email,
          contact_name: s.contact_name || undefined,
        }));

      const payload: Record<string, unknown> = { groups, deadline };
      if (editSubject) payload.custom_subject = editSubject;
      if (editBody) payload.custom_body = editBody;
      if (manualSuppliers.length > 0) payload.manual_suppliers = manualSuppliers;

      const res = await fetch(`/api/submissions/${submissionId}/send-price-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      setSendResult(json);
      if (json.success) {
        setSelectedSuppliers({});
        setShowSendModal(false);
        setPreviewData(null);
        setEditSubject("");
        setEditBody("");
        onRefresh();
      }
    } catch (err: any) {
      setSendResult({ error: err.message });
    } finally {
      setSending(false);
    }
  }

  function openRelanceModal(pr: PriceRequestData) {
    setRelanceRequest(pr);
    const contactFirstName = pr.suppliers?.contact_name?.split(/\s+/)[0] || null;
    const greeting = contactFirstName ? `Bonjour ${contactFirstName}` : "Bonjour";
    const deadlineStr = pr.deadline
      ? new Date(pr.deadline).toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric" })
      : null;

    setRelanceSubject(`Relance — Demande de prix — ${pr.material_group}`);
    setRelanceBody(
      [
        `${greeting},`,
        `Nous nous permettons de revenir vers vous concernant notre demande de prix pour le groupe ${pr.material_group}.`,
        ...(deadlineStr ? [`Pour rappel, le délai de réponse souhaité était fixé au ${deadlineStr}.`] : []),
        `Nous vous serions reconnaissants de bien vouloir nous faire parvenir votre offre dans les meilleurs délais.`,
        `Cordialement`,
      ].join("\n\n")
    );
    setShowRelanceModal(true);
  }

  async function handleRelanceSend() {
    if (!relanceRequest) return;
    setRelancing(relanceRequest.id);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/relance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: relanceRequest.id,
          custom_subject: relanceSubject,
          custom_body: relanceBody,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowRelanceModal(false);
        setRelanceRequest(null);
        onRefresh();
      }
    } catch {}
    setRelancing(null);
  }

  async function handleAddSupplier() {
    if (!newSupplier.company_name || !newSupplier.email) return;
    setAddingSupplier(true);
    try {
      if (saveToDb) {
        const res = await fetch("/api/suppliers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newSupplier),
        });
        const json = await res.json();
        if (json.id || json.supplier) {
          // Refetch full supplier list to get the new supplier with all fields
          try {
            const listRes = await fetch("/api/suppliers");
            const listJson = await listRes.json();
            if (listJson.suppliers) setSuppliers(listJson.suppliers);
            else if (Array.isArray(listJson)) setSuppliers(listJson);
          } catch {
            // Fallback: add locally
            const created = json.supplier || json;
            setSuppliers((prev) => [...prev, { id: created.id, ...newSupplier }]);
          }
        }
      } else {
        // Add locally only (temporary supplier) — stays visible with "Manuel" badge
        const tempId = `temp-${Date.now()}`;
        setSuppliers((prev) => [...prev, { id: tempId, ...newSupplier, _manual: true }]);
      }
      setNewSupplier({ company_name: "", email: "", contact_name: "", phone: "" });
      setShowAddSupplier(false);
    } catch {}
    setAddingSupplier(false);
  }

  async function loadPreview(group: string, supplierId: string) {
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams({ group, supplier_id: supplierId, deadline });
      // For manual suppliers, pass their info as query params
      if (supplierId.startsWith("temp-")) {
        const manual = suppliers.find((s: any) => s.id === supplierId);
        if (manual) {
          params.set("manual_name", manual.company_name || "");
          params.set("manual_email", manual.email || "");
          if (manual.contact_name) params.set("manual_contact", manual.contact_name);
        }
      }
      const res = await fetch(`/api/submissions/${submissionId}/preview-email?${params}`);
      const json = await res.json();
      if (json.success) {
        setPreviewData({ subject: json.subject, body: json.body, to: json.to, supplier_name: json.supplier_name });
        setPreviewSupplier(supplierId);
        setEditSubject(json.subject);
        setEditBody(json.body_text || json.subject);
      }
    } catch {}
    setPreviewLoading(false);
  }

  function getRequestStatus(pr: PriceRequestData): { label: string; className: string; icon: React.ElementType } {
    if (pr.status === "responded") {
      return { label: "Répondu", className: "bg-green-100 text-green-700", icon: CheckCircle2 };
    }
    if (pr.deadline) {
      const deadlineDate = new Date(pr.deadline);
      const now = new Date();
      if (deadlineDate < now) {
        return { label: "En retard", className: "bg-red-100 text-red-700", icon: AlertTriangle };
      }
    }
    return { label: "En attente", className: "bg-amber-100 text-amber-700", icon: Clock };
  }

  // Group existing requests by material_group
  const requestsByGroup: Record<string, PriceRequestData[]> = {};
  for (const pr of priceRequests) {
    if (!requestsByGroup[pr.material_group]) requestsByGroup[pr.material_group] = [];
    requestsByGroup[pr.material_group].push(pr);
  }

  // Collect all selected (group, supplierId) pairs for preview selector
  const allSelected = Object.entries(selectedSuppliers).flatMap(([group, ids]) =>
    ids.map((sid) => ({ group, supplierId: sid }))
  );

  function toggleItemSelection(itemId: string) {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleFreeSupplier(supplierId: string) {
    setFreeSupplierIds(prev =>
      prev.includes(supplierId) ? prev.filter(id => id !== supplierId) : [...prev, supplierId]
    );
  }

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSelectionMode("group")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            selectionMode === "group" ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <ListFilter className="h-3.5 w-3.5" />
          Par groupe
        </button>
        <button
          onClick={() => setSelectionMode("free")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            selectionMode === "free" ? "bg-brand text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <CheckSquare className="h-3.5 w-3.5" />
          Sélection libre
        </button>
      </div>

      {/* Action bar */}
      {hasSelection && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <div className="text-sm text-blue-900">
            {selectionMode === "free"
              ? `${selectedItemIds.size} article(s) · ${freeSupplierIds.length} fournisseur(s)`
              : `${Object.values(selectedSuppliers).flat().length} fournisseur(s) sélectionné(s)`
            }
          </div>
          <button
            onClick={() => setShowSendModal(true)}
            className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
            Envoyer les demandes
          </button>
        </div>
      )}

      {/* ── Free selection mode ── */}
      {selectionMode === "free" && (
        <div className="space-y-4">
          {/* Item selection table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900">Sélectionner les articles</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedItemIds(new Set(items.map(i => i.id)))}
                  className="text-xs text-brand hover:underline"
                >
                  Tout sélectionner
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={() => setSelectedItemIds(new Set())}
                  className="text-xs text-gray-500 hover:underline"
                >
                  Désélectionner
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full min-w-[600px]">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="text-[11px] font-medium text-gray-500 uppercase">
                    <th className="w-10 px-3 py-2"></th>
                    <th className="text-left px-3 py-2 w-16">N°</th>
                    <th className="text-left px-3 py-2">Description</th>
                    <th className="text-left px-3 py-2 w-24">Groupe</th>
                    <th className="text-center px-3 py-2 w-14">Unité</th>
                    <th className="text-right px-3 py-2 w-16">Qté</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => toggleItemSelection(item.id)}
                      className={`text-sm cursor-pointer transition-colors ${
                        selectedItemIds.has(item.id) ? "bg-blue-50/50" : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedItemIds.has(item.id)}
                          onChange={() => toggleItemSelection(item.id)}
                          className="rounded border-gray-300 text-brand focus:ring-brand"
                        />
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-gray-500">{item.item_number || "—"}</td>
                      <td className="px-3 py-2 text-gray-900">
                        <div className="truncate max-w-[300px]">{item.description}</div>
                        {item.product_name && (
                          <span className="inline-block mt-0.5 text-[10px] bg-purple-50 text-purple-700 px-1 py-0.5 rounded">
                            {item.product_name}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{item.material_group}</td>
                      <td className="px-3 py-2 text-center text-xs text-gray-500">{item.unit || "—"}</td>
                      <td className="px-3 py-2 text-right text-xs text-gray-600">
                        {item.quantity != null ? Number(item.quantity).toLocaleString("fr-CH") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Supplier selection for free mode */}
          {selectedItemIds.size > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">
                  Envoyer à ({selectedItemIds.size} article{selectedItemIds.size > 1 ? "s" : ""})
                </span>
                <button
                  onClick={() => setShowAddSupplier(true)}
                  className="text-xs px-2 py-1 text-brand hover:bg-brand/5 rounded flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Ajouter
                </button>
              </div>
              <div className="px-4 py-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {suppliers.map((supplier: any) => {
                    const isSelected = freeSupplierIds.includes(supplier.id);
                    return (
                      <button
                        key={supplier.id}
                        onClick={() => toggleFreeSupplier(supplier.id)}
                        className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                          isSelected ? "bg-blue-50 border-blue-300 text-blue-900" :
                          "bg-white border-gray-200 text-gray-700 hover:border-brand/30"
                        }`}
                      >
                        <span className="font-medium block truncate">{supplier.company_name}</span>
                        {supplier.email && (
                          <span className="text-gray-400 block truncate">{supplier.email}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Group mode (existing) ── */}
      {selectionMode === "group" && materialGroups.map((group) => {
        const groupItems = items.filter((i) => i.material_group === group);
        const existingRequests = requestsByGroup[group] || [];

        return (
          <div key={group} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-900">{group}</span>
                <span className="text-xs text-gray-400">{groupItems.length} postes</span>
              </div>
              {existingRequests.length > 0 && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {existingRequests.length} demande(s) envoyée(s)
                </span>
              )}
            </div>

            {/* Tracking section — existing requests with full status + relance */}
            {existingRequests.filter(pr => pr.sent_at).length > 0 && (
              <div className="border-b border-gray-100 px-4 py-3 space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Suivi des demandes</p>
                {existingRequests.filter(pr => pr.sent_at).map((pr) => {
                  const status = getRequestStatus(pr);
                  const StatusIcon = status.icon;
                  const sentDate = pr.sent_at ? new Date(pr.sent_at) : null;
                  const deadlineDate = pr.deadline ? new Date(pr.deadline) : null;
                  const now = new Date();
                  const daysSinceSent = sentDate ? Math.floor((now.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                  const canRelance = pr.status !== "responded" && (
                    (deadlineDate && deadlineDate < now) ||
                    daysSinceSent >= 7
                  );

                  return (
                    <div
                      key={pr.id}
                      className="px-3 py-3 rounded-lg text-sm bg-white border border-gray-200 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <StatusIcon className={`h-4 w-4 shrink-0 ${
                            pr.status === "responded" ? "text-green-600" :
                            status.label === "En retard" ? "text-red-600" : "text-amber-500"
                          }`} />
                          <div className="min-w-0">
                            <span className="font-medium text-gray-900">
                              {pr.suppliers?.company_name || "Fournisseur"}
                            </span>
                            {pr.suppliers?.email && (
                              <span className="text-xs text-gray-400 ml-2">{pr.suppliers.email}</span>
                            )}
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.className}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 pl-7">
                        <span className="font-mono text-gray-400">{pr.tracking_code}</span>
                        {sentDate && (
                          <span>Envoyé le {sentDate.toLocaleDateString("fr-CH")}</span>
                        )}
                        {deadlineDate && (
                          <span className="flex items-center gap-1">
                            <span className={`inline-block w-2 h-2 rounded-full ${
                              pr.status === "responded" ? "bg-green-500" :
                              deadlineDate < now ? "bg-red-500" :
                              deadlineDate.getTime() - now.getTime() < 3 * 24 * 60 * 60 * 1000 ? "bg-amber-500" :
                              "bg-green-500"
                            }`} />
                            Deadline: {deadlineDate.toLocaleDateString("fr-CH")}
                          </span>
                        )}
                        {(pr.relance_count || 0) > 0 && (
                          <span className="text-orange-600 font-medium">
                            {pr.relance_count} relance{(pr.relance_count || 0) > 1 ? "s" : ""}
                            {pr.last_relance_at && (
                              <span className="text-gray-400 font-normal ml-1">
                                (dernière: {new Date(pr.last_relance_at).toLocaleDateString("fr-CH")})
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      {canRelance && (
                        <div className="pl-7">
                          <button
                            onClick={() => openRelanceModal(pr)}
                            disabled={relancing === pr.id}
                            className="text-xs px-3 py-1.5 border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {relancing === pr.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                            Relancer
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Supplier selection */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-600">Sélectionner des fournisseurs :</p>
                <button
                  onClick={() => setShowAddSupplier(true)}
                  className="text-xs px-2 py-1 text-brand hover:bg-brand/5 rounded flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Ajouter un fournisseur
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {suppliers.map((supplier: any) => {
                  const isSelected = (selectedSuppliers[group] || []).includes(supplier.id);
                  const alreadySent = existingRequests.some((pr) =>
                    pr.supplier_id === supplier.id ||
                    (supplier.email && pr.suppliers?.email === supplier.email)
                  );
                  return (
                    <button
                      key={supplier.id}
                      onClick={() => !alreadySent && toggleSupplier(group, supplier.id)}
                      disabled={alreadySent}
                      className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                        alreadySent ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed" :
                        isSelected ? "bg-blue-50 border-blue-300 text-blue-900" :
                        "bg-white border-gray-200 text-gray-700 hover:border-brand/30"
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="font-medium block truncate">{supplier.company_name}</span>
                        {supplier._manual && (
                          <span className="text-[10px] bg-orange-100 text-orange-600 px-1 py-0.5 rounded shrink-0">Manuel</span>
                        )}
                      </div>
                      {supplier.email && (
                        <span className="text-gray-400 block truncate">{supplier.email}</span>
                      )}
                      {alreadySent && <span className="text-green-600">Demande envoyée</span>}
                    </button>
                  );
                })}
              </div>
              {suppliers.length === 0 && (
                <p className="text-xs text-gray-400 py-2">
                  Aucun fournisseur.{" "}
                  <button onClick={() => setShowAddSupplier(true)} className="text-brand hover:underline">
                    Ajouter un fournisseur
                  </button>
                </p>
              )}
            </div>
          </div>
        );
      })}

      {selectionMode === "group" && materialGroups.length === 0 && (
        <div className="text-center py-16">
          <Send className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Analysez d&apos;abord le descriptif pour grouper les postes</p>
        </div>
      )}

      {/* Send modal with preview */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-gray-900">Confirmer l&apos;envoi</h3>
              <button onClick={() => { setShowSendModal(false); setPreviewData(null); }} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Délai de réponse</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => { setDeadline(e.target.value); setPreviewData(null); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                />
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                {Object.entries(selectedSuppliers)
                  .filter(([, ids]) => ids.length > 0)
                  .map(([group, ids]) => (
                    <div key={group}>
                      <p className="text-xs font-medium text-gray-700">{group}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {ids.map((sid) => {
                          const s = suppliers.find((sup: any) => sup.id === sid);
                          return (
                            <span key={sid} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                              {s?.company_name || sid}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Email preview — editable */}
              <div className="border border-gray-200 rounded-lg">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Eye className="h-4 w-4" />
                    Aperçu de l&apos;email
                  </div>
                  {allSelected.length > 0 && (
                    <select
                      value={previewSupplier}
                      onChange={(e) => {
                        const pair = allSelected.find((p) => p.supplierId === e.target.value);
                        if (pair) loadPreview(pair.group, pair.supplierId);
                      }}
                      className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                    >
                      <option value="">Choisir un destinataire...</option>
                      {allSelected.map((pair) => {
                        const s = suppliers.find((sup: any) => sup.id === pair.supplierId);
                        return (
                          <option key={`${pair.group}-${pair.supplierId}`} value={pair.supplierId}>
                            {s?.company_name || pair.supplierId} — {pair.group}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
                {previewLoading ? (
                  <div className="p-6 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 text-brand animate-spin" />
                  </div>
                ) : previewData ? (
                  <div className="p-4 space-y-3">
                    <div className="text-xs">
                      <p className="text-gray-500 mb-1">À : <span className="text-gray-900">{previewData.to}</span></p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Objet</label>
                      <input
                        type="text"
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-brand focus:border-brand"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Corps du message</label>
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-mono leading-relaxed focus:ring-1 focus:ring-brand focus:border-brand resize-y"
                        style={{ minHeight: "300px" }}
                      />
                      <p className="text-[10px] text-gray-400 mt-1">
                        Le marqueur [TABLEAU AUTOMATIQUE] sera remplacé par le tableau des postes. Le code de suivi est ajouté automatiquement.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-gray-400">
                    Sélectionnez un destinataire pour voir l&apos;aperçu
                  </div>
                )}
              </div>

              {/* Error display */}
              {(sendResult?.error || sendResult?.microsoft_error) && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="text-sm text-red-700">
                    {sendResult.microsoft_error && (
                      <p className="font-medium">{sendResult.microsoft_error}</p>
                    )}
                    {sendResult.error && <p>{sendResult.error}</p>}
                    {sendResult.results?.filter((r: any) => r.error).map((r: any, i: number) => (
                      <p key={i} className="text-xs mt-1 text-red-600">{r.error}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => { setShowSendModal(false); setPreviewData(null); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="px-6 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50 flex items-center gap-2"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? "Envoi..." : "Envoyer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Relance modal with editable preview */}
      {showRelanceModal && relanceRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Relancer le fournisseur</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {relanceRequest.suppliers?.company_name} — {relanceRequest.tracking_code}
                </p>
              </div>
              <button onClick={() => { setShowRelanceModal(false); setRelanceRequest(null); }} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Objet</label>
                <input
                  type="text"
                  value={relanceSubject}
                  onChange={(e) => setRelanceSubject(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-1 focus:ring-brand focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
                <textarea
                  value={relanceBody}
                  onChange={(e) => setRelanceBody(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-mono leading-relaxed focus:ring-1 focus:ring-brand focus:border-brand resize-y"
                  style={{ minHeight: "220px" }}
                />
                <p className="text-[10px] text-gray-400 mt-1">Le code de suivi ({relanceRequest.tracking_code}) est ajouté automatiquement.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => { setShowRelanceModal(false); setRelanceRequest(null); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleRelanceSend}
                disabled={relancing === relanceRequest.id}
                className="px-5 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
              >
                {relancing === relanceRequest.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Envoyer la relance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add supplier modal */}
      {showAddSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Ajouter un fournisseur</h3>
              <button onClick={() => setShowAddSupplier(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nom de l&apos;entreprise <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newSupplier.company_name}
                  onChange={(e) => setNewSupplier((prev) => ({ ...prev, company_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="Ex: Holcim Suisse SA"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={newSupplier.email}
                  onChange={(e) => setNewSupplier((prev) => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="offres@holcim.ch"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Contact</label>
                  <input
                    type="text"
                    value={newSupplier.contact_name}
                    onChange={(e) => setNewSupplier((prev) => ({ ...prev, contact_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="Jean Dupont"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
                  <input
                    type="tel"
                    value={newSupplier.phone}
                    onChange={(e) => setNewSupplier((prev) => ({ ...prev, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="+41 21 000 00 00"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveToDb}
                  onChange={(e) => setSaveToDb(e.target.checked)}
                  className="rounded border-gray-300 text-brand focus:ring-brand"
                />
                <span className="text-xs text-gray-600">Sauvegarder dans la base fournisseurs</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowAddSupplier(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleAddSupplier}
                disabled={addingSupplier || !newSupplier.company_name || !newSupplier.email}
                className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50 flex items-center gap-2"
              >
                {addingSupplier ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Comparative analysis ──────────────────────────────
function ComparisonTabContent({
  items,
  materialGroups,
  priceRequests,
  quotes,
}: {
  items: SubmissionItem[];
  materialGroups: string[];
  priceRequests: PriceRequestData[];
  quotes: QuoteData[];
}) {
  if (quotes.length === 0) {
    return (
      <div className="text-center py-16">
        <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">Aucune offre reçue</p>
        <p className="text-xs text-gray-400 mt-1">Les résultats apparaîtront ici après réception des réponses fournisseurs</p>
      </div>
    );
  }

  // Build comparison: for each item, show prices from each supplier
  const respondedRequests = priceRequests.filter((pr) => pr.status === "responded");
  const supplierNames: Record<string, string> = {};
  for (const pr of respondedRequests) {
    supplierNames[pr.id] = pr.suppliers?.company_name || "Fournisseur";
  }

  return (
    <div className="space-y-6">
      {materialGroups.map((group) => {
        const groupItems = items.filter((i) => i.material_group === group);
        const groupRequests = respondedRequests.filter((pr) => pr.material_group === group);
        if (groupRequests.length === 0) return null;

        return (
          <div key={group} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
              <span className="text-sm font-medium text-gray-900">{group}</span>
              <span className="text-xs text-gray-400">{groupRequests.length} offre(s)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-gray-200 text-[11px] font-medium text-gray-500 uppercase">
                    <th className="text-left px-3 py-2 sticky left-0 bg-white z-10 w-48">Description</th>
                    <th className="text-center px-2 py-2 w-12">Unité</th>
                    <th className="text-right px-2 py-2 w-16">Qté</th>
                    {groupRequests.map((pr) => (
                      <th key={pr.id} className="text-right px-3 py-2 w-24">
                        <div className="text-xs font-medium text-gray-700">{supplierNames[pr.id]}</div>
                      </th>
                    ))}
                    <th className="text-right px-3 py-2 w-20 bg-gray-50">Ecart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {groupItems.map((item) => {
                    const prices = groupRequests.map((pr) => {
                      const q = quotes.find((q) => q.request_id === pr.id && q.item_id === item.id);
                      return { requestId: pr.id, price: q?.unit_price_ht ?? null };
                    });
                    const validPrices = prices.filter((p) => p.price !== null).map((p) => p.price!);
                    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
                    const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : null;
                    const gap = minPrice && maxPrice && minPrice > 0 ? Math.round(((maxPrice - minPrice) / minPrice) * 100) : null;

                    return (
                      <tr key={item.id} className="hover:bg-gray-50 text-sm">
                        <td className="px-3 py-2 sticky left-0 bg-white z-10">
                          <div className="text-xs font-mono text-gray-400">{item.item_number}</div>
                          <div className="text-sm text-gray-900 truncate max-w-[200px]">{item.description}</div>
                        </td>
                        <td className="px-2 py-2 text-center text-xs text-gray-500">{item.unit}</td>
                        <td className="px-2 py-2 text-right text-gray-600 text-xs">
                          {item.quantity != null ? Number(item.quantity).toLocaleString("fr-CH") : "—"}
                        </td>
                        {prices.map((p) => {
                          const isCheapest = p.price !== null && p.price === minPrice;
                          const isMostExpensive = p.price !== null && p.price === maxPrice && validPrices.length > 1;
                          return (
                            <td
                              key={p.requestId}
                              className={`px-3 py-2 text-right text-sm ${
                                isCheapest ? "text-green-700 font-bold bg-green-50/50" :
                                isMostExpensive ? "text-red-600" : "text-gray-700"
                              }`}
                            >
                              {p.price !== null ? p.price.toFixed(2) : (
                                <span className="text-xs text-gray-300">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right bg-gray-50">
                          {gap !== null ? (
                            <span className={`text-xs font-medium ${gap > 15 ? "text-red-600" : gap > 5 ? "text-amber-600" : "text-green-600"}`}>
                              {gap}%
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab 4: Summary ───────────────────────────────────────────
function SummaryTabContent({
  submission,
  items,
  materialGroups,
  priceRequests,
}: {
  submission: SubmissionData;
  items: SubmissionItem[];
  materialGroups: string[];
  priceRequests: PriceRequestData[];
}) {
  const sentCount = priceRequests.filter((pr) => pr.sent_at).length;
  const respondedCount = priceRequests.filter((pr) => pr.status === "responded").length;
  const quotedItems = items.filter((i) => i.status === "quoted").length;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{items.length}</div>
          <div className="text-xs text-gray-500 mt-1">Postes</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{materialGroups.length}</div>
          <div className="text-xs text-gray-500 mt-1">Groupes</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{sentCount}</div>
          <div className="text-xs text-gray-500 mt-1">Demandes envoyées</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{respondedCount}</div>
          <div className="text-xs text-gray-500 mt-1">Réponses reçues</div>
        </div>
      </div>

      {/* Progress */}
      {sentCount > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Avancement</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>Postes cotés</span>
                <span>{quotedItems}/{items.length}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${items.length > 0 ? (quotedItems / items.length) * 100 : 0}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>Fournisseurs répondus</span>
                <span>{respondedCount}/{sentCount}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${sentCount > 0 ? (respondedCount / sentCount) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Project info */}
      {submission.projects && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Informations</h3>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-gray-500">Projet</dt>
              <dd className="text-gray-900">{submission.projects.name}</dd>
            </div>
            {submission.projects.client_name && (
              <div>
                <dt className="text-xs text-gray-500">Client</dt>
                <dd className="text-gray-900">{submission.projects.client_name}</dd>
              </div>
            )}
            {submission.projects.city && (
              <div>
                <dt className="text-xs text-gray-500">Ville</dt>
                <dd className="text-gray-900">{submission.projects.city}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-gray-500">Fichier</dt>
              <dd className="text-gray-900">{submission.file_name || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Date</dt>
              <dd className="text-gray-900">{new Date(submission.created_at).toLocaleDateString("fr-CH")}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Material groups breakdown */}
      {materialGroups.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Répartition par groupe</h3>
          <div className="space-y-2">
            {materialGroups.map((group) => {
              const count = items.filter((i) => i.material_group === group).length;
              const pct = items.length > 0 ? (count / items.length) * 100 : 0;
              return (
                <div key={group} className="flex items-center gap-3">
                  <span className="text-xs text-gray-700 w-40 truncate">{group}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand/60 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 w-12 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 5: Budget IA ────────────────────────────────────────
function BudgetTabContent({
  submissionId,
  items,
  budgetEstimate: initialBudget,
}: {
  submissionId: string;
  items: SubmissionItem[];
  budgetEstimate: BudgetResult | null;
}) {
  const [budget, setBudget] = useState<BudgetResult | null>(initialBudget);
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEstimate() {
    setEstimating(true);
    setError(null);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/estimate-budget`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setBudget(json);
      } else {
        setError(json.error || "Erreur lors de l'estimation");
      }
    } catch (err: any) {
      setError(err.message || "Erreur réseau");
    }
    setEstimating(false);
  }

  function formatCHF(n: number) {
    return n.toLocaleString("fr-CH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <Calculator className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">Analysez d&apos;abord le descriptif</p>
      </div>
    );
  }

  if (!budget) {
    return (
      <div className="text-center py-16">
        <Calculator className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500 mb-4">Estimez le budget de cette soumission avec l&apos;IA</p>
        <p className="text-xs text-gray-400 mb-6 max-w-md mx-auto">
          L&apos;estimation utilise les prix de référence CRB 2025 et l&apos;IA pour les postes sans correspondance CFC directe.
        </p>
        {error && (
          <div className="mb-4 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 inline-block">
            {error}
          </div>
        )}
        <button
          onClick={handleEstimate}
          disabled={estimating}
          className="px-6 py-2.5 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand/90 disabled:opacity-50 flex items-center gap-2 mx-auto"
        >
          {estimating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
          {estimating ? "Estimation en cours..." : `Estimer le budget (${items.length} postes)`}
        </button>
      </div>
    );
  }

  // Group estimates by material_group
  const estimatesByGroup: Record<string, BudgetEstimate[]> = {};
  for (const est of budget.estimates) {
    const group = est.material_group || "Divers";
    if (!estimatesByGroup[group]) estimatesByGroup[group] = [];
    estimatesByGroup[group].push(est);
  }

  return (
    <div className="space-y-6">
      {/* Total banner */}
      <div className="bg-gradient-to-r from-brand/5 to-blue-50 border border-brand/20 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-700">Budget estimé</h3>
          <button
            onClick={handleEstimate}
            disabled={estimating}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-white text-gray-600 flex items-center gap-1.5"
          >
            {estimating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Recalculer
          </button>
        </div>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-xs text-gray-500 mb-1">Minimum</div>
            <div className="text-xl font-bold text-gray-600">CHF {formatCHF(budget.total_min)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Médiane</div>
            <div className="text-2xl font-bold text-brand">CHF {formatCHF(budget.total_median)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Maximum</div>
            <div className="text-xl font-bold text-gray-600">CHF {formatCHF(budget.total_max)}</div>
          </div>
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
          {budget.crb_count > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              {budget.crb_count} postes CRB 2025
            </span>
          )}
          {budget.ai_count > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              {budget.ai_count} postes estimés IA
            </span>
          )}
          {budget.unestimated_count > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-gray-300"></span>
              {budget.unestimated_count} non estimés
            </span>
          )}
        </div>
      </div>

      {/* Detail by group */}
      {Object.entries(estimatesByGroup).sort(([a], [b]) => a.localeCompare(b)).map(([group, ests]) => {
        const groupMedian = ests.reduce((s, e) => s + (e.quantity ?? 0) * e.prix_median, 0);

        return (
          <div key={group} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-900">{group}</span>
                <span className="text-xs text-gray-400">{ests.length} postes</span>
              </div>
              <span className="text-sm font-semibold text-gray-700">CHF {formatCHF(Math.round(groupMedian))}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-gray-50/50 text-[11px] font-medium text-gray-500 uppercase">
                    <th className="text-left px-3 py-2 w-16">N°</th>
                    <th className="text-left px-3 py-2">Description</th>
                    <th className="text-center px-3 py-2 w-14">Unité</th>
                    <th className="text-right px-3 py-2 w-16">Qté</th>
                    <th className="text-right px-3 py-2 w-20">PU min</th>
                    <th className="text-right px-3 py-2 w-20">PU méd.</th>
                    <th className="text-right px-3 py-2 w-20">PU max</th>
                    <th className="text-right px-3 py-2 w-24">Total méd.</th>
                    <th className="text-center px-3 py-2 w-16">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ests.map((est) => {
                    const total = (est.quantity ?? 0) * est.prix_median;
                    return (
                      <tr key={est.item_id} className="text-sm hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs font-mono text-gray-500">{est.item_number || "—"}</td>
                        <td className="px-3 py-2 text-gray-900 truncate max-w-[250px]">{est.description}</td>
                        <td className="px-3 py-2 text-center text-xs text-gray-500">{est.unit || "—"}</td>
                        <td className="px-3 py-2 text-right text-gray-600 text-xs">
                          {est.quantity != null ? Number(est.quantity).toLocaleString("fr-CH") : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-gray-500">
                          {est.prix_min > 0 ? est.prix_min.toFixed(2) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-sm font-medium text-gray-900">
                          {est.prix_median > 0 ? est.prix_median.toFixed(2) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-gray-500">
                          {est.prix_max > 0 ? est.prix_max.toFixed(2) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">
                          {total > 0 ? formatCHF(Math.round(total)) : "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {est.source === "referentiel_crb" ? (
                            <span className="text-[10px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-medium">CRB</span>
                          ) : est.source === "estimation_ia" ? (
                            <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">IA</span>
                          ) : (
                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
