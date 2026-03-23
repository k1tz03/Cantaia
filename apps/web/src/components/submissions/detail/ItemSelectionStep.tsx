"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Check } from "lucide-react";

interface Item {
  id: string;
  item_number: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  material_group: string;
  cfc_code: string | null;
}

interface ItemSelectionStepProps {
  items: Item[];
  selectedGroups: string[];
  selectedItemIds: Set<string>;
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
  onToggleItem,
  onSelectAllGroup,
  onDeselectAllGroup,
  onBack,
  onNext,
}: ItemSelectionStepProps) {
  const [openGroup, setOpenGroup] = useState<string>(selectedGroups[0] || "");

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
        <h3 className="text-base font-semibold text-foreground">Selectionnez les postes</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Affinez votre selection — decochez les postes que vous ne souhaitez pas inclure dans la demande de prix.
          <span className="ml-2 font-medium text-foreground">{totalSelected}/{totalAvailable} postes selectionnes</span>
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
            <div key={group} className="rounded-lg border border-border overflow-hidden">
              {/* Group header */}
              <div
                className="flex items-center gap-3 px-4 py-3 bg-muted/30 cursor-pointer hover:bg-muted/50"
                onClick={() => setOpenGroup(isOpen ? "" : group)}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleGroupSelect(group); }}
                  className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                    fullySelected ? "bg-primary border-primary text-primary-foreground" :
                    partiallySelected ? "bg-primary/20 border-primary" : "border-border"
                  }`}
                >
                  {(fullySelected || partiallySelected) && <Check className="h-3 w-3" />}
                </button>
                <div className="flex-1">
                  <span className="text-sm font-medium text-foreground">{group}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {selectedCount}/{groupItems.length} postes
                  </span>
                </div>
                {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>

              {/* Items list */}
              {isOpen && (
                <div className="divide-y divide-border">
                  {groupItems.map(item => (
                    <label
                      key={item.id}
                      className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/20 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedItemIds.has(item.id)}
                        onChange={() => onToggleItem(item.id)}
                        className="mt-0.5 h-4 w-4 rounded border-border text-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {item.item_number && (
                            <span className="text-xs font-mono text-muted-foreground">{item.item_number}</span>
                          )}
                          {item.cfc_code && (
                            <span className="text-xs text-primary/70">CFC {item.cfc_code}</span>
                          )}
                        </div>
                        <p className="text-sm text-foreground line-clamp-2">{item.description}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {item.quantity != null && (
                          <span className="text-xs text-muted-foreground">{item.quantity} {item.unit || ""}</span>
                        )}
                      </div>
                    </label>
                  ))}
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
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          &larr; Retour
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={totalSelected === 0}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Suivant &rarr;
        </button>
      </div>
    </div>
  );
}
