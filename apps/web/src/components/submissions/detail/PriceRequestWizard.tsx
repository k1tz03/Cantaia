"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { GroupSelectionStep } from "./GroupSelectionStep";
import { SupplierAssignmentStep } from "./SupplierAssignmentStep";
import { SendPreviewStep } from "./SendPreviewStep";
import type { SubmissionLot, Supplier, PriceRequest } from "./shared";

interface BudgetGroup {
  group: string;
  total_median?: number;
}

export interface SupplierAssignment {
  [groupName: string]: string[]; // group name -> supplier IDs
}

interface PriceRequestWizardProps {
  submissionId: string;
  lots: SubmissionLot[];
  suppliers: Supplier[];
  budgetGroups?: BudgetGroup[];
  existingRequests?: PriceRequest[];
  onComplete?: () => void;
}

const STEPS = [
  { key: "groups", label: "Groupes" },
  { key: "suppliers", label: "Fournisseurs" },
  { key: "send", label: "Envoi" },
];

export function PriceRequestWizard({
  submissionId,
  lots,
  suppliers,
  budgetGroups,
  existingRequests: _existingRequests,
  onComplete,
}: PriceRequestWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<SupplierAssignment>({});

  function handleGroupsNext(groups: string[]) {
    setSelectedGroups(groups);
    // Pre-assign suppliers by CFC matching for each selected group
    const newAssignments: SupplierAssignment = {};
    for (const groupName of groups) {
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
    setCurrentStep(1);
  }

  function handleSuppliersNext(updated: SupplierAssignment) {
    setAssignments(updated);
    setCurrentStep(2);
  }

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
                  ? "bg-primary text-primary-foreground"
                  : i < currentStep
                    ? "bg-primary/10 text-primary cursor-pointer hover:bg-primary/20"
                    : "bg-muted text-muted-foreground"
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
            {i < STEPS.length - 1 && <div className="h-px w-8 bg-border" />}
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
        <SupplierAssignmentStep
          lots={lots.filter((l) => selectedGroups.includes(l.name))}
          suppliers={suppliers}
          assignments={assignments}
          onBack={() => setCurrentStep(0)}
          onNext={handleSuppliersNext}
        />
      )}
      {currentStep === 2 && (
        <SendPreviewStep
          submissionId={submissionId}
          lots={lots.filter((l) => selectedGroups.includes(l.name))}
          suppliers={suppliers}
          assignments={assignments}
          onBack={() => setCurrentStep(1)}
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
