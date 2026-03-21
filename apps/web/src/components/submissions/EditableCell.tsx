"use client";

import React, { useState, useEffect } from "react";
import { Pencil } from "lucide-react";

export function EditableCell({
  value,
  isEditing,
  onStartEdit,
  onSave,
  className,
  inputType = "text",
}: {
  value: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onSave: (value: string) => void;
  className?: string;
  inputType?: "text" | "number";
}) {
  const [editValue, setEditValue] = useState(value);

  // Sync when value changes externally
  useEffect(() => {
    if (!isEditing) setEditValue(value);
  }, [value, isEditing]);

  if (isEditing) {
    return (
      <td className={className}>
        <input
          type="text"
          inputMode={inputType === "number" ? "decimal" : "text"}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => onSave(editValue)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave(editValue);
            if (e.key === "Escape") onSave(value);
          }}
          autoFocus
          className="w-full bg-background border border-brand rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </td>
    );
  }

  return (
    <td
      className={`${className} cursor-pointer hover:bg-primary/10 group/cell`}
      onClick={onStartEdit}
    >
      <div className="flex items-center gap-1">
        <span className="flex-1 truncate">{value || "—"}</span>
        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/cell:opacity-100 shrink-0" />
      </div>
    </td>
  );
}
