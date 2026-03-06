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
    if (c >= 0.9) return "bg-green-100 text-green-700";
    if (c >= 0.7) return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-700";
  };

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <FileSpreadsheet className="h-8 w-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">
          {t("no_positions")}
        </h3>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
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
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="w-[36px]" />
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase w-[120px]">
                    {t("position_number")}
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase w-[100px]">
                    {t("can_code")}
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-500 uppercase">
                    {t("description_col")}
                  </th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 uppercase w-[90px]">
                    {t("quantity")}
                  </th>
                  <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500 uppercase w-[60px]">
                    {t("unit")}
                  </th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 uppercase w-[110px]">
                    {t("unit_price")}
                  </th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-gray-500 uppercase w-[110px]">
                    {t("total")}
                  </th>
                  <th className="text-center px-3 py-2.5 text-xs font-medium text-gray-500 uppercase w-[70px]">
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
