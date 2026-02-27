"use client";

import { useEffect, useCallback } from "react";

interface KeyboardShortcutHandlers {
  onNextEmail?: () => void;
  onPrevEmail?: () => void;
  onReadOk?: () => void;
  onReply?: () => void;
  onArchive?: () => void;
  onSnooze?: () => void;
  onSearch?: () => void;
  onEscape?: () => void;
}

export function useEmailKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger when typing in input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        // Only handle Escape in inputs
        if (e.key === "Escape" && handlers.onEscape) {
          handlers.onEscape();
          e.preventDefault();
        }
        return;
      }

      switch (e.key) {
        case "j":
        case "ArrowDown":
          if (handlers.onNextEmail) {
            handlers.onNextEmail();
            e.preventDefault();
          }
          break;
        case "k":
        case "ArrowUp":
          if (handlers.onPrevEmail) {
            handlers.onPrevEmail();
            e.preventDefault();
          }
          break;
        case "e":
          if (handlers.onReadOk) {
            handlers.onReadOk();
            e.preventDefault();
          }
          break;
        case "r":
          if (handlers.onReply) {
            handlers.onReply();
            e.preventDefault();
          }
          break;
        case "a":
          if (handlers.onArchive) {
            handlers.onArchive();
            e.preventDefault();
          }
          break;
        case "s":
          if (handlers.onSnooze) {
            handlers.onSnooze();
            e.preventDefault();
          }
          break;
        case "/":
          if (handlers.onSearch) {
            handlers.onSearch();
            e.preventDefault();
          }
          break;
        case "Escape":
          if (handlers.onEscape) {
            handlers.onEscape();
            e.preventDefault();
          }
          break;
      }
    },
    [handlers]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

export const SHORTCUT_MAP = [
  { key: "j / ↓", action: "shortcut_next" },
  { key: "k / ↑", action: "shortcut_prev" },
  { key: "e", action: "shortcut_read_ok" },
  { key: "r", action: "shortcut_reply" },
  { key: "a", action: "shortcut_archive" },
  { key: "s", action: "shortcut_snooze" },
  { key: "/", action: "shortcut_search" },
] as const;
