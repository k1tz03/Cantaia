"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { GroupSelectionStep } from "./GroupSelectionStep";
import { ItemSelectionStep } from "./ItemSelectionStep";
import { SupplierAssignmentStep } from "./SupplierAssignmentStep";
import { SendPreviewStep } from "./SendPreviewStep";
import type { SubmissionLot, Supplier, PriceRequest } from "./shared";

interface BudgetGroup {
  group: string;
  total_median?: number;
}

interface WizardItem {
  id: string;
  item_number: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  material_group: string;
  cfc_code: string | null;
}

export interface SupplierAssignment {
  [groupName: string]: string[]; // group name -> supplier IDs
}

interface PriceRequestWizardProps {
  submissionId: string;
  lots: SubmissionLot[];
  items: WizardItem[];
  suppliers: Supplier[];
  budgetGroups?: BudgetGroup[];
  existingRequests?: PriceRequest[];
  deadline?: string | null;
  onComplete?: () => void;
}

const STEPS = [
  { key: "groups", label: "Groupes" },
  { key: "items", label: "Postes" },
  { key: "suppliers", label: "Fournisseurs" },
  { key: "send", label: "Envoi" },
];

export function PriceRequestWizard({
  submissionId,
  lots,
  items,
  suppliers,
  budgetGroups,
  existingRequests,
  deadline,
  onComplete,
}: PriceRequestWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [assignments, setAssignments] = useState<SupplierAssignment>({});

  function handleGroupsNext(groups: string[]) {
    setSelectedGroups(groups);
    // Initialize selectedItemIds with ALL items from the selected groups
    const allItemIds = new Set<string>();
    for (const item of items) {
      if (groups.includes(item.material_group)) {
        allItemIds.add(item.id);
      }
    }
    setSelectedItemIds(allItemIds);
    setCurrentStep(1);
  }

  function handleItemsNext() {
    // Pre-assign suppliers by CFC matching for each selected group
    const newAssignments: SupplierAssignment = {};
    for (const groupName of selectedGroups) {
      // Only include groups that still have selected items
      const hasSelectedItems = items.some(
        (item) => item.material_group === groupName && selectedItemIds.has(item.id)
      );
      if (!hasSelectedItems) continue;

      const lot = lots.find((l) => l.name === groupName);
      if (!lot) continue;
      // Keep existing assignments if the group was already configured
      if (assignments[groupName] && assignments[groupName].length > 0) {
        newAssignments[groupName] = assignments[groupName];
      } else {
        const matched = matchSuppliersByRelevance(lot, suppliers);
        newAssignments[groupName] = matched.map((s) => s.id);
      }
    }
    setAssignments(newAssignments);
    setCurrentStep(2);
  }

  function handleSuppliersNext(updated: SupplierAssignment) {
    setAssignments(updated);
    setCurrentStep(3);
  }

  function toggleItem(itemId: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function selectAllGroup(group: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        if (item.material_group === group) next.add(item.id);
      }
      return next;
    });
  }

  function deselectAllGroup(group: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        if (item.material_group === group) next.delete(item.id);
      }
      return next;
    });
  }

  // Build filtered lots for steps 3 & 4: only groups with selected items, with updated items_count
  const filteredLots = lots
    .filter((l) => selectedGroups.includes(l.name))
    .filter((l) =>
      items.some((item) => item.material_group === l.name && selectedItemIds.has(item.id))
    )
    .map((l) => ({
      ...l,
      items_count: items.filter(
        (item) => item.material_group === l.name && selectedItemIds.has(item.id)
      ).length,
    }));

  return (
    <div>
      {/* Stepper */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {STEPS.map((step, i) => (
          <div key={step.key} className="flex items-center gap-2">
            <button
              onClick={() => {
                if (i < currentStep) setCurrentStep(i);
              }}
              disabled={i > currentStep}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                i === currentStep
                  ? "bg-[#F97316] text-white"
                  : i < currentStep
                    ? "bg-[#F97316]/10 text-[#F97316] cursor-pointer hover:bg-[#F97316]/20"
                    : "bg-[#27272A] text-[#71717A]"
              }`}
            >
              {i < currentStep ? (
                <Check className="h-4 w-4" />
              ) : (
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-xs">
                  {i + 1}
                </span>
              )}
              {step.label}
            </button>
            {i < STEPS.length - 1 && <div className="h-px w-8 bg-[#27272A]" />}
          </div>
        ))}
      </div>

      {/* Steps */}
      {currentStep === 0 && (
        <GroupSelectionStep
          lots={lots}
          budgetGroups={budgetGroups}
          selectedGroups={selectedGroups}
          onNext={handleGroupsNext}
        />
      )}
      {currentStep === 1 && (
        <ItemSelectionStep
          items={items}
          selectedGroups={selectedGroups}
          selectedItemIds={selectedItemIds}
          existingRequests={existingRequests as any}
          onToggleItem={toggleItem}
          onSelectAllGroup={selectAllGroup}
          onDeselectAllGroup={deselectAllGroup}
          onBack={() => setCurrentStep(0)}
          onNext={handleItemsNext}
        />
      )}
      {currentStep === 2 && (
        <SupplierAssignmentStep
          lots={filteredLots}
          suppliers={suppliers}
          assignments={assignments}
          onBack={() => setCurrentStep(1)}
          onNext={handleSuppliersNext}
        />
      )}
      {currentStep === 3 && (
        <SendPreviewStep
          submissionId={submissionId}
          lots={filteredLots}
          suppliers={suppliers}
          assignments={assignments}
          selectedItemIds={selectedItemIds}
          deadline={deadline}
          onBack={() => setCurrentStep(2)}
          onComplete={onComplete}
        />
      )}
    </div>
  );
}

/**
 * Matches suppliers to a lot based on CFC codes, specialties, score and response rate.
 * Returns up to 5 best-matching suppliers sorted by relevance.
 */
function matchSuppliersByRelevance(
  lot: SubmissionLot,
  suppliers: Supplier[]
): (Supplier & { relevance_score: number })[] {
  const lotCfc = lot.cfc_code || "";
  const lotNameLower = lot.name.toLowerCase();

  const scored = suppliers.map((s) => {
    let score = 0;
    const supplierCfcs = Array.isArray(s.cfc_codes) ? s.cfc_codes : [];
    const supplierSpecs = Array.isArray(s.specialties) ? s.specialties : [];

    // CFC code match (exact, prefix, or reverse prefix)
    if (
      lotCfc &&
      supplierCfcs.some(
        (c: string) =>
          c === lotCfc || lotCfc.startsWith(c) || c.startsWith(lotCfc)
      )
    ) {
      score += 40;
    }

    // Specialty keyword match against lot name
    const keywords = lotNameLower
      .split(/[\s,/()-]+/)
      .filter((w: string) => w.length > 3);
    for (const kw of keywords) {
      if (supplierSpecs.some((sp: string) => sp.toLowerCase().includes(kw))) {
        score += 20;
        break;
      }
    }

    // Bonus for high overall score
    if (s.overall_score && s.overall_score >= 80) score += 10;

    // Bonus for good response rate
    if (s.response_rate && s.response_rate >= 50) score += 5;

    return { ...s, relevance_score: score };
  });

  return scored
    .filter((s) => s.relevance_score > 0)
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, 5);
}
