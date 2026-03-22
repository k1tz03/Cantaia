"use client";

import { useState } from "react";
import { Package, ArrowRight, CheckSquare, Square, Check } from "lucide-react";
import type { SubmissionLot } from "./shared";
import { formatCHF } from "./shared";

interface BudgetGroup {
  group: string;
  total_median?: number;
}

interface GroupSelectionStepProps {
  lots: SubmissionLot[];
  budgetGroups?: BudgetGroup[];
  selectedGroups: string[];
  onNext: (groups: string[]) => void;
}

export function GroupSelectionStep({
  lots,
  budgetGroups,
  selectedGroups: initial,
  onNext,
}: GroupSelectionStepProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initial));

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === lots.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(lots.map((l) => l.name)));
    }
  }

  function getBudget(groupName: string): number | undefined {
    return budgetGroups?.find((b) => b.group === groupName)?.total_median;
  }

  const allSelected = selected.size === lots.length && lots.length > 0;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Selectionnez les groupes
          </h3>
          <p className="text-sm text-muted-foreground">
            Choisissez les groupes de postes pour lesquels demander des prix
          </p>
        </div>
        <button
          onClick={toggleAll}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
        >
          {allSelected ? (
            <CheckSquare className="h-4 w-4 text-primary" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          {allSelected ? "Tout deselectionner" : "Tout selectionner"}
        </button>
      </div>

      <div className="space-y-2">
        {lots.map((lot) => {
          const isSelected = selected.has(lot.name);
          const budget = getBudget(lot.name);
          return (
            <button
              key={lot.id}
              onClick={() => toggle(lot.name)}
              className={`w-full flex items-center gap-4 rounded-lg border p-4 text-left transition-colors ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border"
                }`}
              >
                {isSelected && <Check className="h-3 w-3" />}
              </div>
              <Package className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {lot.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {lot.cfc_code && (
                    <span className="mr-2">CFC {lot.cfc_code}</span>
                  )}
                </p>
              </div>
              {budget != null && budget > 0 && (
                <span className="text-sm font-medium text-muted-foreground">
                  {formatCHF(budget)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {lots.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Package className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Aucun groupe de postes disponible
          </p>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          onClick={() => onNext(Array.from(selected))}
          disabled={selected.size === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Suivant
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
