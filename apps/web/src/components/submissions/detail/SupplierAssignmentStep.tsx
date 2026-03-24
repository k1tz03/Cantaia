"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Check,
  Zap,
  Users,
} from "lucide-react";
import type { SubmissionLot, Supplier } from "./shared";
import type { SupplierAssignment } from "./PriceRequestWizard";

interface SupplierAssignmentStepProps {
  lots: SubmissionLot[];
  suppliers: Supplier[];
  assignments: SupplierAssignment;
  onBack: () => void;
  onNext: (assignments: SupplierAssignment) => void;
}

export function SupplierAssignmentStep({
  lots,
  suppliers,
  assignments: initial,
  onBack,
  onNext,
}: SupplierAssignmentStepProps) {
  const [assignments, setAssignments] =
    useState<SupplierAssignment>(initial);
  const [expandedGroup, setExpandedGroup] = useState<string>(
    lots[0]?.name || ""
  );
  const [showAllSuppliers, setShowAllSuppliers] = useState<
    Record<string, boolean>
  >({});

  function toggleSupplier(groupName: string, supplierId: string) {
    setAssignments((prev) => {
      const current = prev[groupName] || [];
      const next = current.includes(supplierId)
        ? current.filter((id) => id !== supplierId)
        : [...current, supplierId];
      return { ...prev, [groupName]: next };
    });
  }

  function getAssignedSuppliers(groupName: string): string[] {
    return assignments[groupName] || [];
  }

  function isConfigured(groupName: string): boolean {
    return (assignments[groupName] || []).length > 0;
  }

  const configuredCount = lots.filter((l) => isConfigured(l.name)).length;

  // Split suppliers into recommended (pre-assigned by AI matching) and others
  function getRecommended(groupName: string): Supplier[] {
    const ids = initial[groupName] || [];
    return suppliers.filter((s) => ids.includes(s.id));
  }

  function getOthers(groupName: string): Supplier[] {
    const ids = initial[groupName] || [];
    return suppliers.filter((s) => !ids.includes(s.id));
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[#FAFAFA]">
          Attribuer les fournisseurs
        </h3>
        <p className="text-sm text-[#71717A]">
          {configuredCount}/{lots.length} groupes configures — L&apos;IA a
          pre-selectionne les fournisseurs les plus pertinents
        </p>
      </div>

      <div className="space-y-2">
        {lots.map((lot) => {
          const isExpanded = expandedGroup === lot.name;
          const assigned = getAssignedSuppliers(lot.name);
          const recommended = getRecommended(lot.name);
          const others = getOthers(lot.name);
          const showOthers = showAllSuppliers[lot.name] || false;

          return (
            <div
              key={lot.id}
              className="rounded-lg border border-[#27272A] overflow-hidden"
            >
              {/* Group header */}
              <button
                onClick={() =>
                  setExpandedGroup(isExpanded ? "" : lot.name)
                }
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#1C1C1F]"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-[#71717A]" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[#71717A]" />
                )}
                <span className="flex-1 text-sm font-medium text-[#FAFAFA]">
                  {lot.name}
                  {lot.cfc_code && (
                    <span className="ml-2 text-xs text-[#71717A] font-normal">
                      CFC {lot.cfc_code}
                    </span>
                  )}
                </span>
                <span
                  className={`text-xs font-medium ${
                    isConfigured(lot.name)
                      ? "text-green-400"
                      : "text-[#71717A]"
                  }`}
                >
                  {assigned.length} fournisseur
                  {assigned.length !== 1 ? "s" : ""}
                </span>
                {isConfigured(lot.name) && (
                  <Check className="h-4 w-4 text-green-500" />
                )}
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-[#27272A] px-4 py-3 space-y-3">
                  {/* Recommended suppliers */}
                  {recommended.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-[#71717A] uppercase tracking-wide mb-2">
                        Recommandes par l&apos;IA
                      </p>
                      <div className="space-y-1.5">
                        {recommended.map((s) => (
                          <SupplierRow
                            key={s.id}
                            supplier={s}
                            isSelected={assigned.includes(s.id)}
                            isRecommended
                            onToggle={() =>
                              toggleSupplier(lot.name, s.id)
                            }
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Other suppliers */}
                  {others.length > 0 && (
                    <div>
                      <button
                        onClick={() =>
                          setShowAllSuppliers((prev) => ({
                            ...prev,
                            [lot.name]: !showOthers,
                          }))
                        }
                        className="inline-flex items-center gap-1 text-xs text-[#F97316] hover:underline"
                      >
                        <Users className="h-3 w-3" />
                        {showOthers
                          ? "Masquer les autres"
                          : `+ ${others.length} autre${others.length !== 1 ? "s" : ""} fournisseur${others.length !== 1 ? "s" : ""}`}
                      </button>
                      {showOthers && (
                        <div className="mt-2 space-y-1.5">
                          {others.map((s) => (
                            <SupplierRow
                              key={s.id}
                              supplier={s}
                              isSelected={assigned.includes(s.id)}
                              isRecommended={false}
                              onToggle={() =>
                                toggleSupplier(lot.name, s.id)
                              }
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Empty state */}
                  {recommended.length === 0 && others.length === 0 && (
                    <p className="text-sm text-[#71717A] text-center py-4">
                      Aucun fournisseur disponible
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg border border-[#27272A] px-5 py-2.5 text-sm font-medium text-[#FAFAFA] hover:bg-[#1C1C1F]"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>
        <button
          onClick={() => onNext(assignments)}
          disabled={configuredCount === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-[#F97316] px-5 py-2.5 text-sm font-medium text-[#F97316]-foreground hover:bg-[#EA580C] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Suivant
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SupplierRow({
  supplier,
  isSelected,
  isRecommended,
  onToggle,
}: {
  supplier: Supplier;
  isSelected: boolean;
  isRecommended: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 rounded-md border p-3 text-left transition-colors ${
        isSelected
          ? "border-[#F97316] bg-[#F97316]/5"
          : "border-[#27272A] hover:bg-[#1C1C1F]"
      }`}
    >
      <div
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          isSelected
            ? "border-[#F97316] bg-[#F97316] text-white"
            : "border-[#27272A]"
        }`}
      >
        {isSelected && <Check className="h-2.5 w-2.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#FAFAFA] truncate">
            {supplier.company_name}
          </span>
          {isRecommended && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400">
              <Zap className="h-2.5 w-2.5" /> Recommande
            </span>
          )}
        </div>
        <p className="text-xs text-[#71717A] truncate">
          {supplier.contact_name ? `${supplier.contact_name} · ` : ""}
          {supplier.email || ""}
        </p>
      </div>
      {supplier.overall_score != null && supplier.overall_score > 0 && (
        <span className="text-xs font-medium text-[#71717A] shrink-0">
          {supplier.overall_score}/100
        </span>
      )}
    </button>
  );
}
