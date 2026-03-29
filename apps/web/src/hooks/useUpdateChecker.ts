"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { isTauriDesktop } from "@cantaia/core/platform";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UpdateStatus =
  | "idle"
  | "available"
  | "downloading"
  | "ready"
  | "error";

export interface UpdateState {
  status: UpdateStatus;
  newVersion: string | null;
  progress: number; // 0-100, desktop seulement
  error: string | null;
}

const INITIAL_STATE: UpdateState = {
  status: "idle",
  newVersion: null,
  progress: 0,
  error: null,
};

const DISMISS_KEY = "cantaia_dismissed_version";
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min pour le web

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUpdateChecker() {
  const [state, setState] = useState<UpdateState>(INITIAL_STATE);
  const initialBuildId = useRef<string | null>(null);
  const isDesktop = useRef(false);

  // ── Web : polling /api/version ──────────────────────────────────────────────
  const checkWebVersion = useCallback(async () => {
    try {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return;
      const { version, buildId } = (await res.json()) as {
        version: string;
        buildId: string;
      };

      if (!initialBuildId.current) {
        // Premier appel → stocker la version actuelle
        initialBuildId.current = buildId;
        return;
      }

      // Nouvelle version si buildId différent du démarrage
      if (buildId !== initialBuildId.current) {
        const dismissed = localStorage.getItem(DISMISS_KEY);
        if (dismissed === buildId) return; // déjà ignoré
        setState({ status: "available", newVersion: version, progress: 0, error: null });
      }
    } catch {
      // Silencieux — pas critique
    }
  }, []);

  // ── Desktop : check via Tauri updater ──────────────────────────────────────
  const checkDesktopVersion = useCallback(async () => {
    try {
      const { checkForDesktopUpdatesInfo } = await import("@/lib/tauri");
      const info = await checkForDesktopUpdatesInfo();
      if (info.available && info.version) {
        const dismissed = localStorage.getItem(DISMISS_KEY);
        if (dismissed === info.version) return;
        setState({ status: "available", newVersion: info.version, progress: 0, error: null });
      }
    } catch {
      // Updater non disponible (dev sans pubkey)
    }
  }, []);

  // ── Initialisation ─────────────────────────────────────────────────────────
  useEffect(() => {
    isDesktop.current = isTauriDesktop();

    if (isDesktop.current) {
      // Desktop : check au démarrage + écoute events de progression
      checkDesktopVersion();
      setupDesktopProgressListener();
    } else {
      // Web : check immédiat + polling
      checkWebVersion();
      const timer = setInterval(checkWebVersion, POLL_INTERVAL_MS);
      return () => clearInterval(timer);
    }
  }, [checkWebVersion, checkDesktopVersion]);

  // ── Écoute progression téléchargement (desktop) ───────────────────────────
  function setupDesktopProgressListener() {
    import("@tauri-apps/api/event")
      .then(({ listen }) => {
        listen<number>("update:progress", (event) => {
          setState((prev) => ({
            ...prev,
            status: "downloading",
            progress: event.payload,
          }));
        });
        listen("update:complete", () => {
          setState((prev) => ({ ...prev, status: "ready", progress: 100 }));
        });
      })
      .catch(() => {});
  }

  // ── Actions publiques ──────────────────────────────────────────────────────

  const startUpdate = useCallback(async () => {
    if (isDesktop.current) {
      // Desktop : lance le téléchargement + installation via Tauri
      setState((prev) => ({ ...prev, status: "downloading", progress: 0 }));
      try {
        const { installDesktopUpdate } = await import("@/lib/tauri");
        await installDesktopUpdate();
        // lib.rs appelle app.restart() → l'app se relance automatiquement
      } catch (e) {
        setState({
          status: "error",
          newVersion: state.newVersion,
          progress: 0,
          error: e instanceof Error ? e.message : "Erreur inconnue",
        });
      }
    } else {
      // Web : simple rechargement de page
      window.location.reload();
    }
  }, [state.newVersion]);

  const dismissUpdate = useCallback(() => {
    if (state.newVersion) {
      localStorage.setItem(DISMISS_KEY, state.newVersion);
    }
    setState(INITIAL_STATE);
  }, [state.newVersion]);

  return { state, startUpdate, dismissUpdate };
}
