// ============================================================
// PV circulation — translation fallbacks (Agent O)
// ============================================================
// The `messages/{fr,en,de}.json` files are owned by the i18n agent; this agent
// must not edit them. The keys the new circulation UI needs are proposed in
// `i18n-pending/O.json` and will be merged there.
//
// Until then, `t("pv.send_pv")` would render a MISSING_MESSAGE error in the UI.
// `withFallback()` wraps the next-intl translator so an absent key falls back
// to the French copy below — and starts using the real translation, in the
// user's language, the moment the keys are merged. No follow-up edit needed.

/** Proposed keys → French copy. Mirrors i18n-pending/O.json (`pv` section). */
export const PV_FALLBACKS: Record<string, string> = {
  // Send
  send_pv: "Envoyer le PV",
  send_pv_title: "Envoyer le procès-verbal",
  send_pv_intro:
    "Le PV sera envoyé en PDF depuis votre messagerie, avec la mention du délai d'opposition.",
  send_recipients: "Destinataires",
  send_participants: "Participants de la séance",
  send_no_participant_email:
    "Aucun participant n'a d'adresse e-mail. Ajoutez-les dans la fiche du PV ou saisissez des adresses ci-dessous.",
  send_extra_recipients: "Destinataires supplémentaires",
  send_extra_placeholder: "adresse@exemple.ch, autre@exemple.ch",
  send_message: "Message d'accompagnement",
  send_message_placeholder:
    "Vous trouverez en pièce jointe le procès-verbal de la séance…",
  send_opposition: "Délai d'opposition",
  send_opposition_days: "jours",
  send_opposition_hint:
    "Passé ce délai sans opposition écrite, le PV est réputé approuvé.",
  send_confirm: "Envoyer",
  send_sending: "Envoi en cours…",
  send_success: "PV envoyé",
  send_error: "Échec de l'envoi",
  send_via_fallback:
    "Envoyé depuis Cantaia (aucune boîte mail connectée). Les réponses vous seront adressées.",
  send_requires_finalize: "Finalisez le PV avant de l'envoyer.",
  sent_badge: "Envoyé",
  sent_on: "Envoyé le",
  sent_to_count: "destinataire(s)",
  resend_pv: "Renvoyer le PV",

  // Participants editor
  participant_email: "E-mail",
  participant_email_placeholder: "prenom.nom@entreprise.ch",
  participants_section: "Participants et diffusion",
  participants_hint:
    "Les adresses e-mail servent à la diffusion du PV et à la liste de distribution.",

  // Carried-over points
  carried_section: "Points ouverts (séance précédente)",
  carried_status_open: "Ouvert",
  carried_status_in_progress: "En cours",
  carried_status_done: "Traité",
  carried_from: "Point",
  carried_none: "Aucun point ouvert repris de la séance précédente.",
  carried_count: "point(s) repris de la séance précédente",

  // Template
  template_button: "Modèle de PV",
  template_title: "Modèle de procès-verbal",
  template_intro:
    "Les sections définies ici sont imposées à l'IA lors de la génération de vos PV.",
  template_section_title: "Titre de la section",
  template_required: "Obligatoire",
  template_add: "Ajouter une section",
  template_reset: "Rétablir le modèle par défaut",
  template_save: "Enregistrer le modèle",
  template_saved: "Modèle enregistré",
  template_default_in_use: "Modèle Cantaia par défaut",
  template_custom_in_use: "Modèle personnalisé",
  template_readonly:
    "Seuls les administrateurs et chefs de projet peuvent modifier le modèle.",

  // Manual PV
  manual_pv: "PV manuel",
  manual_pv_hint: "Créer le PV sans enregistrement audio, à partir de la trame.",
  manual_pv_creating: "Création du PV…",

  // Errors & flow feedback (usePVContent, modals, new PV page)
  save_error: "Erreur",
  save_error_network: "Erreur réseau lors de l'enregistrement",
  finalize_error: "Échec de la finalisation",
  finalize_error_network: "Erreur réseau lors de la finalisation",
  regenerate_error: "Échec de la régénération",
  regenerate_error_network: "Erreur réseau lors de la régénération",
  send_error_network: "Erreur réseau lors de l'envoi",
  send_abort_save_failed:
    "Enregistrement impossible — le PV n'a pas été envoyé. Réessayez.",
  export_error: "Échec de l'export PDF. Réessayez.",
  delete_error_network: "Erreur réseau lors de la suppression",
  list_load_error: "Impossible de charger les PV. Réessayez.",
  cancel: "Annuler",
  participant_excused: "(excusé)",
  invalid_address: "Adresse invalide",
  template_load_error: "Impossible de charger le modèle.",
  template_save_error: "Impossible d'enregistrer le modèle.",
  template_title_required:
    "Ajoutez au moins une section, ou rétablissez le modèle par défaut.",
  meeting_default_title: "Séance de chantier",
  error_generic: "Une erreur est survenue",
  audio_format_unsupported: "Format audio non supporté",
  compressing_audio: "Compression de l'audio…",
  manual_pv_error: "Échec de la création du PV",
};

/**
 * Shape of the next-intl translator we depend on.
 *
 * Typed loosely on purpose: next-intl types `useTranslations("pv")` against the
 * keys that EXIST in messages/*.json, so a strict signature would reject the
 * new keys — which is precisely the situation this helper exists to survive.
 */
type Translator = {
  (key: any, values?: any): string;
  has?: (key: any) => boolean;
};

/**
 * Wraps a next-intl translator so unknown keys resolve to the French fallback
 * instead of rendering a MISSING_MESSAGE error.
 */
export function withFallback(t: Translator) {
  return (key: string, values?: Record<string, unknown>): string => {
    try {
      if (typeof t.has === "function" && !t.has(key)) {
        return PV_FALLBACKS[key] ?? key;
      }
      return t(key, values);
    } catch {
      return PV_FALLBACKS[key] ?? key;
    }
  };
}
