"use client";

/**
 * Self-contained FR/DE dictionary for the field portal.
 *
 * The portal is a PUBLIC, PIN-authenticated surface: it is rendered outside the
 * app shell and must not depend on next-intl (no locale routing, no messages
 * bundle, no app session). Everything a chef d'équipe reads — including the
 * weekday/month names, the SUVA rules and the emergency labels — lives here.
 *
 * Swiss reality: ~70% of the construction market is German-speaking, so DE is a
 * first-class translation, not a fallback. The choice is remembered per device
 * (localStorage) because the same phone is used every morning.
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PortalLang = "fr" | "de";

const STORAGE_KEY = "cantaia_portal_lang";
export const PORTAL_LANGS: PortalLang[] = ["fr", "de"];

const fr = {
  // ── Shell / auth ────────────────────────────────────────────────
  portalTitle: "Portail chantier",
  yourName: "Votre nom",
  yourNamePlaceholder: "Ex : Edgar Cardoso",
  pinCode: "Code PIN",
  pinPlaceholder: "••••••",
  access: "Accéder au chantier",
  pinHelp: "Code fourni par votre conducteur de travaux",
  invalidPin: "Code PIN incorrect",
  tooManyAttempts: "Trop de tentatives. Réessayez dans quelques minutes.",
  networkError: "Erreur réseau",
  loadError: "Erreur de chargement",
  site: "Chantier",

  // ── Tabs ────────────────────────────────────────────────────────
  tabSite: "Chantier",
  tabSubmission: "Soumission",
  tabPlans: "Plans",
  tabReport: "Rapport",

  // ── Site tab ────────────────────────────────────────────────────
  project: "Projet",
  instructions: "Consignes du chantier",
  openInMaps: "Ouvrir dans Maps",
  emergencyNumbers: "Numéros d'urgence",
  emergencyAmbulance: "Ambulance / Urgences",
  emergencyFire: "Pompiers",
  emergencyPolice: "Police",
  emergencyRega: "REGA (secours aérien)",
  emergencyTox: "Tox Info (intoxications)",
  conductor: "Conducteur de travaux",
  suvaTitle: "Règles SUVA — Sécurité chantier",
  suvaRule1: "Port du casque obligatoire en toutes circonstances",
  suvaRule2: "Chaussures de sécurité S3 obligatoires",
  suvaRule3: "Gilet haute visibilité obligatoire",
  suvaRule4: "Protection auditive en zone de bruit > 85 dB",
  suvaRule5: "Lunettes de protection pour travaux de meulage/découpe",
  suvaRule6: "Harnais obligatoire au-dessus de 2 mètres",
  suvaRule7: "Interdiction de travailler sous l'emprise d'alcool ou de drogues",
  suvaRule8: "Signaler tout accident ou incident immédiatement",
  suvaStop: "Chaque collaborateur a le droit de dire STOP en cas de danger",
  welcome: "Bon chantier et bonne journée",

  // ── Submission tab ──────────────────────────────────────────────
  searchPosts: "Rechercher un poste…",
  posts: "postes",
  noSubmission: "Aucune soumission liée à ce chantier",
  noPlans: "Aucun plan disponible",

  // ── Report — structure ──────────────────────────────────────────
  personnel: "Personnel",
  machines: "Machines",
  deliveryNotes: "Bons de livraison",
  remarks: "Remarques",
  weather: "Météo",
  weatherPlaceholder: "Ex : Ensoleillé, 18°C",
  remarksPlaceholder: "Notes, incidents, retards…",
  signature: "Signature",

  // ── Report — actions ────────────────────────────────────────────
  saveDraft: "Brouillon",
  submit: "Envoyer",
  draft: "Brouillon",
  submitted: "Envoyé",
  locked: "Verrouillé",
  draftSaved: "Brouillon enregistré",
  reportSubmitted: "Rapport envoyé au conducteur",
  lockedBanner: "Ce rapport a été envoyé et ne peut plus être modifié.",
  previousDay: "Jour précédent",
  nextDay: "Jour suivant",

  // ── Report — crew / lines ───────────────────────────────────────
  crewName: "Nom",
  crewRole: "Fonction",
  addCrew: "Ajouter à l'équipe",
  workDescription: "Travail effectué",
  addWork: "Ajouter une ligne",
  addMachine: "Ajouter une machine",
  addNote: "Ajouter un bon",
  machineDescription: "Machine",
  noteNumber: "N° bon",
  supplier: "Fournisseur",
  hours: "Heures",
  totalHours: "Total heures : {count}",
  driver: "Conducteur d'engin",
  rented: "Machine louée",
  present: "Présent",
  absent: "Absent",
  remove: "Retirer",
  imputation: "Imputation",
  noImputation: "Non imputé",
  cfcPosition: "Poste / CFC",
  planningTask: "Tâche planning",
  photo: "Photo",
  takePhoto: "Prendre en photo",
  photoSaved: "Photo enregistrée",
  photoUploading: "Envoi de la photo…",
  photoPending: "Photo en attente — sera envoyée au retour du réseau",
  photoLost: "Photo à reprendre (non retrouvée après fermeture de l'application)",
  deliveryPhotoHint: "Photo du bon de livraison",
  photoUnsupported: "Format non supporté. Formats acceptés : JPEG, PNG, WebP.",
  photoTooLarge: "Fichier trop volumineux (max 10 Mo).",
  photoUploadFailed: "Échec de l'envoi de la photo.",

  // ── Report — signature ──────────────────────────────────────────
  signHere: "Signez ci-dessous",
  signatureHint: "Votre signature vaut confirmation des heures déclarées.",
  clearSignature: "Effacer",
  signedBy: "Signé par",
  signedOn: "Signé le",
  signatureOptional: "Optionnel",

  // ── Offline / sync ──────────────────────────────────────────────
  offline: "Hors ligne — vos saisies sont conservées sur l'appareil",
  sessionExpired: "Session expirée — reconnectez-vous avec le code PIN. Vos saisies sont conservées.",
  pendingSync: "En attente de connexion",
  pendingSyncDetail: "Le rapport sera envoyé automatiquement dès le retour du réseau.",
  retryNow: "Réessayer",
  syncing: "Envoi en cours…",
  savedLocally: "Enregistré sur l'appareil",
  draftRestored: "Brouillon restauré depuis cet appareil",

  // ── Confirmations ───────────────────────────────────────────────
  confirmSubmitTitle: "Envoyer le rapport ?",
  confirmSubmitBody:
    "Une fois envoyé, le rapport part chez le conducteur et vous ne pourrez plus le modifier.",
  confirmSubmitCta: "Oui, envoyer",
  confirmRemoveCrewTitle: "Retirer {name} de l'équipe ?",
  confirmRemoveCrewBody:
    "Ses lignes de travail du jour seront également supprimées de ce rapport.",
  confirmRemoveCrewCta: "Retirer",
  cancel: "Annuler",
} as const;

export type PortalKey = keyof typeof fr;

const de: Record<PortalKey, string> = {
  portalTitle: "Baustellen-Portal",
  yourName: "Ihr Name",
  yourNamePlaceholder: "z. B. Edgar Cardoso",
  pinCode: "PIN-Code",
  pinPlaceholder: "••••••",
  access: "Baustelle öffnen",
  pinHelp: "Code erhalten Sie von Ihrem Bauführer",
  invalidPin: "Falscher PIN-Code",
  tooManyAttempts: "Zu viele Versuche. Bitte in einigen Minuten erneut versuchen.",
  networkError: "Netzwerkfehler",
  loadError: "Fehler beim Laden",
  site: "Baustelle",

  tabSite: "Baustelle",
  tabSubmission: "Ausschreibung",
  tabPlans: "Pläne",
  tabReport: "Rapport",

  project: "Projekt",
  instructions: "Anweisungen zur Baustelle",
  openInMaps: "In Maps öffnen",
  emergencyNumbers: "Notrufnummern",
  emergencyAmbulance: "Sanität / Notfall",
  emergencyFire: "Feuerwehr",
  emergencyPolice: "Polizei",
  emergencyRega: "REGA (Luftrettung)",
  emergencyTox: "Tox Info (Vergiftungen)",
  conductor: "Bauführer",
  suvaTitle: "SUVA-Regeln — Sicherheit auf der Baustelle",
  suvaRule1: "Helmtragpflicht jederzeit",
  suvaRule2: "Sicherheitsschuhe S3 obligatorisch",
  suvaRule3: "Warnweste obligatorisch",
  suvaRule4: "Gehörschutz in Lärmbereichen > 85 dB",
  suvaRule5: "Schutzbrille bei Schleif- und Trennarbeiten",
  suvaRule6: "Auffanggurt obligatorisch ab 2 Metern Höhe",
  suvaRule7: "Arbeiten unter Alkohol- oder Drogeneinfluss verboten",
  suvaRule8: "Jeden Unfall oder Vorfall sofort melden",
  suvaStop: "Jede Mitarbeiterin und jeder Mitarbeiter darf bei Gefahr STOPP sagen",
  welcome: "Gute Arbeit und einen guten Tag",

  searchPosts: "Position suchen…",
  posts: "Positionen",
  noSubmission: "Keine Ausschreibung mit dieser Baustelle verknüpft",
  noPlans: "Keine Pläne verfügbar",

  personnel: "Personal",
  machines: "Maschinen",
  deliveryNotes: "Lieferscheine",
  remarks: "Bemerkungen",
  weather: "Wetter",
  weatherPlaceholder: "z. B. Sonnig, 18 °C",
  remarksPlaceholder: "Notizen, Vorfälle, Verzögerungen…",
  signature: "Unterschrift",

  saveDraft: "Entwurf",
  submit: "Senden",
  draft: "Entwurf",
  submitted: "Gesendet",
  locked: "Gesperrt",
  draftSaved: "Entwurf gespeichert",
  reportSubmitted: "Rapport an den Bauführer gesendet",
  lockedBanner: "Dieser Rapport wurde gesendet und kann nicht mehr geändert werden.",
  previousDay: "Vorheriger Tag",
  nextDay: "Nächster Tag",

  crewName: "Name",
  crewRole: "Funktion",
  addCrew: "Zum Team hinzufügen",
  workDescription: "Ausgeführte Arbeit",
  addWork: "Zeile hinzufügen",
  addMachine: "Maschine hinzufügen",
  addNote: "Lieferschein hinzufügen",
  machineDescription: "Maschine",
  noteNumber: "Schein-Nr.",
  supplier: "Lieferant",
  hours: "Stunden",
  totalHours: "Stunden total: {count}",
  driver: "Maschinist",
  rented: "Gemietete Maschine",
  present: "Anwesend",
  absent: "Abwesend",
  remove: "Entfernen",
  imputation: "Zuordnung",
  noImputation: "Nicht zugeordnet",
  cfcPosition: "Position / CFC",
  planningTask: "Terminplan-Aufgabe",
  photo: "Foto",
  takePhoto: "Foto aufnehmen",
  photoSaved: "Foto gespeichert",
  photoUploading: "Foto wird gesendet…",
  photoPending: "Foto wartet — wird bei Netzverbindung gesendet",
  photoLost: "Foto erneut aufnehmen (nach dem Schliessen der App nicht mehr vorhanden)",
  deliveryPhotoHint: "Foto des Lieferscheins",
  photoUnsupported: "Format nicht unterstützt. Akzeptiert: JPEG, PNG, WebP.",
  photoTooLarge: "Datei zu gross (max. 10 MB).",
  photoUploadFailed: "Senden des Fotos fehlgeschlagen.",

  signHere: "Hier unterschreiben",
  signatureHint: "Ihre Unterschrift bestätigt die erfassten Stunden.",
  clearSignature: "Löschen",
  signedBy: "Unterschrieben von",
  signedOn: "Unterschrieben am",
  signatureOptional: "Optional",

  offline: "Offline — Ihre Eingaben bleiben auf dem Gerät gespeichert",
  sessionExpired: "Sitzung abgelaufen — bitte mit PIN-Code neu anmelden. Ihre Eingaben bleiben erhalten.",
  pendingSync: "Wartet auf Verbindung",
  pendingSyncDetail: "Der Rapport wird automatisch gesendet, sobald das Netz zurück ist.",
  retryNow: "Erneut versuchen",
  syncing: "Wird gesendet…",
  savedLocally: "Auf dem Gerät gespeichert",
  draftRestored: "Entwurf von diesem Gerät wiederhergestellt",

  confirmSubmitTitle: "Rapport senden?",
  confirmSubmitBody:
    "Nach dem Senden geht der Rapport an den Bauführer und kann nicht mehr geändert werden.",
  confirmSubmitCta: "Ja, senden",
  confirmRemoveCrewTitle: "{name} aus dem Team entfernen?",
  confirmRemoveCrewBody:
    "Die heutigen Arbeitszeilen dieser Person werden ebenfalls aus dem Rapport entfernt.",
  confirmRemoveCrewCta: "Entfernen",
  cancel: "Abbrechen",
};

const DICTS: Record<PortalLang, Record<PortalKey, string>> = { fr, de };

const WEEKDAYS: Record<PortalLang, string[]> = {
  fr: ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"],
  de: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
};

const MONTHS: Record<PortalLang, string[]> = {
  fr: [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  ],
  de: [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
  ],
};

export type PortalTranslate = (key: PortalKey, vars?: Record<string, string | number>) => string;

interface PortalI18nValue {
  lang: PortalLang;
  setLang: (lang: PortalLang) => void;
  t: PortalTranslate;
  /** "Lundi 14 avril 2026" / "Montag, 14. April 2026" */
  formatDate: (isoDate: string) => string;
}

