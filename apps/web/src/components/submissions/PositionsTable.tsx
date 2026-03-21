"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  type SensorDescriptor,
  type SensorOptions,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { FileSpreadsheet, Plus } from "lucide-react";
import { SortableRow } from "./SortableRow";
import type { ExtractedPosition } from "./types";

// ---------------------------------------------------------------------------
// InsertLineButton -- Appears between rows on hover
// ---------------------------------------------------------------------------

function InsertLineButton({
  onInsert,
  index,
  label,
}: {
  onInsert: (atIndex: number) => void;
  index: number;
  label: string;
}) {
  return (
    <tr className="group/insert h-0">
      <td colSpan={10} className="p-0 relative">
        <div className="absolute inset-x-0 -top-px flex items-center justify-center opacity-0 group-hover/insert:opacity-100 transition-opacity z-10">
          <button
            onClick={() => onInsert(index)}
            className="flex items-center gap-1.5 px-3 py-0.5 bg-brand text-white text-xs rounded-full shadow-sm hover:bg-brand/90 transition-colors -translate-y-1/2"
          >
            <Plus className="h-3 w-3" />
            {label}
          </button>
        </div>
        <div className="absolute inset-x-4 -top-px h-px bg-transparent group-hover/insert:bg-brand/30 transition-colors" />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// PositionsTable -- DnD sortable table of extracted positions
// ---------------------------------------------------------------------------

export function PositionsTable({
  positions,
  sensors,
  editingCell,
  onDragEnd,
  onInsertAt,
  onStartEdit,
  onCellEdit,
  onDeleteRow,
}: {
  positions: ExtractedPosition[];
  sensors: SensorDescriptor<SensorOptions>[];
  editingCell: { row: number; col: string } | null;
  onDragEnd: (event: DragEndEvent) => void;
  onInsertAt: (atIndex: number) => void;
  onStartEdit: (row: number, col: string) => void;
  onCellEdit: (posId: string, col: string, value: string) => void;
  onDeleteRow: (posId: string) => void;
}) {
  const t = useTranslations("products.submissions");

  const confidenceColor = (c: number) => {
    if (c >= 0.9) return "bg-green-500/10 text-green-700 dark:text-green-400";
    if (c >= 0.7) return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    return "bg-red-500/10 text-red-700 dark:text-red-400";
  };

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-1">
          {t("no_positions")}
        </h3>
      </div>
    );
  }

  return (
    <div className="bg-background border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={positions.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <table className="w-full min-w-[850px]">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="w-[36px]" />
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase w-[120px]">
                    {t("position_number")}
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase w-[100px]">
                    {t("can_code")}
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase">
                    {t("description_col")}
                  </th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase w-[90px]">
                    {t("quantity")}
                  </th>
                  <th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase w-[60px]">
                    {t("unit")}
                  </th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase w-[110px]">
                    {t("unit_price")}
                  </th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase w-[110px]">
                    {t("total")}
                  </th>
                  <th className="text-center px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase w-[70px]">
                    {t("confidence")}
                  </th>
                  <th className="w-[40px]" />
                </tr>
              </thead>
              <tbody>
                {positions.map((pos, idx) => (
                  <React.Fragment key={pos.id}>
                    <InsertLineButton
                      onInsert={onInsertAt}
                      index={idx}
                      label={t("insert_line_here")}
                    />
                    <SortableRow
                      position={pos}
                      editingCell={editingCell}
                      onStartEdit={(col) => onStartEdit(idx, col)}
                      onCellEdit={(col, value) =>
                        onCellEdit(pos.id, col, value)
                      }
                      onDelete={() => onDeleteRow(pos.id)}
                      confidenceColor={confidenceColor}
                      deleteLabel={t("delete_row")}
                    />
                  </React.Fragment>
                ))}
                <InsertLineButton
                  onInsert={onInsertAt}
                  index={positions.length}
                  label={t("insert_line_here")}
                />
              </tbody>
            </table>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
