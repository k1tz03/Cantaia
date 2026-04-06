"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Check, Send } from "lucide-react";

interface Item {
  id: string;
  item_number: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  material_group: string;
  cfc_code: string | null;
}

interface ExistingRequest {
  id: string;
  material_group: string;
  items_requested: Array<{ id?: string; item_number?: string; description?: string }> | null;
  sent_at: string | null;
  status: string;
  suppliers?: { company_name: string } | null;
  supplier_name_manual?: string | null;
}

interface ItemSelectionStepProps {
  items: Item[];
  selectedGroups: string[];
  selectedItemIds: Set<string>;
  existingRequests?: ExistingRequest[];
  onToggleItem: (itemId: string) => void;
  onSelectAllGroup: (group: string) => void;
  onDeselectAllGroup: (group: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function ItemSelectionStep({
  items,
  selectedGroups,
  selectedItemIds,
  existingRequests,
  onToggleItem,
  onSelectAllGroup,
  onDeselectAllGroup,
  onBack,
  onNext,
}: ItemSelectionStepProps) {
  const [openGroup, setOpenGroup] = useState<string>(selectedGroups[0] || "");

  // Build a lookup: item_number → { sent_at, suppliers[] } for items that already have price requests
  const requestedItemsMap = useMemo(() => {
    const map = new Map<string, { sent_at: string; supplier_names: string[] }>();
    if (!existingRequests) return map;
    for (const req of existingRequests) {
      if (!req.sent_at || !req.items_requested) continue;
      const supplierName = req.suppliers?.company_name || req.supplier_name_manual || "Fournisseur";
      for (const ri of req.items_requested) {
        const key = ri.item_number || ri.id;
        if (!key) continue;
        const existing = map.get(key);
        if (existing) {
          if (!existing.supplier_names.includes(supplierName)) {
            existing.supplier_names.push(supplierName);
          }
        } else {
          map.set(key, { sent_at: req.sent_at, supplier_names: [supplierName] });
        }
      }
    }
    return map;
  }, [existingRequests]);

  function getItemRequestInfo(item: Item) {
    if (!item.item_number) return null;
    return requestedItemsMap.get(item.item_number) || requestedItemsMap.get(item.id) || null;
  }

  // Group items by material_group, only for selected groups
  const groupedItems: Record<string, Item[]> = {};
  for (const item of items) {
    if (selectedGroups.includes(item.material_group)) {
      if (!groupedItems[item.material_group]) groupedItems[item.material_group] = [];
      groupedItems[item.material_group].push(item);
    }
  }

  const totalSelected = selectedItemIds.size;
  const totalAvailable = Object.values(groupedItems).flat().length;

  function isGroupFullySelected(group: string) {
    const groupItems = groupedItems[group] || [];
    return groupItems.length > 0 && groupItems.every(item => selectedItemIds.has(item.id));
  }

  function isGroupPartiallySelected(group: string) {
    const groupItems = groupedItems[group] || [];
    const selected = groupItems.filter(item => selectedItemIds.has(item.id)).length;
    return selected > 0 && selected < groupItems.length;
  }

  function toggleGroupSelect(group: string) {
    if (isGroupFullySelected(group)) {
      onDeselectAllGroup(group);
    } else {
      onSelectAllGroup(group);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base font-semibold text-[#FAFAFA]">Selectionnez les postes</h3>
        <p className="text-sm text-[#71717A] mt-1">
          Affinez votre selection — decochez les postes que vous ne souhaitez pas inclure dans la demande de prix.
          <span className="ml-2 font-medium text-[#FAFAFA]">{totalSelected}/{totalAvailable} postes selectionnes</span>
        </p>
      </div>

      <div className="space-y-2 mb-6">
        {selectedGroups.map(group => {
          const groupItems = groupedItems[group] || [];
          const selectedCount = groupItems.filter(item => selectedItemIds.has(item.id)).length;
          const isOpen = openGroup === group;
          const fullySelected = isGroupFullySelected(group);
          const partiallySelected = isGroupPartiallySelected(group);

          return (
            <div key={group} className="rounded-lg border border-[#27272A] overflow-hidden">
              {/* Group header */}
              <div
                className="flex items-center gap-3 px-4 py-3 bg-[#27272A]/30 cursor-pointer hover:bg-[#1C1C1F]"
                onClick={() => setOpenGroup(isOpen ? "" : group)}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleGroupSelect(group); }}
                  className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                    fullySelected ? "bg-[#F97316] border-[#F97316] text-white" :
                    partiallySelected ? "bg-[#F97316]/20 border-[#F97316]" : "border-[#27272A]"
                  }`}
                >
                  {(fullySelected || partiallySelected) && <Check className="h-3 w-3" />}
                </button>
                <div className="flex-1">
                  <span className="text-sm font-medium text-[#FAFAFA]">{group}</span>
                  <span className="text-xs text-[#71717A] ml-2">
                    {selectedCount}/{groupItems.length} postes
                  </span>
                </div>
                {isOpen ? <ChevronUp className="h-4 w-4 text-[#71717A]" /> : <ChevronDown className="h-4 w-4 text-[#71717A]" />}
              </div>

              {/* Items list */}
              {isOpen && (
                <div className="divide-y divide-border">
                  {groupItems.map(item => {
                    const requestInfo = getItemRequestInfo(item);
                    return (
                      <label
                        key={item.id}
                        className={`flex items-start gap-3 px-4 py-2.5 hover:bg-[#1C1C1F] cursor-pointer ${requestInfo ? "bg-blue-500/5" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedItemIds.has(item.id)}
                          onChange={() => onToggleItem(item.id)}
                          className="mt-0.5 h-4 w-4 rounded border-[#27272A] text-[#F97316]"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {item.item_number && (
                              <span className="text-xs font-mono text-[#71717A]">{item.item_number}</span>
                            )}
                            {item.cfc_code && (
                              <span className="text-xs text-[#F97316]/70">CFC {item.cfc_code}</span>
                            )}
                          </div>
                          <p className="text-sm text-[#FAFAFA] line-clamp-2">{item.description}</p>
                          {requestInfo && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <Send className="h-3 w-3 text-blue-400" />
                              <span className="text-[11px] text-blue-400">
                                Demandé le {new Date(requestInfo.sent_at).toLocaleDateString("fr-CH", { day: "numeric", month: "short", year: "numeric" })}
                                {" — "}
                                {requestInfo.supplier_names.length === 1
                                  ? requestInfo.supplier_names[0]
                                  : `${requestInfo.supplier_names.length} fournisseurs`}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          {item.quantity != null && (
                            <span className="text-xs text-[#71717A]">{item.quantity} {item.unit || ""}</span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-[#27272A] px-4 py-2 text-sm font-medium text-[#FAFAFA] hover:bg-[#1C1C1F]"
        >
          &larr; Retour
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={totalSelected === 0}
          className="rounded-lg bg-[#F97316] px-4 py-2 text-sm font-medium text-[#F97316]-foreground hover:bg-[#EA580C] disabled:opacity-50"
        >
          Suivant &rarr;
        </button>
      </div>
    </div>
  );
}
