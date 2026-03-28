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
 * Déclenche une vérification manuelle des mises à jour.
 * Affiche une notification système si une mise à jour est disponible.
 * No-op dans le navigateur.
 */
export async function checkForDesktopUpdates(): Promise<boolean> {
  if (!isTauriDesktop()) return false;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("check_for_updates");
  } catch {
    return false;
  }
}
