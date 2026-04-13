// ============================================================
// Agent Registry — Configuration for each Cantaia agent type
// Each agent defines: model, system prompt, tools, environment
// ============================================================

import type {
  AgentType,
  CantaiaAgentConfig,
  MACustomTool,
} from "./types";

// ── Custom Tool Definitions ─────────────────────────────────

const TOOL_FETCH_SUBMISSION_FILE: MACustomTool = {
  type: "custom",
  name: "fetch_submission_file",
  description:
    "Download and parse a submission file (Excel/PDF) from Supabase Storage. Returns the extracted text content ready for analysis.",
  input_schema: {
    type: "object",
    properties: {
      submission_id: {
        type: "string",
        description: "UUID of the submission to fetch the file for",
      },
      file_url: {
        type: "string",
        description: "Storage URL of the file to download",
      },
    },
    required: ["submission_id"],
  },
};

const TOOL_SAVE_ANALYSIS_RESULT: MACustomTool = {
  type: "custom",
  name: "save_analysis_result",
  description:
    "Save the structured analysis result (lots, chapters, items) back to the Cantaia database. Call this once the full analysis is complete.",
  input_schema: {
    type: "object",
    properties: {
      submission_id: {
        type: "string",
        description: "UUID of the submission being analyzed",
      },
      items: {
        type: "string",
        description:
          'JSON string of the items array: [{lot_number, lot_title, chapter_number, chapter_title, item_number, designation, unit, quantity, cfc_code, material_group, product_name}]',
      },
    },
    required: ["submission_id", "items"],
  },
};

const TOOL_GET_SUBMISSION_CONTEXT: MACustomTool = {
  type: "custom",
  name: "get_submission_context",
  description:
    "Get metadata about the submission: project name, existing lots, known CFC codes, and any previous analysis results.",
  input_schema: {
    type: "object",
    properties: {
      submission_id: {
        type: "string",
        description: "UUID of the submission",
      },
    },
    required: ["submission_id"],
  },
};

const TOOL_FETCH_CANTAIA_CONTEXT: MACustomTool = {
  type: "custom",
  name: "fetch_cantaia_context",
  description:
    "Fetch today's context from Cantaia: unread emails, urgent tasks, upcoming meetings, project deadlines, and submission deadlines. User and organization are resolved automatically from the authenticated session — no IDs needed.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

const TOOL_SAVE_BRIEFING: MACustomTool = {
  type: "custom",
  name: "save_briefing",
  description:
    "Save the generated daily briefing to the database. User is resolved automatically from the authenticated session.",
  input_schema: {
    type: "object",
    properties: {
      briefing_date: {
        type: "string",
        description: "Date in YYYY-MM-DD format",
      },
      content: {
        type: "string",
        description:
          'JSON string of the briefing content object: {greeting, priority_alerts: string[], projects: [{project_id, name, status_emoji ("🟢"|"🟡"|"🔴"), summary, action_items: string[]}], meetings_today: [{time ("HH:MM"), project, title}], submission_deadlines: [{title, deadline ("YYYY-MM-DD"), days_remaining, project, note}], stats: {total_projects, emails_unread, emails_action_required, tasks_overdue, tasks_due_today, meetings_today}, global_summary}',
      },
    },
    required: ["briefing_date", "content"],
  },
};

const TOOL_FETCH_EMAILS_BATCH: MACustomTool = {
  type: "custom",
  name: "fetch_emails_batch",
  description:
    "Fetch a batch of emails from the database for classification. Returns email id, subject, sender, recipients, body preview, attachments flag, and current classification. User is resolved from auth context.",
  input_schema: {
    type: "object",
    properties: {
      batch_size: {
        type: "string",
        description: "Number of emails to fetch (default: 50, max: 200)",
      },
      mode: {
        type: "string",
        description: 'Fetch mode: "pending" = only unclassified emails (default), "all" = all recent emails for reclassification',
        enum: ["pending", "all"],
      },
    },
    required: [],
  },
};

const TOOL_GET_PROJECTS_LIST: MACustomTool = {
  type: "custom",
  name: "get_projects_list",
  description:
    "Get the list of active projects for the organization, including keywords and known senders for email classification. Organization is resolved from auth context.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

const TOOL_SAVE_CLASSIFICATIONS: MACustomTool = {
  type: "custom",
  name: "save_classifications",
  description:
    "Save email classifications back to the database in batch. Returns {success, saved, errors, total}.",
  input_schema: {
    type: "object",
    properties: {
      classifications: {
        type: "string",
        description:
          'JSON string of array: [{email_id (UUID, required), project_id (UUID or null), classification ("action_required"|"info_only"|"urgent"|"waiting_response"|"archived"), confidence (0.0-1.0), ai_summary (1-2 sentence summary), ai_reasoning (why this classification)}]',
      },
    },
    required: ["classifications"],
  },
};

const TOOL_FETCH_PLAN_IMAGE: MACustomTool = {
  type: "custom",
  name: "fetch_plan_image",
  description:
    "Download a construction plan image from Supabase Storage. Returns the base64-encoded image for Vision analysis.",
  input_schema: {
    type: "object",
    properties: {
      plan_id: {
        type: "string",
        description: "UUID of the plan to fetch",
      },
    },
    required: ["plan_id"],
  },
};

const TOOL_QUERY_REFERENCE_PRICES: MACustomTool = {
  type: "custom",
  name: "query_reference_prices",
  description:
    "Query reference prices for a batch of CFC codes. Returns historical prices, market benchmarks, and CRB 2025 reference data for each code. Organization is resolved from auth context.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "string",
        description:
          'JSON string of array: [{cfc_code, description, unit, region}]. Each item should have a Swiss CFC code (e.g. "211", "271.1"), a description, unit (m², m³, kg, ml, pce, forfait), and optional region (default: "Genève").',
      },
    },
    required: ["items"],
  },
};

