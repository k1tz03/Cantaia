"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { EditableCell } from "./EditableCell";
import type { ExtractedPosition } from "./types";

export function SortableRow({
  position,
  editingCell,
  onStartEdit,
  onCellEdit,
  onDelete,
  confidenceColor,
  deleteLabel,
}: {
  position: ExtractedPosition;
  editingCell: { row: number; col: string } | null;
  onStartEdit: (col: string) => void;
  onCellEdit: (col: string, value: string) => void;
  onDelete: () => void;
  confidenceColor: (c: number) => string;
  deleteLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: position.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : ("auto" as any),
  };

  const pos = position;

  return (
    <tr
      ref={setNodeRef}
      style={style}
      data-position-id={pos.id}
      className={`text-sm border-b border-border ${isDragging ? "bg-brand/5" : pos.flags.length > 0 ? "bg-amber-500/10/50" : "hover:bg-muted"} ${pos.is_new ? "bg-green-500/10/30" : ""}`}
    >
      {/* Drag handle */}
      <td className="w-[36px] px-1">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-muted-foreground transition-colors"
          aria-label="Reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </td>

      <EditableCell
        value={pos.position_number}
        isEditing={editingCell?.col === "position_number"}
        onStartEdit={() => onStartEdit("position_number")}
        onSave={(v) => onCellEdit("position_number", v)}
        className="px-3 py-2 font-mono text-xs text-muted-foreground"
      />
      <EditableCell
        value={pos.can_code || ""}
        isEditing={editingCell?.col === "can_code"}
        onStartEdit={() => onStartEdit("can_code")}
        onSave={(v) => onCellEdit("can_code", v)}
        className="px-3 py-2 font-mono text-xs text-muted-foreground"
      />
      <EditableCell
        value={pos.description}
        isEditing={editingCell?.col === "description"}
        onStartEdit={() => onStartEdit("description")}
        onSave={(v) => onCellEdit("description", v)}
        className="px-3 py-2 text-foreground"
      />
      <EditableCell
        value={pos.quantity != null ? String(pos.quantity) : ""}
        isEditing={editingCell?.col === "quantity"}
        onStartEdit={() => onStartEdit("quantity")}
        onSave={(v) => onCellEdit("quantity", v)}
        className="px-3 py-2 text-right text-muted-foreground"
        inputType="number"
      />
      <EditableCell
        value={pos.unit}
        isEditing={editingCell?.col === "unit"}
        onStartEdit={() => onStartEdit("unit")}
        onSave={(v) => onCellEdit("unit", v)}
        className="px-3 py-2 text-center text-xs text-muted-foreground"
      />
      <EditableCell
        value={pos.unit_price != null ? String(pos.unit_price) : ""}
        isEditing={editingCell?.col === "unit_price"}
        onStartEdit={() => onStartEdit("unit_price")}
        onSave={(v) => onCellEdit("unit_price", v)}
        className="px-3 py-2 text-right text-muted-foreground"
        inputType="number"
      />
      <EditableCell
        value={pos.total != null ? String(pos.total) : ""}
        isEditing={editingCell?.col === "total"}
        onStartEdit={() => onStartEdit("total")}
        onSave={(v) => onCellEdit("total", v)}
        className="px-3 py-2 text-right font-medium text-foreground"
        inputType="number"
      />
      <td className="px-3 py-2 text-center">
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${confidenceColor(pos.confidence)}`}
        >
          {Math.round(pos.confidence * 100)}%
        </span>
      </td>
      <td className="px-1 py-2">
        <button
          onClick={onDelete}
          className="p-1 text-muted-foreground hover:text-red-500 rounded transition-colors"
          title={deleteLabel}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}
