"use client";

import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Hook for independent form sections with dirty state, saving, and toast.
 * Used by settings page (profile, notifications, outlook, etc.)
 * and admin branding page.
 */
export function useFormSection<T extends Record<string, unknown>>(
  initial: T,
  saveFn: (data: T) => Promise<void>
) {
  const [data, setData] = useState<T>(initial);
  const [saved, setSaved] = useState<T>(initial);
  const [saving, setSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isDirty = JSON.stringify(data) !== JSON.stringify(saved);

  const update = useCallback((partial: Partial<T>) => {
    setData((prev) => ({ ...prev, ...partial }));
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setData(saved);
    setError(null);
  }, [saved]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await saveFn(data);
      setSaved(data);
      setShowSaved(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShowSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }, [data, saveFn]);

  // Sync when initial changes (e.g. data loaded from server)
  const setInitial = useCallback((newInitial: T) => {
    setData(newInitial);
    setSaved(newInitial);
  }, []);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { data, update, isDirty, saving, showSaved, error, save, reset, setInitial };
}