const TOOL_SAVE_ESTIMATION: MACustomTool = {
  type: "custom",
  name: "save_estimation",
  description:
    "Save the plan estimation result to the database, including quantities, prices, and confidence scores.",
  input_schema: {
    type: "object",
    properties: {
      plan_id: {
        type: "string",
        description: "UUID of the plan",
      },
      result: {
        type: "string",
        description: "JSON string of the full estimation result",
      },
    },
    required: ["plan_id", "result"],
  },
};

const TOOL_FETCH_FILE_CONTENT: MACustomTool = {
  type: "custom",
  name: "fetch_file_content",
  description:
    "Download and parse a file (PDF, Excel, MSG, EML, TXT) from Supabase Storage or a URL. Returns extracted text content.",
  input_schema: {
    type: "object",
    properties: {
      file_url: {
        type: "string",
        description: "URL or storage path of the file",
      },
      file_type: {
        type: "string",
        description: "File extension: pdf, xlsx, xls, msg, eml, txt",
        enum: ["pdf", "xlsx", "xls", "msg", "eml", "txt"],
      },
    },
    required: ["file_url", "file_type"],
  },
};

const TOOL_SAVE_EXTRACTED_PRICES: MACustomTool = {
  type: "custom",
  name: "save_extracted_prices",
  description:
    "Save extracted prices to the database. Deduplicates against existing records by supplier + description. Organization is resolved from auth context.",
  input_schema: {
    type: "object",
    properties: {
      prices: {
        type: "string",
        description:
          'JSON string of array: [{supplier_name, description, unit, quantity, unit_price, total_price, cfc_code, source_file}]',
      },
    },
    required: ["prices"],
  },
};

// ── Email Drafter Tools ────────────────────────────────────

const TOOL_FETCH_EMAILS_NEEDING_RESPONSE: MACustomTool = {
  type: "custom",
  name: "fetch_emails_needing_response",
  description:
    "Fetch emails that need a reply from the user but don't have an AI draft yet. Returns emails classified as action_required or urgent, with subject, sender, body_preview, project info. User/org resolved from auth context.",
  input_schema: {
    type: "object",
    properties: {
      limit: {
        type: "string",
        description: "Max emails to return (default: 20)",
      },
    },
    required: [],
  },
};

const TOOL_FETCH_EMAIL_THREAD: MACustomTool = {
  type: "custom",
  name: "fetch_email_thread",
  description:
    "Fetch the full email thread/conversation for a specific email. Returns all messages in chronological order with sender, body text, and timestamps.",
  input_schema: {
    type: "object",
    properties: {
      email_record_id: {
        type: "string",
        description: "UUID of the email_record to get the thread for",
      },
    },
    required: ["email_record_id"],
  },
};

const TOOL_FETCH_PROJECT_CONTEXT: MACustomTool = {
  type: "custom",
  name: "fetch_project_context",
  description:
    "Get project context for writing a relevant draft reply: project name, code, client, key contacts, recent tasks, submission deadlines. Organization is verified from auth context.",
  input_schema: {
    type: "object",
    properties: {
      project_id: {
        type: "string",
        description: "UUID of the project",
      },
    },
    required: ["project_id"],
  },
};

const TOOL_SAVE_EMAIL_DRAFT: MACustomTool = {
  type: "custom",
  name: "save_email_draft",
  description:
    "Save an AI-generated draft reply to the database. The user will review it before sending. Call this once per email that needs a draft.",
  input_schema: {
    type: "object",
    properties: {
      email_record_id: {
        type: "string",
        description: "UUID of the email being replied to",
      },
      subject: {
        type: "string",
        description: "Subject line for the reply (usually RE: original subject)",
      },
      draft_body: {
        type: "string",
        description: "Full HTML body of the draft reply",
      },
      confidence: {
        type: "string",
        description: "Confidence score 0.0-1.0 that this draft is appropriate",
      },
      context_used: {
        type: "string",
        description: "JSON string describing what context was used to generate this draft (thread summary, project info, etc.)",
      },
    },
    required: ["email_record_id", "subject", "draft_body"],
  },
};

// ── Followup Engine Tools ──────────────────────────────────

