// ============================================================
// Cantaia — Centralized AI Prompts
// ============================================================

export interface EmailClassifyContext {
  projects_list: string;
  sender_email: string;
  sender_name: string;
  subject: string;
  body_content: string;
  received_at: string;
}

export function buildEmailClassifyPrompt(ctx: EmailClassifyContext): string {
  return `Tu es un expert en gestion de projets de construction suisse. Analyse cet email et détermine à quel projet il appartient.

PROJETS ACTIFS DE L'UTILISATEUR :
${ctx.projects_list}
Chaque projet a un nom, un code, des mots-clés, des expéditeurs connus, une ville et un client.

EMAIL À CLASSIFIER :
- Expéditeur : ${ctx.sender_name} <${ctx.sender_email}>
- Objet : ${ctx.subject}
- Date : ${ctx.received_at}
- Contenu COMPLET :
${ctx.body_content}

ANALYSE EN 3 CAS :

CAS A — L'email correspond à un PROJET EXISTANT :
- L'expéditeur correspond à un expéditeur connu d'un projet
- L'objet contient le nom du projet, un numéro de référence, un code CFC
- Le contenu mentionne une adresse, un lot, un intervenant d'un projet existant
→ Retourner match_type: "existing_project" avec project_id

CAS B — L'email concerne un NOUVEAU projet/chantier NON référencé :
- L'email parle d'un chantier/projet/mandat qui n'est dans aucun des projets listés
- L'expéditeur est inconnu de tous les projets existants
- L'objet contient un nom de lieu ou de bâtiment non référencé
- Contexte : plans d'avant-projet, appel d'offres, premier contact architecte, etc.
→ Retourner match_type: "new_project" avec les infos extraites

CAS C — L'email est personnel/admin/spam/newsletter :
- Newsletter, publicité, facture interne, RH, IT
- Email sans rapport avec un chantier de construction
- Abonnements, promotions fournisseurs génériques
→ Retourner match_type: "no_project" avec la catégorie

RÈGLES :
1. Analyse le sujet, l'expéditeur ET le contenu complet
2. Pour les emails transférés (FW:/TR:/Fwd:/WG:), analyse le contenu original
3. Cherche des indices dans : noms de personnes, entreprises, adresses, codes CFC, noms de chantier
4. Si l'expéditeur correspond à un expéditeur connu → forte probabilité projet existant
5. Si des mots-clés d'un projet apparaissent → probablement ce projet
6. Un email peut contenir des indices subtils : signature, référence de dossier, adresse de chantier

RÉSUMÉ ACTIONNABLE (summary_fr) :
UNE PHRASE. Format : "[Qui] [fait quoi] → [action requise ou 'aucune action requise']"
Exemples :
- "ETAVIS signale un tube manquant sur le chantier → à coordonner avec Bilgin"
- "L'architecte envoie les plans d'avant-projet d'un nouveau EMS à Crissier → nouveau projet potentiel"
- "Newsletter Hilti — nouvelles solutions de fixation → aucune action requise"
Si email vide/incompréhensible → retourne "—"

Réponds UNIQUEMENT en JSON :
{
  "match_type": "existing_project" | "new_project" | "no_project",
  "confidence": <0.00-1.00>,

  // Si existing_project :
  "project_id": "<uuid du projet>",
  "classification": "action_required" | "info_only" | "urgent" | "waiting_response",

  // Si new_project :
  "suggested_project": {
    "name": "<nom du projet extrait>",
    "reference": "<code référence suggéré ou null>",
    "client": "<client extrait ou null>",
    "location": "<ville, canton ou null>",
    "type": "<type : résidentiel, EMS, bureau, industriel, rénovation, infrastructure ou null>",
    "extracted_contacts": [
      {"name": "<nom>", "company": "<entreprise>", "email": "<email>", "role": "<architect|engineer|contractor|client|other>"}
    ]
  },
  "classification": "action_required" | "info_only",

  // Si no_project :
  "email_category": "personal" | "administrative" | "spam" | "newsletter",

  // Toujours présent :
  "reasoning": "<explication courte de la classification>",
  "summary_fr": "<résumé actionnable 1 phrase>",
  "summary_en": "<actionable summary 1 sentence>",
  "summary_de": "<aktionsfähige Zusammenfassung 1 Satz>",
  "contains_task": <true|false>,
  "task": {
    "title": "<titre si détectée>",
    "due_date": "<YYYY-MM-DD ou null>",
    "assigned_to_name": "<nom ou null>",
    "assigned_to_company": "<entreprise ou null>",
    "priority": "low" | "medium" | "high" | "urgent"
  }
}`;
}

