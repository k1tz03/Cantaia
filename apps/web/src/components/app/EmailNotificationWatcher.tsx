"use client";

import { useEffect, useRef, useState } from "react";
import { useEmailContextSafe } from "@/lib/contexts/email-context";
import {
  requestNotificationPermission,
  sendBrowserEmailNotification,
} from "@/lib/notifications/email-notifications";
import { showDesktopNotification } from "@/lib/tauri";
import { EmailToastStack, type EmailToast } from "./EmailToastStack";
import type { EmailRecord } from "@cantaia/database";

/**
 * Threshold: if more than BULK_THRESHOLD new emails arrive at once,
 * show a single summary toast instead of individual notifications.
 * This prevents notification floods during initial sync or bulk imports.
 */
const BULK_THRESHOLD = 5;

/**
 * Composant silencieux qui observe les emails entrants et déclenche :
 *  1. Un toast in-app (EmailToastStack)
 *  2. Une notification navigateur (API Notification)
 *  3. Une notification OS native si on est dans l'app Tauri desktop
 *
 * Pour les syncs massives (500+ emails), affiche un résumé unique
 * au lieu de spammer des notifications individuelles.
 *
 * Placé dans le layout (app) pour être actif sur toutes les pages.
 */
export function EmailNotificationWatcher() {
  const emailCtx = useEmailContextSafe();
  const [toasts, setToasts] = useState<EmailToast[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  // Demande la permission navigateur au premier rendu
  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Détecte les nouveaux emails à chaque mise à jour du contexte
  useEffect(() => {
    if (!emailCtx || emailCtx.loading) return;
    const emails = emailCtx.emails as (EmailRecord & Record<string, unknown>)[];

    if (!initializedRef.current) {
      // Premier chargement : marquer tous les emails existants comme "déjà vus"
      // sans envoyer de notification (évite le spam au démarrage)
      for (const e of emails) seenIdsRef.current.add(e.id);
      initializedRef.current = true;
      return;
    }

    // Filtrer les emails vraiment nouveaux
    const newEmails = emails.filter((e) => !seenIdsRef.current.has(e.id));
    for (const e of newEmails) seenIdsRef.current.add(e.id);

    if (newEmails.length === 0) return;

    // ── Bulk sync detection ─────────────────────────────────────
    // If many emails arrive at once (initial sync, admin consent bulk import),
    // show a single summary toast instead of individual notifications.
    if (newEmails.length > BULK_THRESHOLD) {
      const summaryToast: EmailToast = {
        id: `bulk-${Date.now()}`,
        senderName: "Cantaia Mail",
        subject: `${newEmails.length} nouveaux emails synchronisés`,
        preview: newEmails.length > 20
          ? "Synchronisation massive terminée. Vos emails sont prêts."
          : `De ${[...new Set(newEmails.map((e) => (e.sender_name as string) || (e.sender_email as string) || ""))].slice(0, 3).join(", ")}${newEmails.length > 3 ? "…" : ""}`,
      };

      setToasts((prev) => [summaryToast, ...prev].slice(0, 5));

      // Single browser notification for the batch
      sendBrowserEmailNotification(
        "Cantaia Mail",
        `${newEmails.length} nouveaux emails synchronisés`,
        "Cliquez pour voir votre boîte de réception"
      );

      // Single OS notification for the batch
      showDesktopNotification(
        `📧 ${newEmails.length} nouveaux emails`,
        "Synchronisation terminée"
      ).catch(() => {});

      return;
    }

    // ── Normal flow (few emails) ────────────────────────────────
    // Ajouter les toasts (max 5 en file, 3 visibles)
    const newToasts: EmailToast[] = newEmails.slice(0, 3).map((e) => ({
      id: e.id,
      senderName: (e.sender_name as string) || (e.sender_email as string) || "Expéditeur",
      subject: (e.subject as string) || "(Sans objet)",
      preview: (e.body_preview as string) || "",
      classification: e.classification as string | undefined,
    }));

    setToasts((prev) => [...newToasts, ...prev].slice(0, 5));

    // Notifications pour les 3 premiers emails max
    for (const email of newEmails.slice(0, 3)) {
      const sender = (email.sender_name as string) || (email.sender_email as string) || "Expéditeur";
      const subject = (email.subject as string) || "(Sans objet)";
      const preview = (email.body_preview as string) || "";

      // Notification navigateur (visible si onglet en arrière-plan)
      sendBrowserEmailNotification(sender, subject, preview, email.id);

      // Notification OS native (Tauri desktop seulement)
      showDesktopNotification(`📧 ${sender}`, subject).catch(() => {});
    }
  }, [emailCtx?.emails, emailCtx?.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissToast = (id: string) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  return <EmailToastStack toasts={toasts} onDismiss={dismissToast} />;
}