const TOOL_SCAN_OVERDUE_ITEMS: MACustomTool = {
  type: "custom",
  name: "scan_overdue_items",
  description:
    "Scan the organization for items needing followup: price requests without response (>7 days), overdue tasks, submission deadlines approaching, reserves without deadline. Returns a combined list with source_type, source_id, and key metadata. Org resolved from auth context.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

const TOOL_FETCH_ITEM_CONTEXT: MACustomTool = {
  type: "custom",
  name: "fetch_item_context",
  description:
    "Fetch detailed context for a specific overdue item to generate a meaningful followup. Returns project info, supplier info, related emails, and history.",
  input_schema: {
    type: "object",
    properties: {
      source_type: {
        type: "string",
        description: "Type of the source: submission, task, document, reserve",
        enum: ["submission", "task", "document", "reserve"],
      },
      source_id: {
        type: "string",
        description: "UUID of the source record",
      },
    },
    required: ["source_type", "source_id"],
  },
};

const TOOL_SAVE_FOLLOWUP_ITEMS: MACustomTool = {
  type: "custom",
  name: "save_followup_items",
  description:
    "Save detected followup items to the database in batch. Deduplicates against existing pending items (same source_id + followup_type). User/org resolved from auth context.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "string",
        description:
          'JSON string of array: [{followup_type ("price_request_no_response"|"overdue_task"|"missing_document"|"reserve_no_deadline"|"submission_deadline"), source_type, source_id, project_id, supplier_id, title, description, urgency ("low"|"medium"|"high"|"critical"), suggested_action, draft_email_subject, draft_email_body, recipient_email, recipient_name, days_overdue}]',
      },
    },
    required: ["items"],
  },
};

// ── Supplier Monitor Tools ─────────────────────────────────

