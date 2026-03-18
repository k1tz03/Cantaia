"use client";

import { useState, useCallback, useRef } from "react";

// ---------------------------------------------------------------------------
// Undo / Redo system for the Gantt chart
// ---------------------------------------------------------------------------

export interface UndoRedoAction {
  type: string; // 'update_task', 'add_task', 'delete_task', 'add_phase', etc.
  undo: () => void; // function to reverse the action
  redo: () => void; // function to re-apply the action
  description: string; // for debugging / tooltip: "Move task 'Coffrage' to 15.04"
}

export interface UseUndoRedoReturn {
  push: (action: UndoRedoAction) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoDescription: string | null;
  redoDescription: string | null;
  clear: () => void;
}

/**
 * Custom hook that manages an undo/redo stack.
 *
 * @param maxStack Maximum items to keep in the undo stack (default 50).
 *                 When exceeded the oldest entry is dropped.
 */
export default function useUndoRedo(maxStack = 50): UseUndoRedoReturn {
  // We use refs for the stacks to avoid stale closures in the undo/redo
  // functions that are captured inside UndoRedoAction callbacks.
  // A version counter forces React re-renders when the stacks change.
  const undoStackRef = useRef<UndoRedoAction[]>([]);
  const redoStackRef = useRef<UndoRedoAction[]>([]);
  const [, setVersion] = useState(0);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const push = useCallback(
    (action: UndoRedoAction) => {
      const stack = undoStackRef.current;
      stack.push(action);
      // Drop oldest entries when the stack exceeds maxStack
      if (stack.length > maxStack) {
        undoStackRef.current = stack.slice(stack.length - maxStack);
      }
      // Pushing a new action invalidates the redo stack
      redoStackRef.current = [];
      bump();
    },
    [maxStack, bump],
  );

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const action = stack.pop()!;
    action.undo();
    redoStackRef.current.push(action);
    bump();
  }, [bump]);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const action = stack.pop()!;
    action.redo();
    undoStackRef.current.push(action);
    bump();
  }, [bump]);

  const clear = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    bump();
  }, [bump]);

  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

  const undoDescription = canUndo
    ? undoStackRef.current[undoStackRef.current.length - 1].description
    : null;
  const redoDescription = canRedo
    ? redoStackRef.current[redoStackRef.current.length - 1].description
    : null;

  return {
    push,
    undo,
    redo,
    canUndo,
    canRedo,
    undoDescription,
    redoDescription,
    clear,
  };
}
