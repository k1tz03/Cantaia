/**
 * Tauri native helpers — wrappers conditionnels.
 *
 * Ces fonctions fonctionnent dans les deux contextes :
 *   • Dans l'app Tauri desktop  → utilise les APIs natives (dialog, notification)
 *   • Dans le navigateur web    → fallback vers les APIs navigateur (file-saver, etc.)
 *
 * Import uniquement côté client (ne pas utiliser dans les Server Components).
 */

import { isTauriDesktop } from "@cantaia/core/platform";

// ─── Sauvegarde de fichier ────────────────────────────────────────────────────

/**
 * Sauvegarde un Blob via le dialog de sauvegarde natif Windows dans l'app desktop,
 * ou via le téléchargement navigateur sur le web.
 *
 * Remplace les appels directs à `file-saver` dans les composants d'export.
 *
 * @example
 * const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats..." });
 * await saveFileWithDialog("export.xlsx", blob);
 */
export async function saveFileWithDialog(
  filename: string,
  blob: Blob
): Promise<void> {
  if (isTauriDesktop()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const buffer = await blob.arrayBuffer();
      await invoke("save_file", {
        filename,
        content: Array.from(new Uint8Array(buffer)),
      });
      return;
    } catch (e) {
      // Fallback vers le navigateur si la commande Tauri échoue
      console.warn("[Tauri] save_file failed, falling back to browser save", e);
    }
  }

  // Fallback navigateur — téléchargement natif via un <a> temporaire
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 100);
}

// ─── Export de fichier (fetch + save) ────────────────────────────────────────

/**
 * Télécharge un fichier depuis une route API et le sauvegarde.
 * Fonctionne dans le navigateur (download classique) et dans l'app Tauri (dialog natif).
 *
 * Remplace les patterns `window.open()` et `fetch → blob → <a>.click()` qui ne
 * fonctionnent pas correctement dans la WebView Tauri.
 *
 * @example
 * // GET (ex: PDF export)
 * await exportFile(`/api/pv/${id}/export-pdf`, { fallbackFilename: "pv.pdf" });
 *
 * // POST (ex: DOCX export)
 * await exportFile("/api/visits/export-report", {
 *   method: "POST",
 *   body: { visit_id: "xxx" },
 *   fallbackFilename: "rapport.docx",
 * });
 */
export async function exportFile(
  url: string,
  options?: {
    method?: "GET" | "POST";
    body?: unknown;
    fallbackFilename?: string;
  },
): Promise<void> {
  const {
    method = "GET",
    body,
    fallbackFilename = "export.pdf",
  } = options || {};

  const fetchOptions: RequestInit = { method };
  if (body) {
    fetchOptions.headers = { "Content-Type": "application/json" };
    fetchOptions.body = JSON.stringify(body);
  }

  const res = await fetch(url, fetchOptions);
  if (!res.ok) {
    throw new Error(`Export failed: ${res.status} ${res.statusText}`);
  }

  const blob = await res.blob();

  // Extract filename from Content-Disposition header if available
  const disposition = res.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
  const filename = filenameMatch?.[1]?.trim() || fallbackFilename;

  await saveFileWithDialog(filename, blob);
}

// ─── Notifications système ────────────────────────────────────────────────────

/**
 * Affiche une notification système dans l'app desktop.
 * No-op dans le navigateur (les notifications push restent côté web).
 */
export async function showDesktopNotification(
  title: string,
  body: string
): Promise<void> {
  if (!isTauriDesktop()) return;

  try {
    const { sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    );
    await sendNotification({ title, body });
  } catch (e) {
    console.warn("[Tauri] Notification failed", e);
  }
}

// ─── Version de l'app ────────────────────────────────────────────────────────

/**
 * Retourne la version de l'app desktop (ex: "1.0.0").
 * Retourne null dans le navigateur.
 */
export async function getDesktopVersion(): Promise<string | null> {
  if (!isTauriDesktop()) return null;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string>("get_app_version");
  } catch {
    return null;
  }
}

// ─── Vérification des mises à jour ───────────────────────────────────────────

/**
 * Vérifie les mises à jour et retourne `{ available, version }`.
 * Retourne `{ available: false, version: null }` dans le navigateur.
 */
export async function checkForDesktopUpdatesInfo(): Promise<{
  available: boolean;
  version: string | null;
}> {
  if (!isTauriDesktop()) return { available: false, version: null };

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<{ available: boolean; version: string | null }>(
      "check_for_updates"
    );
  } catch {
    return { available: false, version: null };
  }
}

/**
 * Lance le téléchargement + installation de la mise à jour.
 * Le Rust émet des événements `update:progress` (0-100) et `update:complete`,
 * puis appelle `app.restart()` automatiquement.
 * No-op dans le navigateur.
 */
export async function installDesktopUpdate(): Promise<void> {
  if (!isTauriDesktop()) return;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("install_update");
  } catch (e) {
    console.warn("[Tauri] install_update failed", e);
    throw e;
  }
}

/**
 * @deprecated Utiliser checkForDesktopUpdatesInfo() à la place.
 */
export async function checkForDesktopUpdates(): Promise<boolean> {
  const info = await checkForDesktopUpdatesInfo();
  return info.available;
}