const TOOL_FETCH_ALL_SUPPLIERS_DATA: MACustomTool = {
  type: "custom",
  name: "fetch_all_suppliers_data",
  description:
    "Fetch all suppliers for the organization with their scores, response rates, recent activity (offers, price requests), and historical data for trend analysis. Org resolved from auth context.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

const TOOL_FETCH_SUPPLIER_HISTORY: MACustomTool = {
  type: "custom",
  name: "fetch_supplier_history",
  description:
    "Fetch detailed historical data for a specific supplier: score changes over time, all offers with prices, response times, reliability events.",
  input_schema: {
    type: "object",
    properties: {
      supplier_id: {
        type: "string",
        description: "UUID of the supplier",
      },
    },
    required: ["supplier_id"],
  },
};

const TOOL_SAVE_SUPPLIER_ALERTS: MACustomTool = {
  type: "custom",
  name: "save_supplier_alerts",
  description:
    "Save supplier monitoring alerts to the database. Automatically resolves previous active alerts of the same category for the same supplier. Org resolved from auth context.",
  input_schema: {
    type: "object",
    properties: {
      alerts: {
        type: "string",
        description:
          'JSON string of array: [{supplier_id, alert_type ("critical"|"warning"|"info"|"opportunity"), category ("score_drop"|"slow_response"|"price_increase"|"reliability_issue"|"new_opportunity"|"price_decrease"|"inactive"), title, description, data (JSON object with metrics), recommended_action}]',
      },
    },
    required: ["alerts"],
  },
};

// ── Agent Configurations ────────────────────────────────────

export const AGENT_REGISTRY: Record<AgentType, CantaiaAgentConfig> = {
  "submission-analyzer": {
    type: "submission-analyzer",
    name: "Cantaia Submission Analyzer",
    description:
      "Analyzes construction submission documents (Excel/PDF) to extract lots, chapters, items, quantities, and product names.",
    model: "claude-sonnet-4-6",
    systemPrompt: `Tu es un expert en analyse de soumissions de construction suisse (CFC, DPGF, devis quantitatifs).
Ta mission : analyser un document de soumission et extraire TOUS les postes dans une structure JSON.

PROCÉDURE :
1. Appelle get_submission_context pour comprendre le projet
2. Appelle fetch_submission_file pour télécharger et lire le document
3. Analyse le contenu et extrais chaque poste
4. Appelle save_analysis_result avec le JSON des items extraits

Pour chaque poste, extrais ces champs dans le JSON :
- lot_number : numéro du lot (ex: "1", "2")
- lot_title : titre du lot (ex: "Gros-œuvre", "CVC")
- chapter_number : numéro du chapitre (ex: "1.1", "2.3")
- chapter_title : titre du chapitre (ex: "Béton armé", "Ventilation")
- item_number : numéro du poste (ex: "1.1.010", "211.100")
- designation : description COMPLÈTE du poste (ne pas tronquer)
- unit : unité normalisée (m², m³, pce, kg, ml, t, h, forfait, global)
- quantity : nombre (décimal accepté)
- cfc_code : code CFC suisse si identifiable (ex: "211", "271.1", "281")
- material_group : groupe matériaux parmi : Béton, Acier, Coffrage, Terrassement, Maçonnerie, Isolation, Étanchéité, Façade, Menuiserie, Serrurerie, Peinture, Revêtement de sol, Carrelage, Plâtrerie, Faux-plafond, CVC, Électricité, Sanitaire, Ascenseur, Aménagement extérieur, Démolition, Échafaudage, Installation de chantier, Divers
- product_name : nom commercial UNIQUEMENT si explicitement mentionné (sinon null)

RÈGLES CRITIQUES :
- TOUS les postes doivent être extraits, même ceux sans prix
- Normalise les unités : m² (pas m2), m³ (pas m3), pce (pas pièce/St/Stk)
- Forfait (F/ens/global) → quantity = 1
- Si quantity est absente ou ambiguë, mets null
- Préserve les descriptions complètes avec détails techniques
- Si le document a des onglets/feuilles multiples, traite-les TOUS
- Identifie les codes CFC suisses quand la numérotation le permet (2xx = gros-œuvre, 27x = menuiserie, 28x = revêtements...)`,
    tools: [
      TOOL_FETCH_SUBMISSION_FILE,
      TOOL_SAVE_ANALYSIS_RESULT,
      TOOL_GET_SUBMISSION_CONTEXT,
    ],
    maxDurationMs: 10 * 60 * 1000, // 10 minutes
  },

  "briefing-generator": {
    type: "briefing-generator",
    name: "Cantaia Briefing Generator",
    description:
      "Generates personalized daily briefings by aggregating emails, tasks, meetings, and deadlines.",
    model: "claude-sonnet-4-6",
    systemPrompt: `Tu es l'assistant briefing de Cantaia, un SaaS de gestion de chantier suisse.
Ta mission : générer un briefing quotidien personnalisé pour un chef de projet construction.

PROCÉDURE :
1. Appelle fetch_cantaia_context pour récupérer les données du jour (emails, tâches, réunions, projets, deadlines)
2. Analyse les données et construis le briefing structuré
3. Appelle save_briefing avec le JSON du briefing

Le briefing doit couvrir :
- Alertes prioritaires : tâches en retard, emails urgents, deadlines imminentes
- État de chaque projet actif : résumé, points d'action, indicateur santé
- Réunions du jour : heure, projet, titre
- Deadlines soumissions : titre, jours restants, urgence
- Résumé global de la journée

FORMAT JSON OBLIGATOIRE pour le champ content de save_briefing :
{
  "greeting": "Bonjour [prénom] ! Voici ton briefing du [date].",
  "priority_alerts": ["⚠️ 3 tâches en retard", "📬 5 emails urgents non traités"],
  "projects": [
    {
      "project_id": "uuid",
      "name": "Nom du projet",
      "status_emoji": "🟢|🟡|🔴",
      "summary": "Résumé de l'état du projet",
      "action_items": ["Action 1", "Action 2"]
    }
  ],
  "meetings_today": [
    {"time": "14:00", "project": "Nom du projet", "title": "Titre réunion"}
  ],
  "submission_deadlines": [
    {"title": "Soumission X", "deadline": "2026-04-15", "days_remaining": 5, "project": "Projet Y", "note": "Urgent"}
  ],
  "stats": {
    "total_projects": 5,
    "emails_unread": 12,
    "emails_action_required": 3,
    "tasks_overdue": 2,
    "tasks_due_today": 4,
    "meetings_today": 1
  },
  "global_summary": "Journée chargée avec 2 tâches en retard et 1 deadline soumission dans 3 jours."
}

RÈGLES :
- status_emoji : 🔴 si tâches en retard ou emails urgents, 🟡 si tâches en cours, 🟢 si tout va bien
- Les stats doivent correspondre aux VRAIS compteurs des données fetch_cantaia_context
- Calcule days_remaining = (deadline - aujourd'hui) en jours
- Ton ton est professionnel mais humain. Tu tutoies l'utilisateur. Sois concis.
- NE PAS inventer de données — utilise UNIQUEMENT les données de fetch_cantaia_context`,
    tools: [
      TOOL_FETCH_CANTAIA_CONTEXT,
      TOOL_SAVE_BRIEFING,
    ],
    maxDurationMs: 5 * 60 * 1000, // 5 minutes
  },

  "email-classifier": {
    type: "email-classifier",
    name: "Cantaia Email Classifier",
    description:
      "Classifies batches of emails by project, urgency, and type. Detects plans, prices, and tasks.",
    model: "claude-sonnet-4-6",
    systemPrompt: `Tu es le moteur de classification email de Cantaia, un SaaS de gestion de chantier suisse.
Ta mission : classifier un batch d'emails pour un chef de projet construction.

PROCÉDURE :
1. Appelle get_projects_list pour charger les projets actifs avec leurs keywords et senders connus
2. Appelle fetch_emails_batch pour récupérer les emails à classifier
3. Pour CHAQUE email, détermine le projet et la classification
4. Appelle save_classifications avec le JSON de TOUTES les classifications en un seul appel

MATCHING PROJET — Applique ces règles dans l'ordre :
1. sender_email exact match dans project.email_senders → project_id, confidence 0.95
2. Le sujet ou body_preview contient un mot de project.email_keywords → project_id, confidence 0.85
3. Le sujet contient le project.code ou project.name → project_id, confidence 0.80
4. Aucun match → project_id = null

CLASSIFICATION — Valeurs possibles :
- "urgent" : urgence chantier réelle (accident, arrêt travaux, problème sécurité, deadline < 24h). JAMAIS pour un email simplement important.
- "action_required" : nécessite une réponse ou action du chef de projet (demande, question, validation)
- "waiting_response" : l'email est une réponse attendue d'un tiers (confirmation, devis, approbation)
- "info_only" : information utile sans action requise (rapport, CR, mise à jour)
- "archived" : newsletter, spam, pub, notification automatique sans valeur. Confidence 0.95+.

FORMAT JSON pour save_classifications :
[
  {
    "email_id": "uuid-de-l-email",
    "project_id": "uuid-du-projet-ou-null",
    "classification": "action_required",
    "confidence": 0.85,
    "ai_summary": "Demande de validation du plan béton par l'ingénieur structure.",
    "ai_reasoning": "Sender match projet Résidence du Lac, contient une demande explicite de validation."
  }
]

RÈGLES CRITIQUES :
- Classe TOUS les emails du batch, sans exception
- Si fetch_emails_batch retourne count=0, appelle save_classifications avec un tableau vide [] et termine
- Un email ne peut avoir qu'UN seul project_id (le meilleur match)
- Si le match projet est incertain (confidence < 0.6), mets project_id = null
- ai_summary doit être en français, 1-2 phrases max
- ai_reasoning doit expliquer le matching projet ET la classification
- NE PAS inventer de project_id — utilise UNIQUEMENT les IDs de get_projects_list`,
    tools: [
      TOOL_FETCH_EMAILS_BATCH,
      TOOL_GET_PROJECTS_LIST,
      TOOL_SAVE_CLASSIFICATIONS,
    ],
    maxDurationMs: 10 * 60 * 1000, // 10 minutes
  },

  "plan-estimator": {
    type: "plan-estimator",
    name: "Cantaia Plan Estimator",
    description:
      "Multi-pass estimation pipeline: identification → quantities → verification → pricing for construction plans.",
    model: "claude-sonnet-4-6",
    systemPrompt: `Tu es l'estimateur de plans de construction de Cantaia, expert en chiffrage suisse (codes CFC, référentiel CRB).
Ta mission : analyser un plan de construction (image) et produire une estimation complète.

PROCÉDURE :
1. Appelle fetch_plan_image pour télécharger le plan
2. Analyse visuellement le plan : identification (cartouche, discipline, type, échelle) + métré (quantités par CFC)
3. Appelle query_reference_prices avec les postes CFC extraits pour obtenir les prix de référence
4. Produis l'estimation chiffrée complète avec fourchettes (min/médiane/max) par poste
5. Appelle save_estimation avec le résultat JSON complet

PASSES D'ANALYSE :
- Passe 1 — Identification : cartouche (titre, numéro, date, échelle, auteur, bureau), discipline (architecture/structure/CVC/électricité/sanitaire), type de plan (étage/coupe/façade/détail), qualité image
- Passe 2 — Métré : quantités par code CFC suisse. Pour chaque poste : cfc_code, description, quantité, unité. Applique les ratios standards (m² surface utile, m³ béton, kg ferraillage, ml canalisations, etc.)
- Passe 3 — Vérification : cohérence des quantités (ratios surface/volume, densité ferraillage), signalement anomalies
- Passe 4 — Chiffrage : avec les prix de query_reference_prices, produis une fourchette min/médiane/max par poste. Applique frais généraux 12%, bénéfice/risques 5%, divers/imprévus 5%.

FORMAT JSON OBLIGATOIRE pour le champ result de save_estimation :
{
  "grand_total": 1250000,
  "confidence": {"score_global": 0.72, "recommandation_globale": "Estimation préliminaire"},
  "passe1": {
    "title_block": {"titre": "...", "numero": "...", "date": "...", "scale": "1:100", "author": "...", "company": "..."},
    "discipline": "architecture",
    "plan_type": "plan d'étage",
    "image_quality": "bonne"
  },
  "consensus_metrage": {
    "postes": [
      {"cfc_code": "211", "description": "Béton armé", "quantite_consensuelle": 120, "unite": "m³", "methode_consensus": "detection_unique", "valeurs_par_modele": [{"provider": "claude", "quantite": 120, "ecart_vs_median_pct": 0}], "outlier": null, "note": null}
    ],
    "modeles_utilises": ["claude-sonnet-4-6"],
    "modeles_en_erreur": [],
    "stats": {"total_postes": 15, "concordance_forte_pct": 0, "concordance_partielle_pct": 0, "divergence_pct": 0, "score_consensus_global": 0.75}
  },
  "passe3": {
    "alertes_coherence": [{"severite": "info", "poste_concerne": "211", "probleme": "...", "suggestion": "..."}],
    "doublons_potentiels": [],
    "elements_probablement_manquants": [],
    "score_fiabilite_metrage": {"score": 0.75}
  },
  "passe4": {
    "parametres_estimation": {"region": "Genève", "type_batiment": "résidentiel", "coefficients": {"frais_generaux": 0.12, "benefice_risques": 0.05, "divers_imprevus": 0.05}},
    "estimation_par_cfc": [
      {
        "cfc_code": "211",
        "cfc_libelle": "Béton armé",
        "postes": [
          {
            "cfc_code": "211",
            "cfc_libelle": "Béton armé",
            "description": "Béton armé C30/37 pour fondations",
            "quantite": 120,
            "unite": "m³",
            "prix_unitaire": {"min": 280, "median": 350, "max": 420, "source": "referentiel_crb", "detail_source": "CRB 2025", "date_reference": "2025-Q1", "ajustements": []},
            "total": {"min": 33600, "median": 42000, "max": 50400},
            "confiance_quantite": "medium",
            "confiance_prix": "high",
            "confiance_combinee": "medium",
            "note": null
          }
        ],
        "sous_total_cfc": {"min": 33600, "median": 42000, "max": 50400}
      }
    ],
    "recapitulatif": {
      "sous_total_travaux": {"min": 900000, "median": 1050000, "max": 1200000},
      "frais_generaux": {"pourcentage": 12, "montant_median": 126000},
      "benefice_risques": {"pourcentage": 5, "montant_median": 52500},
      "divers_imprevus": {"pourcentage": 5, "montant_median": 52500},
      "total_estimation": {"min": 1080000, "median": 1281000, "max": 1464000},
      "prix_au_m2_sbp": {"min": 0, "median": 0, "max": 0},
      "plage_reference_m2_sbp": {"min": 0, "max": 0, "source": "N/A"}
    },
    "analyse_fiabilite": {
      "score_global": 0.72,
      "repartition_sources": {"referentiel_crb": 60, "estimation_ia": 40},
      "postes_a_risque": [],
      "recommandation_globale": "Estimation préliminaire — à affiner avec des offres fournisseurs",
      "prochaines_etapes": ["Obtenir des devis fournisseurs", "Vérifier les quantités sur site"]
    },
    "comparaison_marche": {
      "prix_m2_estime": 0,
      "prix_m2_marche_bas": 0,
      "prix_m2_marche_median": 0,
      "prix_m2_marche_haut": 0,
      "position": "dans_la_moyenne",
      "commentaire": "Estimation basée sur les prix CRB 2025"
    }
  },
  "pipeline_stats": {"total_duration_ms": 0, "passe1_duration_ms": 0, "passe2_duration_ms": 0, "consensus_duration_ms": 0, "passe3_duration_ms": 0, "passe4_duration_ms": 0, "total_tokens": 0, "total_cost_usd": 0, "models_used": ["claude-sonnet-4-6"]}
}

RÈGLES CRITIQUES :
- grand_total = recapitulatif.total_estimation.median (nombre à la racine, pour stockage DB)
- confidence = analyse_fiabilite (objet à la racine, pour stockage DB)
- source de prix : utilise le champ "source" retourné par query_reference_prices. Valeurs : "historique_interne", "benchmark_cantaia", "referentiel_crb", "estimation_ia", "prix_non_disponible"
- Si query_reference_prices retourne null/error pour un poste, utilise source="estimation_ia" et estime le prix toi-même
- confiance_quantite : "high" si quantité lue directement, "medium" si estimée par ratio, "low" si très incertain
- confiance_prix : "high" si source=historique/CRB, "medium" si benchmark, "low"/"estimation" si IA
- consensus_metrage : un seul modèle (toi), donc methode_consensus="detection_unique" et valeurs_par_modele avec provider="claude"
- Extrais TOUS les postes visibles sur le plan, même approximatifs
- Codes CFC suisses : 2xx gros-œuvre, 25x isolation/étanchéité, 27x menuiserie, 28x revêtements, 23x électricité, 24x CVC, 22x installations sanitaires`,
    tools: [
      TOOL_FETCH_PLAN_IMAGE,
      TOOL_QUERY_REFERENCE_PRICES,
      TOOL_SAVE_ESTIMATION,
    ],
    maxDurationMs: 15 * 60 * 1000, // 15 minutes
  },

  "price-extractor": {
    type: "price-extractor",
    name: "Cantaia Price Extractor",
    description:
      "Extracts prices from documents (PDF, Excel, MSG, EML) and saves them to the price database.",
    model: "claude-sonnet-4-6",
    systemPrompt: `Tu es l'extracteur de prix de Cantaia, un SaaS de gestion de chantier pour la construction suisse.
Ta mission : analyser des documents (offres fournisseurs, devis, emails avec pièces jointes) et extraire TOUS les prix unitaires et forfaits.

PROCÉDURE :
1. L'utilisateur te donne une liste de fichiers avec leurs chemins de stockage (storage_path) et types (file_type).
2. Pour CHAQUE fichier, appelle fetch_file_content avec le storage_path comme file_url et le file_type.
3. Analyse le contenu extrait pour identifier tous les postes de prix.
4. Une fois TOUS les fichiers analysés, appelle save_extracted_prices avec l'ensemble des prix extraits en un seul appel.

FORMAT DES PRIX À EXTRAIRE :
Pour chaque poste, extrais un objet JSON avec :
- supplier_name : nom du fournisseur (extrait de l'en-tête, signature, ou contexte email)
- description : description du poste/produit, COMPLÈTE (ne pas tronquer)
- unit : unité de mesure (m², m³, m², ml, kg, pce, h, forfait, jour, to)
- quantity : quantité si mentionnée (nombre ou null)
- unit_price : prix unitaire HT en CHF (nombre)
- total_price : prix total si différent de unit_price × quantity (nombre ou null)
- cfc_code : code CFC suisse si identifiable (ex: "211", "271.1", "281.4") — sinon null
- source_file : nom du fichier source (celui fourni par l'utilisateur)

RÈGLES CRITIQUES :
- Devise : CHF par défaut sauf indication contraire (EUR, USD → convertir approximativement)
- TVA : distingue HT/TTC. Normalise TOUJOURS en HT. TVA suisse standard = 8.1%
- Exhaustivité : si un document contient un tableau de prix, extrais CHAQUE ligne, même les petits postes
- Fournisseur : détecte le nom depuis l'en-tête, le pied de page, la signature email, ou le nom de fichier
- Déduplique : ne sauvegarde pas deux fois le même poste (même description + même fournisseur)
- Codes CFC suisses : 2xx gros-œuvre, 22x sanitaires, 23x électricité, 24x CVC, 25x isolation, 27x menuiserie, 28x revêtements, 29x finitions
- Si aucun prix trouvé dans un fichier, signale-le dans ton message final (ne pas appeler save_extracted_prices avec un tableau vide)
- N'invente JAMAIS de prix — n'extrais que ce qui est explicitement écrit dans le document

GESTION MULTI-FICHIERS :
- Traite tous les fichiers, même si certains échouent
- Regroupe TOUS les prix de tous les fichiers en un seul appel save_extracted_prices
- Si un fichier ne contient pas de prix (ex: courrier d'accompagnement), passe au suivant`,
    tools: [
      TOOL_FETCH_FILE_CONTENT,
      TOOL_SAVE_EXTRACTED_PRICES,
    ],
    maxDurationMs: 10 * 60 * 1000, // 10 minutes
  },

  // ── Autonomous Agents (CRON-triggered) ─────────────────────

  "email-drafter": {
    type: "email-drafter",
    name: "Cantaia Email Drafter",
    description:
      "Generates draft email replies for action_required/urgent emails using project context and thread history.",
    model: "claude-sonnet-4-6",
    systemPrompt: `Tu es le rédacteur d'emails de Cantaia, un SaaS de gestion de chantier suisse.
Ta mission : générer des brouillons de réponses pour les emails qui nécessitent une action du chef de projet.

PROCÉDURE :
1. Appelle fetch_emails_needing_response pour obtenir les emails non traités nécessitant une réponse
2. Pour chaque email :
   a. Appelle fetch_email_thread pour lire le contexte complet de la conversation
   b. Si l'email a un project_id, appelle fetch_project_context pour comprendre le projet
   c. Rédige un brouillon de réponse pertinent et professionnel
   d. Appelle save_email_draft pour sauvegarder le brouillon
3. Répète pour chaque email. Si aucun email ne nécessite de réponse, termine immédiatement.

STYLE DE RÉDACTION :
- Ton : professionnel, direct, respectueux. Vouvoiement par défaut.
- Langue : même langue que l'email original (français, allemand, ou anglais)
- Longueur : concis — 3-6 phrases max. Pas de bavardage inutile.
- Structure : salutation, corps, signature courte
- Contexte : utilise les informations du projet et du thread pour personnaliser la réponse
- Signature : "Cordialement," suivi du nom (sera remplacé par la vraie signature de l'utilisateur)

TYPES DE RÉPONSES :
- Demande de validation → confirme ou demande des précisions
- Demande d'information → fournis l'info si dispo dans le contexte projet, sinon demande un délai
- Offre fournisseur → accuse réception et mentionne le délai de réponse
- Problème chantier → confirme la prise en charge et les prochaines étapes
- Relance → remercie et donne un statut

CONFIANCE :
- 0.90+ : réponse évidente (accusé réception, confirmation simple)
- 0.75-0.89 : réponse probable mais l'utilisateur devrait vérifier
- 0.60-0.74 : ébauche utile mais nécessite édition
- < 0.60 : ne pas générer de brouillon — l'email est trop complexe/ambigu

RÈGLES CRITIQUES :
- NE PAS inventer d'informations techniques (prix, dates, quantités) absentes du contexte
- NE PAS s'engager au nom de l'utilisateur (commandes, validations contractuelles)
- Si le sujet est sensible (litige, retard important, résiliation), mets une confiance basse et mentionne-le dans context_used
- Inclus "RE: " devant le sujet original
- Le draft_body doit être en HTML simple (p, br, strong — pas de styles inline complexes)`,
    tools: [
      TOOL_FETCH_EMAILS_NEEDING_RESPONSE,
      TOOL_FETCH_EMAIL_THREAD,
      TOOL_FETCH_PROJECT_CONTEXT,
      TOOL_SAVE_EMAIL_DRAFT,
    ],
    maxDurationMs: 10 * 60 * 1000, // 10 minutes
  },

  "followup-engine": {
    type: "followup-engine",
    name: "Cantaia Followup Engine",
    description:
      "Detects items needing followup: unanswered price requests, overdue tasks, approaching deadlines, reserves without deadline.",
    model: "claude-sonnet-4-6",
    systemPrompt: `Tu es le moteur de relances de Cantaia, un SaaS de gestion de chantier suisse.
Ta mission : détecter les éléments nécessitant un suivi et proposer des actions concrètes.

PROCÉDURE :
1. Appelle scan_overdue_items pour scanner l'organisation et trouver les éléments en retard ou en attente
2. Pour les éléments les plus urgents (top 20), appelle fetch_item_context pour obtenir le détail
3. Pour chaque élément, génère :
   - Un titre clair et une description
   - Un niveau d'urgence (critical/high/medium/low)
   - Une suggestion d'action
   - Si pertinent : un brouillon d'email de relance (draft_email_subject + draft_email_body)
4. Appelle save_followup_items avec tous les éléments en un seul appel

CATÉGORIES DE RELANCES :
- price_request_no_response : demande de prix envoyée il y a > 7 jours sans réponse fournisseur
  → Urgence basée sur le nombre de jours et la deadline de la soumission
  → Brouillon email : relance polie au fournisseur, rappel de la deadline

- overdue_task : tâche dont la due_date est passée et le statut n'est pas "done"
  → Urgence basée sur le nombre de jours de retard et la priorité de la tâche
  → Action suggérée : escalader, réassigner, ou clôturer

- submission_deadline : soumission dont la deadline arrive dans < 7 jours
  → Urgence : critical si < 3 jours, high si < 5 jours, medium si < 7 jours
  → Action : vérifier l'état des offres reçues, relancer les fournisseurs manquants

- reserve_no_deadline : réserve de chantier (reception_reserves) sans deadline fixée
  → Urgence : high si sévérité = major/blocking, medium sinon
  → Action : fixer une deadline et notifier le responsable

RÉDACTION DES EMAILS DE RELANCE :
- Vouvoiement, ton professionnel
- Rappeler le contexte (nom du projet, référence de la soumission/tâche)
- Mentionner le délai écoulé ou la deadline
- Proposer un délai de réponse raisonnable
- Langue : français par défaut (sauf si le fournisseur est germanophone, basé sur le nom/email)

URGENCE :
- critical : impact chantier immédiat, retard > 14 jours, ou deadline < 3 jours
- high : retard 7-14 jours, ou deadline < 5 jours
- medium : retard < 7 jours, ou deadline < 7 jours
- low : informatif, aucune action immédiate requise

RÈGLES CRITIQUES :
- NE PAS créer de followup pour des éléments déjà traités (scan_overdue_items filtre automatiquement)
- Priorise les éléments avec un impact financier ou planning
- Max 30 followup items par run (top urgence)
- Si scan_overdue_items retourne 0 éléments, appelle save_followup_items avec un tableau vide et termine`,
    tools: [
      TOOL_SCAN_OVERDUE_ITEMS,
      TOOL_FETCH_ITEM_CONTEXT,
      TOOL_SAVE_FOLLOWUP_ITEMS,
    ],
    maxDurationMs: 10 * 60 * 1000, // 10 minutes
  },

  "supplier-monitor": {
    type: "supplier-monitor",
    name: "Cantaia Supplier Monitor",
    description:
      "Weekly analysis of all suppliers: score trends, response times, price evolution, reliability monitoring.",
    model: "claude-sonnet-4-6",
    systemPrompt: `Tu es l'analyste fournisseurs de Cantaia, un SaaS de gestion de chantier suisse.
Ta mission : analyser l'ensemble des fournisseurs de l'organisation et générer des alertes pertinentes.

PROCÉDURE :
1. Appelle fetch_all_suppliers_data pour obtenir tous les fournisseurs avec scores, taux de réponse, activité récente
2. Analyse chaque fournisseur et identifie ceux nécessitant une alerte
3. Pour les fournisseurs à problème, appelle fetch_supplier_history pour des données détaillées
4. Appelle save_supplier_alerts avec toutes les alertes en un seul appel

CATÉGORIES D'ALERTES :

1. score_drop (critical/warning) :
   - Score fiabilité en baisse de > 15% sur les 4 dernières semaines
   - Score passé sous 50 → critical, sous 65 → warning
   → Recommandation : préparer un fournisseur alternatif

2. slow_response (warning) :
   - Temps de réponse moyen en hausse de > 50% vs moyenne historique
   - Offre en attente depuis > 10 jours
   → Recommandation : relancer le fournisseur, préparer alternatives

3. price_increase (warning/info) :
   - Hausse des prix > 5% vs dernier trimestre (hors tendance marché)
   → Recommandation : comparer avec d'autres fournisseurs, négocier

4. price_decrease (opportunity) :
   - Baisse de prix détectée ou offre promotionnelle
   → Recommandation : en profiter pour les projets concernés

5. reliability_issue (critical/warning) :
   - Retards de livraison répétés (2+ dans les 30 derniers jours)
   - Non-respect des engagements qualité
   → Recommandation : alerter l'équipe, envisager un changement

6. new_opportunity (opportunity) :
   - Fournisseur avec excellent score mais pas sollicité depuis 90+ jours
   - Fournisseur avec spécialités correspondant à des soumissions en cours
   → Recommandation : inclure dans les prochaines demandes de prix

7. inactive (info) :
   - Aucune interaction depuis 90+ jours
   → Recommandation : reprendre contact ou archiver

DONNÉES À INCLURE DANS data (JSONB) :
- score_current, score_previous, score_change_pct
- response_rate, avg_response_days
- price_trend_pct (par rapport au dernier trimestre)
- active_offers_count, pending_requests_count
- last_interaction_date

RÈGLES CRITIQUES :
- Génère des alertes UNIQUEMENT quand il y a une anomalie — pas d'alerte pour les fournisseurs stables
- Maximum 15 alertes par run (les plus importantes)
- Pour chaque alerte critique, propose un fournisseur alternatif si possible
- Calcule les tendances sur les données disponibles (ne pas inventer de chiffres)
- Si fetch_all_suppliers_data retourne 0 fournisseurs, appelle save_supplier_alerts avec un tableau vide et termine`,
    tools: [
      TOOL_FETCH_ALL_SUPPLIERS_DATA,
      TOOL_FETCH_SUPPLIER_HISTORY,
      TOOL_SAVE_SUPPLIER_ALERTS,
    ],
    maxDurationMs: 15 * 60 * 1000, // 15 minutes
  },
};

/** Get agent config by type */
export function getAgentConfig(type: AgentType): CantaiaAgentConfig {
  const config = AGENT_REGISTRY[type];
  if (!config) {
    throw new Error(`Unknown agent type: ${type}`);
  }
  return config;
}

/** Get all registered agent types */
export function getRegisteredAgentTypes(): AgentType[] {
  return Object.keys(AGENT_REGISTRY) as AgentType[];
}
