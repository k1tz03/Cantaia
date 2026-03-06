"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { matchSuppliersToAllLots, generatePriceRequestEmail } from "@cantaia/core/submissions";

import type {
  Submission, SubmissionLot, SubmissionItem, PriceRequest,
  Supplier, PricingAlert, Project, SupplierOffer, OfferLineItem,
} from "@cantaia/database";

import type { Tab } from "@/components/submissions/detail";
import {
  SubmissionDetailHeader,
  ItemsTab,
  TrackingTab,
  IntelligenceTab,
  SuppliersTab,
  ComparisonTab,
  NegotiationTab,
  DocumentsTab,
  SendPriceRequestModal,
} from "@/components/submissions/detail";

const mockSubmissions: Submission[] = [];
const mockSubmissionLots: SubmissionLot[] = [];
const mockSubmissionItems: SubmissionItem[] = [];
const mockPriceRequests: PriceRequest[] = [];
const mockSuppliers: Supplier[] = [];
const mockPricingAlerts: PricingAlert[] = [];
const mockProjects: Project[] = [];
const mockSupplierOffers: SupplierOffer[] = [];
const mockOfferLineItems: OfferLineItem[] = [];

export default function SubmissionDetailPage() {
  const params = useParams();
  const t = useTranslations("submissions") as any;
  const tPricing = useTranslations("pricing") as any;
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
  const project = submission ? mockProjects.find((p) => p.id === submission.project_id) ?? null : null;
  const lots = mockSubmissionLots.filter((l) => l.submission_id === id);
  const items = mockSubmissionItems.filter((i) => i.submission_id === id);
  const priceRequests = mockPriceRequests.filter((pr) => pr.submission_id === id);
  const alerts = mockPricingAlerts.filter((a) => a.submission_id === id);
  const offers = mockSupplierOffers.filter((o) => o.submission_id === id);
  const allItemIds = items.map((i) => i.id);
  const offerLineItems = mockOfferLineItems.filter((li) => allItemIds.includes(li.submission_item_id));

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

  function toggleLot(lotId: string) {
    setExpandedLots((prev) => {
      const next = new Set(prev);
      if (next.has(lotId)) next.delete(lotId);
      else next.add(lotId);
      return next;
    });
  }

  return (
    <div className="h-full overflow-auto">
      <SubmissionDetailHeader
        submission={submission}
        project={project}
        lots={lots}
        items={items}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        t={t}
      />

      <div className="p-6">
        {activeTab === "items" && (
          <ItemsTab
            lots={lots}
            items={items}
            expandedLots={expandedLots}
            toggleLot={toggleLot}
            suppliers={mockSuppliers}
            t={t}
            tPricing={tPricing}
          />
        )}

        {activeTab === "tracking" && (
          <TrackingTab
            priceRequests={priceRequests}
            suppliers={mockSuppliers}
            t={t}
          />
        )}

        {activeTab === "intelligence" && (
          <IntelligenceTab
            alerts={alerts}
            t={t}
            tPricing={tPricing}
          />
        )}

        {activeTab === "suppliers" && (
          <SuppliersTab
            lots={lots}
            supplierMatches={supplierMatches}
            suppliers={mockSuppliers}
            priceRequests={priceRequests}
            selectedSuppliers={selectedSuppliers}
            toggleSupplierSelection={toggleSupplierSelection}
            selectAllRecommended={selectAllRecommended}
            setShowSendModal={setShowSendModal}
            t={t}
          />
        )}

        {activeTab === "comparison" && (
          <ComparisonTab
            lots={lots}
            items={items}
            offers={offers}
            offerLineItems={offerLineItems}
            suppliers={mockSuppliers}
            t={t}
          />
        )}

        {activeTab === "negotiation" && (
          <NegotiationTab
            submission={submission}
            offers={offers}
            suppliers={mockSuppliers}
            t={t}
          />
        )}

        {activeTab === "documents" && (
          <DocumentsTab t={t} />
        )}
      </div>

      {showSendModal && previewEmail && (
        <SendPriceRequestModal
          previewEmail={previewEmail}
          selectedSuppliers={selectedSuppliers}
          suppliers={mockSuppliers}
          sendDeadline={sendDeadline}
          setSendDeadline={setSendDeadline}
          sendLanguage={sendLanguage}
          setSendLanguage={setSendLanguage}
          sendingStatus={sendingStatus}
          onSend={handleSendRequests}
          onClose={() => setShowSendModal(false)}
          t={t}
        />
      )}
    </div>
  );
}
