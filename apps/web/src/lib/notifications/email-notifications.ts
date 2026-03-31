/**
 * Service de notifications email côté navigateur.
 *
 * Utilise l'API Notification standard (pas de service worker / push server nécessaire
 * tant que l'onglet reste ouvert). Pour les notifications OS hors-onglet, le wrapper
 * Tauri `showDesktopNotification` est appelé séparément depuis EmailNotificationWatcher.
 */

const STORAGE_KEY = "cantaia_notif_permission_asked";

// ─── Permission ──────────────────────────────────────────────────────────────

export type NotifPermission = "granted" | "denied" | "default" | "unsupported";

export function getNotificationPermission(): NotifPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission as NotifPermission;
}

/**
 * Demande la permission si elle n'a pas encore été accordée.
 * Retourne true si les notifications sont désormais autorisées.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  // Ne demander qu'une seule fois par session (le navigateur peut rejeter les appels répétés)
  const alreadyAsked = sessionStorage.getItem(STORAGE_KEY);
  if (alreadyAsked) return false;

  sessionStorage.setItem(STORAGE_KEY, "1");
  const result = await Notification.requestPermission();
  return result === "granted";
}

// ─── Envoi ───────────────────────────────────────────────────────────────────

/**
 * Affiche une notification navigateur pour un email entrant.
 * No-op si la permission n'est pas accordée ou si l'onglet est en focus.
 */
export function sendBrowserEmailNotification(
  senderName: string,
  subject: string,
  preview?: string
): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  // Pas de notification doublée si l'onglet est actif et en focus
  if (document.visibilityState === "visible" && document.hasFocus()) return;

  try {
    const notif = new Notification(senderName, {
      body: preview ? `${subject}\n${preview}` : subject,
      icon: "/icons/128x128.png",
      tag: `cantaia-email-${Date.now()}`, // tag unique pour éviter le groupement
      silent: false,
    });

    // Clic → focus sur l'onglet Cantaia + navigation vers /mail
    notif.onclick = () => {
      window.focus();
      notif.close();
    };

    // Auto-fermeture après 6s
    setTimeout(() => notif.close(), 6000);
  } catch {
    // Ignoré — certains navigateurs bloquent silencieusement
  }
}