export interface TaskExtractContext {
  project_name: string;
  sender: string;
  subject: string;
  body: string;
}

export function buildTaskExtractPrompt(ctx: TaskExtractContext): string {
  return `Tu es un assistant pour chefs de projet construction. Analyse cet email et
extrais TOUTES les tâches/actions implicites ou explicites.

Email :
- Projet : ${ctx.project_name}
- De : ${ctx.sender}
- Objet : ${ctx.subject}
- Contenu : ${ctx.body}

Pour chaque tâche détectée, retourne :
{
  "tasks": [
    {
      "title": "<action claire et concise>",
      "description": "<contexte de l'email>",
      "assigned_to_name": "<qui doit agir>",
      "assigned_to_company": "<entreprise>",
      "due_date": "<YYYY-MM-DD ou null>",
      "priority": "<low|medium|high|urgent>",
      "source_quote": "<phrase exacte de l'email qui implique cette tâche>"
    }
  ]
}

Règles :
- "Merci de nous envoyer..." = tâche pour le destinataire
- "Nous reviendrons vers vous..." = tâche en attente
- Une date mentionnée = deadline
- "Urgent", "dès que possible", "rapidement" = priorité haute
- Si aucune tâche détectée, retourne {"tasks": []}`;
}

export interface PVGenerateContext {
  project_name: string;
  project_code: string;
  meeting_number: number;
  meeting_date: string;
  location: string;
  participants: string;
  transcription: string;
  language: string;
}

export function buildPVGeneratePrompt(ctx: PVGenerateContext): string {
  return `Tu es un rédacteur professionnel de procès-verbaux de séances de chantier
en Suisse. Tu connais les normes SIA et les pratiques suisses.

Informations de la réunion :
- Projet : ${ctx.project_name} (${ctx.project_code})
- Séance n° : ${ctx.meeting_number}
- Date : ${ctx.meeting_date}
- Lieu : ${ctx.location}
- Participants connus : ${ctx.participants}

Transcription de la réunion :
${ctx.transcription}

Génère un PV structuré en JSON avec le format suivant :
{
  "header": {
    "project_name": "",
    "project_code": "",
    "meeting_number": 0,
    "date": "",
    "location": "",
    "next_meeting_date": "<si mentionné>",
    "participants": [
      {"name": "", "company": "", "role": "", "present": true}
    ],
    "absent": [
      {"name": "", "company": "", "excused": true}
    ],
    "distribution": ["<liste de diffusion>"]
  },
  "sections": [
    {
      "number": "1",
      "title": "<titre du point traité>",
      "content": "<résumé des discussions>",
      "decisions": ["<décision prise>"],
      "actions": [
        {
          "description": "<action à entreprendre>",
          "responsible_name": "<personne>",
          "responsible_company": "<entreprise>",
          "deadline": "<date ou description>",
          "priority": "<normal|urgent>"
        }
      ]
    }
  ],
  "next_steps": ["<prochaines étapes générales>"],
  "summary_fr": "<résumé global en 3-5 lignes>"
}

Règles :
- Utilise un ton professionnel et neutre
- Numérote les sections (1, 2, 3...)
- Extrais TOUTES les actions mentionnées avec un responsable
- Si un intervenant n'est pas identifié, note "Intervenant non identifié"
- Les décisions doivent être clairement séparées des discussions
- La langue du PV doit être : ${ctx.language}`;
}

export interface BriefingGenerateContext {
  user_name: string;
  today: string;
  per_project_data: string;
}

export function buildBriefingGeneratePrompt(
  ctx: BriefingGenerateContext
): string {
  return `Tu es l'assistant IA d'un chef de projet construction. Génère son briefing
matinal concis et actionnable.

Utilisateur : ${ctx.user_name}
Date : ${ctx.today}

Données par projet :
${ctx.per_project_data}
(inclut : emails non traités, tâches en retard, tâches dues aujourd'hui,
réunions du jour, dernières alertes)

Génère un briefing en JSON :
{
  "greeting": "<Bonjour {prénom}, voici votre briefing du {date}.>",
  "priority_alerts": [
    "<alertes critiques, max 3>"
  ],
  "projects": [
    {
      "project_id": "",
      "name": "",
      "status_emoji": "<🟢|🟡|🔴>",
      "summary": "<1-2 phrases>",
      "action_items": ["<actions prioritaires>"]
    }
  ],
  "meetings_today": [
    {"time": "", "project": "", "title": ""}
  ],
  "global_summary": "<résumé en 2-3 phrases>"
}

Ton : professionnel mais humain. Pas de jargon inutile. Va droit au but.`;
}
