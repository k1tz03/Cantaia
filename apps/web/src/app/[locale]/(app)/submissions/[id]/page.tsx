"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  FileSpreadsheet,
  Building2,
  BarChart3,
  Send,
  TrendingUp,
  FileText,
  Gavel,
  Calendar,
  ChevronDown,
  ChevronRight,
  Star,
  CheckCircle,
  Zap,
  MapPin,
} from "lucide-react";
import { matchSuppliersToAllLots, generatePriceRequestEmail } from "@cantaia/core/submissions";

import type {
  Submission, SubmissionLot, SubmissionItem, PriceRequest,
  Supplier, PricingAlert, Project, SupplierOffer, OfferLineItem,
  SubmissionStatus,
} from "@cantaia/database";

// Data will come from Supabase — empty arrays until wired
const mockSubmissions: Submission[] = [];
const mockSubmissionLots: SubmissionLot[] = [];
const mockSubmissionItems: SubmissionItem[] = [];
const mockPriceRequests: PriceRequest[] = [];
const mockSuppliers: Supplier[] = [];
const mockPricingAlerts: PricingAlert[] = [];
const mockProjects: Project[] = [];
const mockSupplierOffers: SupplierOffer[] = [];
const mockOfferLineItems: OfferLineItem[] = [];

type Tab = "items" | "suppliers" | "tracking" | "comparison" | "negotiation" | "intelligence" | "documents";

const STATUS_COLORS: Record<SubmissionStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  parsed: "bg-blue-50 text-blue-700",
  requesting: "bg-amber-50 text-amber-700",
  offers_received: "bg-green-50 text-green-700",
  comparing: "bg-purple-50 text-purple-700",
  negotiating: "bg-orange-50 text-orange-700",
  awarded: "bg-emerald-50 text-emerald-700",
  archived: "bg-gray-100 text-gray-500",
};