const PortalI18nContext = createContext<PortalI18nValue | null>(null);

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  );
}

export function PortalI18nProvider({ children }: { children: ReactNode }) {
  // Always start on "fr" so server and first client render agree; the stored
  // choice is applied in an effect (avoids a hydration mismatch).
  const [lang, setLangState] = useState<PortalLang>("fr");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "fr" || stored === "de") {
        setLangState(stored);
        return;
      }
      // No stored choice: follow the device language when it is German.
      if (navigator.language?.toLowerCase().startsWith("de")) setLangState("de");
    } catch {
      /* private mode / storage disabled — stay on the default */
    }
  }, []);

  const setLang = useCallback((next: PortalLang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<PortalI18nValue>(() => {
    const dict = DICTS[lang];
    return {
      lang,
      setLang,
      t: (key, vars) => interpolate(dict[key] ?? fr[key] ?? String(key), vars),
      formatDate: (isoDate: string) => {
        try {
          const d = new Date(`${isoDate}T12:00:00`);
          if (Number.isNaN(d.getTime())) return isoDate;
          const day = WEEKDAYS[lang][d.getDay()];
          const month = MONTHS[lang][d.getMonth()];
          return lang === "de"
            ? `${day}, ${d.getDate()}. ${month} ${d.getFullYear()}`
            : `${day} ${d.getDate()} ${month} ${d.getFullYear()}`;
        } catch {
          return isoDate;
        }
      },
    };
  }, [lang, setLang]);

  return <PortalI18nContext.Provider value={value}>{children}</PortalI18nContext.Provider>;
}

export function usePortalI18n(): PortalI18nValue {
  const ctx = useContext(PortalI18nContext);
  if (!ctx) {
    throw new Error("usePortalI18n must be used inside <PortalI18nProvider>");
  }
  return ctx;
}
