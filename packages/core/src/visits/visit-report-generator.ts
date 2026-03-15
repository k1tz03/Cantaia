/**
 * Visit report generator — Claude AI
 * Generates structured visit reports from transcriptions.
 */

import type { VisitReport } from "@cantaia/database";

export interface VisitReportPromptInput {
  transcription: string;
  user_name: string;
  user_company: string;
  client_name?: string;
  client_address?: string;
  visit_date: string;
  language?: string;
  handwritten_notes?: string;
  sketch_descriptions?: string[];
}

/**
 * Build the Claude prompt for visit report generation.
 */
export function buildVisitReportPrompt(input: VisitReportPromptInput): string {
  return `Tu es un assistant pour conducteurs de travaux et chefs de projet dans la construction en Suisse. Tu viens de recevoir la transcription d'une visite chez un client/prospect.

Analyse cette transcription et génère un rapport de visite structuré.

Transcription de la visite :
${input.transcription}
${input.handwritten_notes ? `
NOTES MANUSCRITES PHOTOGRAPHIÉES :
${input.handwritten_notes}
` : ""}${input.sketch_descriptions && input.sketch_descriptions.length > 0 ? `
CROQUIS ET DIAGRAMMES IDENTIFIÉS :
${input.sketch_descriptions.map((s, i) => `${i + 1}. ${s}`).join("\n")}
` : ""}
Informations connues :
- Conducteur de travaux : ${input.user_name}, ${input.user_company}
- Client : ${input.client_name || "(non renseigné)"}
- Adresse : ${input.client_address || "(non renseignée)"}
- Date de visite : ${input.visit_date}

Génère un JSON structuré avec les champs suivants :
{
  "title": "Titre court de la visite (ex: Visite rénovation cuisine — M. et Mme Dupont)",
  "summary": "Résumé concis en 3-5 phrases",
  "client_info_extracted": {
    "name": "Nom complet extrait de la conversation",
    "company": "Entreprise si mentionnée, sinon null",
    "phone": "Téléphone si mentionné",
    "email": "Email si mentionné",
    "address": "Adresse si mentionnée"
  },
  "client_requests": [
    {
      "category": "demolition|gros_oeuvre|plomberie|electricite|cvc|menuiserie|carrelage|peinture|etancheite|amenagement_exterieur|isolation|toiture|facade|sanitaire|autre",
      "description": "Description précise de la demande",
      "details": "Détails techniques mentionnés",
      "priority": "high|medium|low",
      "cfc_code": "Code CFC suisse si identifiable"
    }
  ],
  "measurements": [
    {
      "zone": "Nom de la zone",
      "dimensions": "Dimensions relevées",
      "notes": "Notes complémentaires"
    }
  ],
  "constraints": ["Contrainte technique, réglementaire ou pratique identifiée"],
  "budget": {
    "client_mentioned": true,
    "range_min": 0,
    "range_max": 0,
    "currency": "CHF",
    "notes": "Contexte de la discussion sur le budget"
  },
  "timeline": {
    "desired_start": "Texte libre",
    "desired_end": "Texte libre",
    "constraints": "Contraintes de planning mentionnées",
    "urgency": "low|moderate|high|critical"
  },
  "next_steps": ["Actions concrètes à entreprendre"],
  "competitors_mentioned": ["Noms d'entreprises concurrentes"],
  "sentiment": "positive|neutral|hesitant|negative",
  "closing_probability": 0.75,
  "closing_notes": "Analyse de la probabilité de conversion"
}

RÈGLES :
- Extrais TOUTES les demandes du client, même celles mentionnées brièvement
- Si le client mentionne des dimensions ou mesures → les capturer dans "measurements"
- Si le client mentionne un budget → le capturer même approximatif
- Si le client mentionne des concurrents → les noter
- Les "next_steps" doivent être des actions concrètes et actionnables
- Le "sentiment" et "closing_probability" sont ton estimation basée sur le ton de la conversation
- Identifie les corps de métier (CFC) pour chaque demande
- Si des informations de contact sont mentionnées → les extraire dans client_info_extracted
- Si des notes manuscrites sont fournies, croise les mesures et informations avec celles de la transcription audio
- Les notes manuscrites peuvent contenir des croquis : intègre leurs descriptions dans les mesures et demandes
- Réponds UNIQUEMENT avec le JSON, sans texte avant ou après`;
}

/**
 * Mock report for development/demo.
 */
export function getMockVisitReport(): VisitReport {
  return {
    title: "Visite rénovation cuisine — M. et Mme Dupont",
    summary: "Visite chez M. et Mme Dupont pour un projet de rénovation complète de la cuisine de leur appartement en PPE à Lausanne. Le couple souhaite ouvrir la cuisine sur le salon, installer un îlot central, et refaire l'ensemble des finitions. Budget de 45-60k CHF. Impression positive, bonne probabilité de conversion.",
    client_info_extracted: {
      name: "M. et Mme Dupont",
      phone: undefined,
      email: undefined,
      address: "Rue du Lac 15, 1003 Lausanne",
    },
    client_requests: [
      {
        category: "demolition",
        description: "Démolir la cloison entre cuisine et salon",
        details: "Vérifier si mur porteur — faire venir ingénieur structure",
        priority: "high",
        cfc_code: "211",
      },
      {
        category: "menuiserie",
        description: "Cuisine sur mesure en chêne massif, plan de travail granit",
        details: "Style scandinave, îlot central avec rangements",
        priority: "high",
        cfc_code: "271",
      },
      {
        category: "plomberie",
        description: "Déplacer l'arrivée d'eau pour l'îlot central",
        details: "Arrivée d'eau actuellement dans le coin, à déplacer au milieu",
        priority: "medium",
        cfc_code: "251",
      },
      {
        category: "electricite",
        description: "4 prises sur l'îlot + luminaires suspendus design",
        details: "Style scandinave souhaité pour les suspensions",
        priority: "medium",
        cfc_code: "232",
      },
      {
        category: "carrelage",
        description: "Carrelage grand format imitation béton ciré",
        details: "Client hésitait entre carrelage et résine, a choisi carrelage",
        priority: "low",
        cfc_code: "281",
      },
    ],
    measurements: [
      { zone: "Cuisine actuelle", dimensions: "3.20m × 4.10m", notes: "Hauteur sous plafond 2.55m" },
      { zone: "Mur à démolir", dimensions: "3.20m × 2.55m", notes: "Vérifier si porteur" },
    ],
    constraints: [
      "Immeuble en PPE — accord de la copropriété nécessaire pour la cloison",
      "Chauffage au sol existant — attention lors de la démolition",
      "Client souhaite rester dans l'appartement pendant les travaux",
    ],
    budget: {
      client_mentioned: true,
      range_min: 45000,
      range_max: 60000,
      currency: "CHF",
      notes: "Budget flexible si la qualité est au rendez-vous",
    },
    timeline: {
      desired_start: "Avril 2026",
      desired_end: "Juin 2026",
      constraints: "Vacances du client du 15 au 30 juillet — travaux finis avant",
      urgency: "moderate",
    },
    next_steps: [
      "Établir le devis détaillé par corps de métier",
      "Vérifier la portance du mur avec un ingénieur structure",
      "Envoyer le catalogue de cuisines partenaires",
      "Planifier une 2e visite avec le cuisiniste",
    ],
    competitors_mentioned: ["Batiprix SA"],
    sentiment: "positive",
    closing_probability: 0.75,
    closing_notes: "Le client semble motivé et a un budget réaliste. Le principal risque est la concurrence avec Batiprix qui propose potentiellement un prix inférieur.",
  };
}