export default function SubmissionDetailPage() {
  const params = useParams();
  const t = useTranslations("submissions");
  const tPricing = useTranslations("pricing");
  const id = params.id as string;
  const [activeTab, setActiveTab] = useState<Tab>("items");
  const [expandedLots, setExpandedLots] = useState<Set<string>>(new Set(["lot-001", "lot-004"]));
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set());
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendLanguage, setSendLanguage] = useState<"fr" | "en" | "de">("fr");
  const [sendDeadline, setSendDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split("T")[0];
  });
  const [sendingStatus, setSendingStatus] = useState<"idle" | "sending" | "sent">("idle");

  const submission = mockSubmissions.find((s) => s.id === id);
  const project = submission ? mockProjects.find((p) => p.id === submission.project_id) : null;
  const lots = mockSubmissionLots.filter((l) => l.submission_id === id);
  const items = mockSubmissionItems.filter((i) => i.submission_id === id);
  const priceRequests = mockPriceRequests.filter((pr) => pr.submission_id === id);
  const alerts = mockPricingAlerts.filter((a) => a.submission_id === id);
  const offers = mockSupplierOffers.filter((o) => o.submission_id === id);
  const allItemIds = items.map((i) => i.id);
  const offerLineItems = mockOfferLineItems.filter((li) => allItemIds.includes(li.submission_item_id));

  // AI supplier matching
  const supplierMatches = useMemo(() => {
    if (lots.length === 0) return {};
    return matchSuppliersToAllLots(lots, mockSuppliers, project?.city);
  }, [lots, project?.city]);

  const toggleSupplierSelection = (key: string) => {
    setSelectedSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllRecommended = () => {
    const allKeys = new Set<string>();
    for (const lotId of Object.keys(supplierMatches)) {
      for (const match of supplierMatches[lotId]) {
        if (match.relevance_score >= 60) {
          allKeys.add(`${lotId}:${match.supplier_id}`);
        }
      }
    }
    setSelectedSuppliers(allKeys);
  };

  const reasonLabel = (reason: string): { label: string; color: string } => {
    switch (reason) {
      case "specialty_match": return { label: t("reasonSpecialty"), color: "bg-blue-100 text-blue-700" };
      case "cfc_match": return { label: t("reasonCfc"), color: "bg-indigo-100 text-indigo-700" };
      case "high_score": return { label: t("reasonHighScore"), color: "bg-green-100 text-green-700" };
      case "reliable_responder": return { label: t("reasonReliable"), color: "bg-emerald-100 text-emerald-700" };
      case "preferred": return { label: t("reasonPreferred"), color: "bg-amber-100 text-amber-700" };
      case "local": return { label: t("reasonLocal"), color: "bg-purple-100 text-purple-700" };
      default: return { label: reason, color: "bg-gray-100 text-gray-600" };
    }
  };

  // Generate preview email for modal
  const previewEmail = useMemo(() => {
    if (!submission || selectedSuppliers.size === 0) return null;
    const selectedLotIds = new Set<string>();
    selectedSuppliers.forEach((key) => {
      const [lotId] = key.split(":");
      selectedLotIds.add(lotId);
    });
    const selectedLots = lots.filter((l) => selectedLotIds.has(l.id));
    return generatePriceRequestEmail({
      supplier_name: "Exemple SA",
      contact_name: "M. Dupont",
      project_name: project?.name || "",
      submission_title: submission?.title || "",
      submission_reference: submission?.reference || "",
      lots: selectedLots.map((l) => ({
        name: l.name,
        cfc_code: l.cfc_code || "000",
        item_count: items.filter((i) => i.lot_id === l.id).length,
      })),
      deadline: sendDeadline,
      sender_name: "Chef de projet",
      sender_company: "Cantaia",
      language: sendLanguage,
    });
  }, [submission, selectedSuppliers, lots, items, project, sendDeadline, sendLanguage]);

  const handleSendRequests = () => {
    setSendingStatus("sending");
    setTimeout(() => {
      setSendingStatus("sent");
      setTimeout(() => {
        setShowSendModal(false);
        setSendingStatus("idle");
        setSelectedSuppliers(new Set());
      }, 1500);
    }, 1500);
  };

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

  function formatCHF(amount: number): string {
    return new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount) + " CHF";
  }

  function toggleLot(lotId: string) {
    setExpandedLots((prev) => {
      const next = new Set(prev);
      if (next.has(lotId)) next.delete(lotId);
      else next.add(lotId);
      return next;
    });
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "items", label: t("tabItems"), icon: FileSpreadsheet },
    { key: "suppliers", label: t("tabSuppliers"), icon: Building2 },
    { key: "tracking", label: t("tabTracking"), icon: Send },
    { key: "comparison", label: t("tabComparison"), icon: BarChart3 },
    { key: "negotiation", label: t("tabNegotiation"), icon: Gavel },
    { key: "intelligence", label: t("tabIntelligence"), icon: TrendingUp },
    { key: "documents", label: t("tabDocuments"), icon: FileText },
  ];

  const getStatusLabel = (status: SubmissionStatus): string => {
    const key = `status${status.charAt(0).toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;
    return t(key as "statusDraft");
  };

  const respondedCount = priceRequests.filter((pr) => pr.status === "responded").length;

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/submissions" className="p-1 hover:bg-gray-100 rounded">
            <ArrowLeft className="h-4 w-4 text-gray-500" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: project?.color || "#94a3b8" }} />
            <span className="text-sm text-gray-500">{project?.name}</span>
          </div>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{submission.title}</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              {submission.reference && (
                <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">{submission.reference}</span>
              )}
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[submission.status]}`}>
                {getStatusLabel(submission.status)}
              </span>
              <span>{lots.length} {t("lots")} · {items.length} {t("items")}</span>
              {submission.deadline && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(submission.deadline).toLocaleDateString("fr-CH")}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            {submission.awarded_total && (
              <div>
                <div className="text-xs text-gray-500">{t("awarded")}</div>
                <div className="text-lg font-bold text-emerald-600">{formatCHF(submission.awarded_total)}</div>
              </div>
            )}
            {!submission.awarded_total && submission.estimated_total > 0 && (
              <div>
                <div className="text-xs text-gray-500">{t("estimated")}</div>
                <div className="text-lg font-bold text-gray-700">{formatCHF(submission.estimated_total)}</div>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 -mb-4 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "text-[#0A1F30] border-[#0A1F30] bg-white"
                    : "text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {activeTab === "items" && (
          <div className="space-y-4">
            {lots.map((lot) => {
              const lotItems = items.filter((i) => i.lot_id === lot.id);
              const expanded = expandedLots.has(lot.id);
              const awardedSupplier = lot.awarded_supplier_id
                ? mockSuppliers.find((s) => s.id === lot.awarded_supplier_id)
                : null;
              return (
                <div key={lot.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleLot(lot.id)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      {expanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      )}
                      <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                        CFC {lot.cfc_code}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{lot.name}</span>
                      <span className="text-xs text-gray-400">{lotItems.length} {t("items")}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {awardedSupplier && (
                        <span className="text-xs text-emerald-600 flex items-center gap-1">
                          <Gavel className="h-3 w-3" />
                          {awardedSupplier.company_name}
                        </span>
                      )}
                    </div>
                  </button>
                  {expanded && lotItems.length > 0 && (
                    <div className="border-t border-gray-200">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 text-[11px] font-medium text-gray-500 uppercase">
                            <th className="text-left px-4 py-2 w-16">N°</th>
                            <th className="text-left px-4 py-2">{t("description")}</th>
                            <th className="text-center px-4 py-2 w-16">{t("unit")}</th>
                            <th className="text-right px-4 py-2 w-20">{t("quantity")}</th>
                            <th className="text-right px-4 py-2 w-24">{tPricing("estimatedPrice")}</th>
                            <th className="text-right px-4 py-2 w-24">{t("unitPrice")}</th>
                            <th className="text-right px-4 py-2 w-28">{t("totalPrice")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {lotItems.map((item) => {
                            const confidenceColor = (item.estimated_confidence || 0) >= 0.8
                              ? "text-green-600"
                              : (item.estimated_confidence || 0) >= 0.6
                                ? "text-amber-600"
                                : "text-red-500";
                            return (
                              <tr key={item.id} className="hover:bg-gray-50 text-sm">
                                <td className="px-4 py-2 text-xs font-mono text-gray-500">{item.code}</td>
                                <td className="px-4 py-2 text-gray-900">
                                  {item.description}
                                  {item.remarks && (
                                    <span className="text-xs text-gray-400 ml-2">({item.remarks})</span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-center text-gray-500 text-xs">{item.unit}</td>
                                <td className="px-4 py-2 text-right text-gray-600">
                                  {item.quantity?.toLocaleString("fr-CH")}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  {item.estimated_unit_price && (
                                    <span className={`text-xs ${confidenceColor}`}>
                                      {item.estimated_unit_price.toFixed(2)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-right font-medium text-gray-900">
                                  {item.awarded_unit_price?.toFixed(2) || item.best_unit_price?.toFixed(2) || "—"}
                                </td>
                                <td className="px-4 py-2 text-right font-medium text-gray-900">
                                  {(item.awarded_unit_price || item.best_unit_price) && item.quantity
                                    ? formatCHF((item.awarded_unit_price || item.best_unit_price || 0) * item.quantity)
                                    : "—"}
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
        )}

        {activeTab === "tracking" && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">
                    {t("suppliersResponded", { count: respondedCount, total: priceRequests.length })}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                    {respondedCount} {t("responded").toLowerCase()}
                  </span>
                  <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                    {priceRequests.filter((pr) => pr.status === "sent" || pr.status === "opened").length} {t("waiting").toLowerCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Tracking cards */}
            <div className="space-y-3">
              {priceRequests.map((pr) => {
                const supplier = mockSuppliers.find((s) => s.id === pr.supplier_id);
                const daysSinceSent = pr.sent_at
                  ? Math.floor((Date.now() - new Date(pr.sent_at).getTime()) / 86400000)
                  : 0;
                const isOverdue = pr.deadline && new Date(pr.deadline) < new Date() && pr.status !== "responded";
                const statusColor =
                  pr.status === "responded" ? "border-l-green-500 bg-green-50/30"
                    : isOverdue ? "border-l-red-500 bg-red-50/30"
                    : pr.status === "opened" ? "border-l-blue-500 bg-blue-50/30"
                      : "border-l-amber-500 bg-amber-50/30";
                return (
                  <div key={pr.id} className={`bg-white border border-gray-200 border-l-4 rounded-lg p-4 ${statusColor}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{supplier?.company_name}</div>
                          <div className="text-xs text-gray-500">{supplier?.contact_name} · {supplier?.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isOverdue && (
                          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                            {t("overdue")}
                          </span>
                        )}
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          pr.status === "responded" ? "bg-green-100 text-green-700"
                            : pr.status === "opened" ? "bg-blue-100 text-blue-700"
                              : "bg-amber-100 text-amber-700"
                        }`}>
                          {t(pr.status as "sent")}
                        </span>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div className="flex items-center gap-6 mt-3 text-xs text-gray-500">
                      <span>{t("sentAt")} : {pr.sent_at ? new Date(pr.sent_at).toLocaleDateString("fr-CH") : "—"}</span>
                      <span>{t("openedAt")} : {pr.opened_at ? new Date(pr.opened_at).toLocaleDateString("fr-CH") : <span className="text-red-500">{t("notOpened")}</span>}</span>
                      {pr.status === "responded" && <span className="text-green-600">{t("respondedAt")} ✅</span>}
                      {daysSinceSent > 0 && pr.status !== "responded" && (
                        <span className="text-gray-400">{t("trackingDays", { days: daysSinceSent })}</span>
                      )}
                    </div>

                    {/* Reminder schedule */}
                    {pr.status !== "responded" && (
                      <div className="flex items-center gap-2 mt-3">
                        <div className="flex gap-1">
                          {[3, 5, 7].map((day) => {
                            const isDone = pr.reminder_count >= (day === 3 ? 1 : day === 5 ? 2 : 3);
                            const isNext = daysSinceSent >= day && !isDone;
                            return (
                              <span
                                key={day}
                                className={`text-[10px] px-2 py-0.5 rounded border ${
                                  isDone ? "bg-amber-100 text-amber-700 border-amber-200"
                                    : isNext ? "bg-amber-50 text-amber-600 border-amber-300 animate-pulse"
                                      : "bg-gray-50 text-gray-400 border-gray-200"
                                }`}
                              >
                                {day === 3 ? t("reminderJ3") : day === 5 ? t("reminderJ5") : t("reminderJ7")}
                              </span>
                            );
                          })}
                        </div>
                        {pr.reminder_enabled !== false && (
                          <button className="text-[10px] text-gray-400 hover:text-red-500 ml-auto">
                            {t("disableReminder")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "intelligence" && (
          <div>
            {alerts.length === 0 ? (
              <div className="text-center py-12">
                <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">{tPricing("noAlerts")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => {
                  const severityColors = {
                    critical: "border-red-200 bg-red-50",
                    warning: "border-amber-200 bg-amber-50",
                    info: "border-blue-200 bg-blue-50",
                  };
                  const severityIcons = {
                    critical: "🔴",
                    warning: "⚠️",
                    info: "💡",
                  };
                  return (
                    <div key={alert.id} className={`border rounded-lg p-4 ${severityColors[alert.severity]}`}>
                      <div className="flex items-start gap-3">
                        <span className="text-lg">{severityIcons[alert.severity]}</span>
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-gray-900">{alert.title}</h4>
                          <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                          {alert.financial_impact && (
                            <p className="text-xs font-medium text-gray-700 mt-2">
                              {t("impact")} : {alert.financial_impact > 0 ? "+" : ""}{formatCHF(alert.financial_impact)}
                            </p>
                          )}
                          <div className="flex gap-2 mt-3">
                            <button className="text-xs px-3 py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                              {t("renegotiate")}
                            </button>
                            <button className="text-xs px-3 py-1.5 text-gray-500 hover:text-gray-700">
                              {t("dismiss")}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "suppliers" && (
          <div className="space-y-6">
            {/* Header with actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium text-gray-700">{t("matching")}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={selectAllRecommended}
                  className="text-xs px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700"
                >
                  {t("selectAll")}
                </button>
                {selectedSuppliers.size > 0 && (
                  <button
                    onClick={() => setShowSendModal(true)}
                    className="text-xs px-4 py-1.5 bg-gold text-white rounded-md hover:bg-gold-dark font-medium"
                  >
                    <Send className="h-3 w-3 inline mr-1" />
                    {t("sendRequests")} ({selectedSuppliers.size})
                  </button>
                )}
              </div>
            </div>

            {/* Per-lot recommendations */}
            {lots.map((lot) => {
              const matches = supplierMatches[lot.id] || [];
              return (
                <div key={lot.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
                    <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                      CFC {lot.cfc_code}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{lot.name}</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {matches.length} {t("tabSuppliers").toLowerCase()}
                    </span>
                  </div>
                  {matches.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-gray-400">
                      {t("noRecommendations")}
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {matches.map((match) => {
                        const supplier = mockSuppliers.find((s) => s.id === match.supplier_id);
                        const selKey = `${lot.id}:${match.supplier_id}`;
                        const isSelected = selectedSuppliers.has(selKey);
                        const alreadyRequested = priceRequests.some(
                          (pr) => pr.supplier_id === match.supplier_id && pr.lot_ids?.includes(lot.id)
                        );
                        return (
                          <div
                            key={match.supplier_id}
                            className={`flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors ${isSelected ? "bg-blue-50/50" : ""}`}
                          >
                            {/* Checkbox */}
                            <input
                              type="checkbox"
                              checked={isSelected || alreadyRequested}
                              disabled={alreadyRequested}
                              onChange={() => toggleSupplierSelection(selKey)}
                              className="h-4 w-4 rounded border-gray-300 text-[#0A1F30] focus:ring-[#0A1F30]"
                            />
                            {/* Relevance score bar */}
                            <div className="w-14 flex-shrink-0">
                              <div className="flex items-center gap-1">
                                <div
                                  className={`text-xs font-bold ${
                                    match.relevance_score >= 80 ? "text-green-600" :
                                    match.relevance_score >= 60 ? "text-amber-600" : "text-gray-500"
                                  }`}
                                >
                                  {match.relevance_score}%
                                </div>
                              </div>
                              <div className="h-1 bg-gray-200 rounded-full mt-1 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    match.relevance_score >= 80 ? "bg-green-500" :
                                    match.relevance_score >= 60 ? "bg-amber-500" : "bg-gray-400"
                                  }`}
                                  style={{ width: `${match.relevance_score}%` }}
                                />
                              </div>
                            </div>
                            {/* Supplier info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900 truncate">
                                  {supplier?.company_name || match.supplier_name}
                                </span>
                                {supplier?.status === "preferred" && (
                                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 flex-shrink-0" />
                                )}
                                {alreadyRequested && (
                                  <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                {match.reasons.map((reason) => {
                                  const { label, color } = reasonLabel(reason);
                                  return (
                                    <span key={reason} className={`text-[10px] px-1.5 py-0.5 rounded ${color}`}>
                                      {label}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                            {/* Supplier stats */}
                            <div className="flex items-center gap-4 text-xs text-gray-500 flex-shrink-0">
                              {supplier && (
                                <>
                                  <span title={t("matchScore")}>
                                    {supplier.overall_score}/100
                                  </span>
                                  <span>
                                    {supplier.response_rate}% {t("responded").toLowerCase()}
                                  </span>
                                  {supplier.geo_zone && (
                                    <span className="flex items-center gap-0.5">
                                      <MapPin className="h-3 w-3" />
                                      {supplier.geo_zone}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "comparison" && (
          <div className="space-y-6">
            {offers.length === 0 ? (
              <div className="text-center py-16">
                <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">{t("noSubmissions")}</p>
              </div>
            ) : (
              lots.map((lot) => {
                const lotItems = items.filter((i) => i.lot_id === lot.id);
                const lotItemIds = lotItems.map((i) => i.id);
                const lotOffers = offers.filter((o) => {
                  const lineItems = offerLineItems.filter((li) => li.offer_id === o.id && lotItemIds.includes(li.submission_item_id));
                  return lineItems.length > 0;
                });
                if (lotOffers.length === 0) return null;

                return (
                  <div key={lot.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-3">
                      <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">CFC {lot.cfc_code}</span>
                      <span className="text-sm font-medium text-gray-900">{lot.name}</span>
                      <span className="text-xs text-gray-400 ml-auto">{lotOffers.length} {t("offersReceived", { count: lotOffers.length, total: lotOffers.length }).split("/")[0]}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[800px]">
                        <thead>
                          <tr className="border-b border-gray-200 text-[11px] font-medium text-gray-500 uppercase">
                            <th className="text-left px-3 py-2 sticky left-0 bg-white z-10 w-48">{t("description")}</th>
                            <th className="text-center px-2 py-2 w-12">{t("unit")}</th>
                            <th className="text-right px-2 py-2 w-16">{t("quantity")}</th>
                            {lotOffers.map((offer) => {
                              const supplier = mockSuppliers.find((s) => s.id === offer.supplier_id);
                              const isLowest = lotOffers.every((o) => (o.total_amount || Infinity) >= (offer.total_amount || Infinity));
                              return (
                                <th key={offer.id} className={`text-right px-3 py-2 w-24 ${isLowest ? "bg-green-50" : ""}`}>
                                  <div className="text-xs font-medium text-gray-700">{supplier?.company_name}</div>
                                  {offer.status === "awarded" && (
                                    <span className="text-[9px] text-emerald-600">({t("awarded")})</span>
                                  )}
                                </th>
                              );
                            })}
                            <th className="text-right px-3 py-2 w-20 bg-gray-50">{t("maxGap")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {lotItems.map((item) => {
                            const itemPrices = lotOffers.map((offer) => {
                              const lineItem = offerLineItems.find(
                                (li) => li.offer_id === offer.id && li.submission_item_id === item.id
                              );
                              return { offerId: offer.id, unitPrice: lineItem?.unit_price ?? null, totalPrice: lineItem?.total_price ?? null };
                            });
                            const validPrices = itemPrices.filter((p) => p.unitPrice !== null).map((p) => p.unitPrice!);
                            const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : null;
                            const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : null;
                            const gap = minPrice && maxPrice ? Math.round(((maxPrice - minPrice) / minPrice) * 100) : null;

                            return (
                              <tr key={item.id} className="hover:bg-gray-50 text-sm">
                                <td className="px-3 py-2 sticky left-0 bg-white z-10">
                                  <div className="text-xs font-mono text-gray-400">{item.code}</div>
                                  <div className="text-sm text-gray-900 truncate max-w-[180px]">{item.description}</div>
                                </td>
                                <td className="px-2 py-2 text-center text-xs text-gray-500">{item.unit}</td>
                                <td className="px-2 py-2 text-right text-gray-600 text-xs">{item.quantity?.toLocaleString("fr-CH")}</td>
                                {itemPrices.map((p) => {
                                  const isCheapest = p.unitPrice !== null && p.unitPrice === minPrice;
                                  const isMostExpensive = p.unitPrice !== null && p.unitPrice === maxPrice && validPrices.length > 1;
                                  return (
                                    <td
                                      key={p.offerId}
                                      className={`px-3 py-2 text-right text-sm ${
                                        isCheapest ? "text-green-700 font-bold bg-green-50/50" :
                                        isMostExpensive ? "text-red-600" : "text-gray-700"
                                      }`}
                                    >
                                      {p.unitPrice !== null ? p.unitPrice.toFixed(2) : (
                                        <span className="text-xs text-gray-300">{t("notQuoted")}</span>
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
                        <tfoot>
                          <tr className="border-t-2 border-gray-300 bg-gray-50 font-medium">
                            <td className="px-3 py-2 text-sm text-gray-900 sticky left-0 bg-gray-50 z-10" colSpan={3}>
                              {t("total")}
                            </td>
                            {lotOffers.map((offer) => {
                              const offerTotal = offerLineItems
                                .filter((li) => li.offer_id === offer.id && lotItemIds.includes(li.submission_item_id))
                                .reduce((sum, li) => sum + (li.total_price || 0), 0);
                              const allTotals = lotOffers.map((o) =>
                                offerLineItems.filter((li) => li.offer_id === o.id && lotItemIds.includes(li.submission_item_id)).reduce((s, li) => s + (li.total_price || 0), 0)
                              );
                              const isCheapest = offerTotal === Math.min(...allTotals);
                              return (
                                <td key={offer.id} className={`px-3 py-2 text-right text-sm ${isCheapest ? "text-green-700 font-bold" : "text-gray-700"}`}>
                                  {formatCHF(offerTotal)}
                                </td>
                              );
                            })}
                            <td className="px-3 py-2" />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === "negotiation" && (
          <div className="space-y-6">
            {offers.length === 0 ? (
              <div className="text-center py-16">
                <Gavel className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">{t("noSubmissions")}</p>
              </div>
            ) : (
              <>
                {/* Negotiation summary */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-gray-900">{offers.length}</div>
                    <div className="text-xs text-gray-500 mt-1">{t("offersReceived", { count: offers.length, total: offers.length }).split("/")[0]}</div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-emerald-600">
                      {offers.filter((o) => o.status === "awarded").length > 0 ? "1" : "0"}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{t("awarded")}</div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {submission.estimated_total && submission.awarded_total
                        ? `${Math.round((1 - submission.awarded_total / submission.estimated_total) * 100)}%`
                        : "—"}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{t("savings")}</div>
                  </div>
                </div>

                {/* Per-offer negotiation cards */}
                {offers.map((offer) => {
                  const supplier = mockSuppliers.find((s) => s.id === offer.supplier_id);
                  const isAwarded = offer.status === "awarded";
                  return (
                    <div key={offer.id} className={`bg-white border rounded-lg overflow-hidden ${isAwarded ? "border-emerald-300" : "border-gray-200"}`}>
                      <div className={`px-4 py-3 flex items-center justify-between ${isAwarded ? "bg-emerald-50" : "bg-gray-50"} border-b`}>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-900">{supplier?.company_name}</span>
                          {supplier?.status === "preferred" && (
                            <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            isAwarded ? "bg-emerald-100 text-emerald-700" :
                            offer.status === "rejected" ? "bg-red-100 text-red-700" :
                            "bg-blue-100 text-blue-700"
                          }`}>
                            {isAwarded ? t("awarded") : offer.status === "rejected" ? "Non retenu" : t("negotiation")}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-gray-900">{formatCHF(offer.total_amount || 0)}</div>
                          {offer.discount_percent && offer.discount_percent > 0 && (
                            <div className="text-xs text-green-600">-{offer.discount_percent}% {t("reduction")}</div>
                          )}
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="grid grid-cols-4 gap-4 text-xs text-gray-500">
                          <div>
                            <div className="font-medium text-gray-600">{t("respondedAt")}</div>
                            <div>{new Date(offer.received_at).toLocaleDateString("fr-CH")}</div>
                          </div>
                          <div>
                            <div className="font-medium text-gray-600">{t("deadline")}</div>
                            <div>{offer.validity_date ? new Date(offer.validity_date).toLocaleDateString("fr-CH") : "—"}</div>
                          </div>
                          <div>
                            <div className="font-medium text-gray-600">Paiement</div>
                            <div>{offer.payment_terms || "—"}</div>
                          </div>
                          <div>
                            <div className="font-medium text-gray-600">{t("negotiationRound", { round: offer.negotiation_round })}</div>
                            <div>{offer.is_final ? "Offre finale" : "En cours"}</div>
                          </div>
                        </div>
                        {offer.conditions_text && (
                          <div className="mt-3 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded">
                            {offer.conditions_text}
                          </div>
                        )}
                        {!isAwarded && offer.status !== "rejected" && (
                          <div className="flex gap-2 mt-4">
                            <button className="text-xs px-3 py-1.5 bg-gold text-white rounded-md hover:bg-gold-dark">
                              {t("generateEmail")}
                            </button>
                            <button className="text-xs px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700">
                              {t("startNegotiation")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* Placeholder — Documents */}
        {activeTab === "documents" && (
          <div className="text-center py-16">
            <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">{t("tabDocuments")}</p>
          </div>
        )}
      </div>

      {/* Send Price Request Modal */}
      {showSendModal && previewEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{t("priceRequest")}</h3>
              <button onClick={() => setShowSendModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("deadline")}</label>
                  <input
                    type="date"
                    value={sendDeadline}
                    onChange={(e) => setSendDeadline(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Langue</label>
                  <select
                    value={sendLanguage}
                    onChange={(e) => setSendLanguage(e.target.value as "fr" | "en" | "de")}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                  >
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                    <option value="de">Deutsch</option>
                  </select>
                </div>
              </div>

              {/* Recipients summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-xs font-medium text-gray-600 mb-2">
                  {selectedSuppliers.size} {t("tabSuppliers").toLowerCase()} {t("filterStatus").toLowerCase()}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(new Set(
                    Array.from(selectedSuppliers).map((key) => key.split(":")[1])
                  )).map((supplierId) => {
                    const supplier = mockSuppliers.find((s) => s.id === supplierId);
                    return (
                      <span key={supplierId} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                        {supplier?.company_name || supplierId}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Email preview */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <div className="text-xs text-gray-500">Objet :</div>
                  <div className="text-sm font-medium text-gray-900">{previewEmail.subject}</div>
                </div>
                <div className="px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed max-h-60 overflow-auto">
                  {previewEmail.body}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowSendModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
              >
                {t("title") === "Soumissions" ? "Annuler" : "Cancel"}
              </button>
              <button
                onClick={handleSendRequests}
                disabled={sendingStatus !== "idle"}
                className="px-6 py-2 bg-gold text-white rounded-md text-sm font-medium hover:bg-gold-dark disabled:opacity-50 flex items-center gap-2"
              >
                {sendingStatus === "sending" && <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {sendingStatus === "sent" && <CheckCircle className="h-3.5 w-3.5" />}
                {sendingStatus === "idle" && <Send className="h-3.5 w-3.5" />}
                {sendingStatus === "sent" ? t("sent") : t("sendRequests")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
