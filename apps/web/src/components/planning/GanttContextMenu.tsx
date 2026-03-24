"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
  separator?: boolean;
  disabled?: boolean;
  /** Render custom content instead of the standard item (for color pickers, etc.) */
  render?: () => React.ReactNode;
}

export interface GanttContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GanttContextMenu({
  x,
  y,
  items,
  onClose,
}: GanttContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const longPressTimer = useRef<number | null>(null);

  // Adjust position if near viewport edge
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let adjX = x;
    let adjY = y;

    if (x + rect.width > viewportW - 8) {
      adjX = x - rect.width;
    }
    if (y + rect.height > viewportH - 8) {
      adjY = y - rect.height;
    }

    // Clamp to viewport
    adjX = Math.max(8, adjX);
    adjY = Math.max(8, adjY);

    setPosition({ x: adjX, y: adjY });
  }, [x, y]);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Clean up long press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, []);

  const handleItemClick = useCallback(
    (item: ContextMenuItem) => {
      if (item.disabled) return;
      item.onClick();
      onClose();
    },
    [onClose],
  );

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.1, ease: "easeOut" }}
        className="fixed z-50 min-w-[180px] max-w-[280px] bg-[#0F0F11] rounded-lg shadow-xl border border-[#27272A] py-1 overflow-hidden"
        style={{ left: position.x, top: position.y }}
      >
        {items.map((item, idx) => (
          <React.Fragment key={idx}>
            {/* Separator line */}
            {item.separator && idx > 0 && (
              <div className="my-1 h-px bg-[#27272A]" />
            )}

            {/* Custom render */}
            {item.render ? (
              item.render()
            ) : (
              <button
                type="button"
                onClick={() => handleItemClick(item)}
                disabled={item.disabled}
                className={[
                  "flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm transition-colors",
                  item.disabled
                    ? "text-[#71717A] cursor-not-allowed"
                    : item.variant === "danger"
                      ? "text-red-600 hover:bg-red-50"
                      : "text-[#FAFAFA] hover:bg-[#F97316]/10 hover:text-[#F97316]",
                ].join(" ")}
              >
                {item.icon && (
                  <span className="w-5 h-5 flex items-center justify-center shrink-0">
                    {item.icon}
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </button>
            )}
          </React.Fragment>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Color Picker helper ─────────────────────────────────────────────────────

interface ColorPickerRowProps {
  colors: readonly string[];
  currentColor: string;
  onSelect: (color: string) => void;
  onClose: () => void;
}

export function ColorPickerRow({
  colors,
  currentColor,
  onSelect,
  onClose,
}: ColorPickerRowProps) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => {
            onSelect(color);
            onClose();
          }}
          className={[
            "w-5 h-5 rounded-full border-2 transition-transform hover:scale-125",
            color === currentColor
              ? "border-foreground ring-1 ring-border"
              : "border-white shadow-sm",
          ].join(" ")}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}
