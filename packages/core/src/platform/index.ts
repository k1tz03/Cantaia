/**
 * Platform detection utilities for Cantaia.
 * Detects whether the app is running in Tauri desktop (native filesystem access)
 * or in a standard web browser (ZIP download / cloud storage only).
 */

/**
 * Returns true if the app is running inside a Tauri desktop shell.
 * Uses the global `__TAURI__` or `__TAURI_INTERNALS__` object injected by Tauri.
 */
export function isTauriDesktop(): boolean {
  if (typeof window === "undefined") return false;
  return !!(
    (window as Record<string, unknown>).__TAURI__ ||
    (window as Record<string, unknown>).__TAURI_INTERNALS__
  );
}

/**
 * Returns the current platform mode for archiving.
 * - "desktop": Tauri desktop — can write directly to the local filesystem.
 * - "web": Standard browser — must use ZIP download or cloud sync.
 */
export function getArchiveMode(): "desktop" | "web" {
  return isTauriDesktop() ? "desktop" : "web";
}
