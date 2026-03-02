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
  recipients?: string;
}

export function buildEmailClassifyPrompt(ctx: EmailClassifyContext): string {
  return `Tu es un expert en gestion de projets de construction suisse. Analyse cet email et détermine à quel projet il appartient.

PROJETS ACTIFS DE L'UTILISATEUR :
${ctx.projects_list}
Chaque projet a un nom, un code, des mots-clés, des expéditeurs connus, une ville et un client.

EMAIL À CLASSIFIER :
- Expéditeur : ${ctx.sender_name} <${ctx.sender_email}>
- Destinataires (TO/CC) : ${ctx.recipients || "non disponibles"}
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
1. RÈGLE PRINCIPALE — PREMIER SEGMENT DU SUJET : Dans les emails de chantier suisses, la première partie du sujet (avant « – », « — » ou « : ») est presque TOUJOURS le nom ou code du projet. Après avoir retiré les préfixes TR:/RE:/FW:, le premier segment est le signal le plus fort.
   Exemples : "TR: RTS : Menetrey-BasSmets – Rapport" → premier segment = "RTS" → chercher le projet RTS
   "TR: Cèdres – Déversement" → premier segment = "Cèdres" → chercher le projet Cèdres
   "TR: CENTRAL MALLEY – Planche" → premier segment = "CENTRAL MALLEY" → chercher Central Malley
   Si le premier segment correspond clairement à un projet existant, c'est CE projet avec haute confidence (≥0.90).
   Si le premier segment ne correspond à AUCUN projet existant, c'est probablement un nouveau projet (CAS B).
2. Analyse le sujet, l'expéditeur ET le contenu complet
3. Pour les emails transférés (FW:/TR:/Fwd:/WG:), analyse le contenu original MAIS le premier segment du sujet reste prioritaire
4. Cherche des indices dans : noms de personnes, entreprises, adresses, codes CFC, noms de chantier
5. Si l'expéditeur correspond à un expéditeur connu → forte probabilité projet existant
6. Si des mots-clés d'un projet apparaissent → probablement ce projet, MAIS le premier segment du sujet a priorité en cas de conflit
7. ATTENTION AUX FAUX POSITIFS : Ne classe PAS un email dans un projet juste parce qu'un mot-clé vague correspond. Le premier segment du sujet doit être cohérent avec le projet choisi.
8. DESTINATAIRES (TO/CC) : Les destinataires en copie sont un signal important. Si des personnes connues d'un projet (listées dans "expéditeurs connus") apparaissent en TO ou CC, c'est un indice fort que l'email concerne ce projet. Analyse les noms et domaines des destinataires.

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

// ============================================================
// Plan Analysis Prompt — Construction plan AI analysis (Vision)
// ============================================================

export interface PlanAnalysisContext {
  plan_title: string;
  plan_number: string;
  discipline_hint: string | null;
  project_name: string;
  project_code: string | null;
  file_type: string;
  file_name: string;
}

export function buildPlanAnalysisPrompt(ctx: PlanAnalysisContext): string {
  return `Tu es un métreur / quantificateur professionnel suisse spécialisé dans la lecture et l'analyse de plans de construction. Tu lis les plans avec une expertise de 20 ans dans le bâtiment et le génie civil en Suisse (normes SIA, codes CFC).

CONTEXTE :
- Projet : ${ctx.project_name}${ctx.project_code ? ` (${ctx.project_code})` : ""}
- Fichier : ${ctx.file_name}
- Numéro de plan : ${ctx.plan_number}
- Titre du plan : ${ctx.plan_title}
${ctx.discipline_hint ? `- Discipline pressentie : ${ctx.discipline_hint}` : ""}

ANALYSE LE PLAN CI-JOINT EN SUIVANT CES ÉTAPES :

⚠️ ÉTAPE PRÉLIMINAIRE CRITIQUE — DÉTECTION DE VUES MULTIPLES ⚠️
AVANT de compter quoi que ce soit, examine l'ensemble du document :
- Un fichier peut contenir PLUSIEURS VUES / DESSINS du MÊME espace sur une même page ou sur plusieurs pages.
- Exemples courants : plan en plan + coupe, plan fontaine + plan hauteur des jets + plan canalisations + coupe, vue de face + vue de côté + vue de dessus, plans à différentes échelles montrant le même ouvrage.
- Ces vues montrent le MÊME ouvrage physique sous différents angles, perspectives ou avec différentes informations thématiques.

RÈGLE ABSOLUE : NE JAMAIS ADDITIONNER LES QUANTITÉS DE PLUSIEURS VUES DU MÊME OUVRAGE.
- Si le plan montre 32 jets de fontaine dans la vue "Plan Fontaine" et les mêmes 32 jets dans la vue "Plan hauteur des jets", le total est 32 jets, PAS 64.
- Si un caniveau apparaît dans la vue "Plan canalisations" et la vue "Plan canalisations inclinées", tu le comptes UNE SEULE FOIS.
- Choisis la vue la plus lisible et la plus complète pour chaque type de quantité.
- Les coupes (sections transversales) servent à comprendre les détails constructifs (épaisseurs, matériaux, profondeurs) mais ne doivent PAS être utilisées pour compter les éléments — le comptage se fait sur les vues en plan.

POUR CHAQUE QUANTITÉ EXTRAITE, demande-toi :
1. "Est-ce que cet élément apparaît aussi dans une autre vue ?" → Si oui, ne le compte qu'une fois.
2. "De quelle vue est-ce que j'extrais cette quantité ?" → Choisis la vue la plus adaptée (généralement la vue en plan à la plus grande échelle).
3. "Est-ce que je suis en train d'additionner des vues ?" → Si oui, STOP et recommence.

Liste les vues identifiées dans tes observations (ex: "Ce document contient 5 vues du même espace : Plan fontaine, Plan hauteur des jets, Plan canalisations caniveaux, Plan canalisations inclinées, Coupe A-A'").

1. IDENTIFICATION DU TYPE DE PLAN
Identifie le type exact du plan parmi : planting (plantation/paysagisme), network (réseaux/canalisations), site_layout (aménagement extérieur/implantation), electrical (électricité), facade (façades), structural (structure/gros-œuvre), hvac (CVC/chauffage-ventilation), plumbing (sanitaire), architecture (plans d'architecte), other.

2. CARTOUCHE (TITLE BLOCK)
Lis le cartouche du plan et extrais : numéro de plan, titre, échelle, date, auteur/dessinateur, bureau/entreprise, indice de révision.
IMPORTANT pour l'ÉCHELLE :
L'échelle est CRUCIALE pour toutes les estimations de surfaces et distances. Elle peut se trouver :
- Dans le cartouche classique (coin inférieur droit)
- Dans le texte du plan (ex: "Echelle 1:100" écrit dans la zone d'informations)
- Dans un bloc de texte séparé (ex: "Ech. 1:200", "Scale 1:500", "1/100")
- À côté d'une barre d'échelle graphique
- Dans les métadonnées du document (en-tête, pied de page, zone de titre)
Cherche PARTOUT dans le document, pas seulement dans le cartouche principal.
⚠️ QUAND L'ÉCHELLE EST ÉCRITE EXPLICITEMENT (ex: "Echelle 1:100", "1:200"), elle est DÉFINITIVE et EXACTE — ne la qualifie JAMAIS de "non visible", "approximative" ou "non clairement visible". Si tu lis "1:100" quelque part dans le plan, l'échelle EST 1:100, point final. Retourne-la telle quelle dans title_block.scale.

3. LÉGENDE
Identifie TOUS les éléments de la légende sans exception : symboles, couleurs, types de traits, hachures, zones colorées et leur signification.
ATTENTION PARTICULIÈRE AUX ZONES DE SURFACE :
- Les zones colorées (vert = gazon/végétation, beige/hachuré = surface stabilisée, gris = enrobé, etc.) représentent des SURFACES qui doivent être QUANTIFIÉES en m².
- Chaque type de surface identifié dans la légende DOIT apparaître dans le quantitatif avec une estimation de sa surface en m².
- Utilise l'échelle du plan pour convertir les surfaces visuelles en m² réels.
- Les hachures, aplats de couleur et motifs de remplissage indiquent souvent des types de revêtements ou de sols — ils sont aussi importants que les éléments ponctuels.

4. QUANTITATIF — EXTRACTION DES QUANTITÉS
C'est la partie la plus importante. En te basant sur l'échelle, la légende, les symboles et les couleurs.
RAPPEL : si le document contient plusieurs vues du même ouvrage, ne compte chaque élément qu'UNE SEULE FOIS en choisissant la vue la plus appropriée.

Pour un PLAN DE PLANTATION (paysagisme) :
- Compte chaque plante individuellement par variété/espèce (nom latin si visible)
- SURFACES OBLIGATOIRES : mesure TOUTES les surfaces visibles en m² grâce à l'échelle :
  → Gazon / prairie (souvent en vert sur le plan)
  → Surfaces végétalisées / couvre-sol
  → Surfaces stabilisées / revêtements (souvent en beige ou hachuré)
  → Massifs de plantation
  → Toute zone colorée ou hachurée identifiée dans la légende
- Pour estimer les m² : utilise l'échelle (ex: à 1:100, 1cm sur le plan = 1m réel, donc 1cm² = 1m²)
- Note les tailles (hauteur, contenance, force)
- Compte les arbres, arbustes, vivaces séparément
- Identifie les éléments d'aménagement liés : bordures, pavés, dallages, mobilier

Pour un PLAN DE RÉSEAUX (canalisations) :
- Mesure les mètres linéaires (ml) de chaque type de canalisation par diamètre
- Distingue : eaux usées (EU), eaux claires (EC), eaux pluviales (EP), eau potable
- Compte les chambres/regards par diamètre (Ø600, Ø800, Ø1000, etc.)
- Note les pentes, les matériaux (PVC, béton, PE, fonte)
- Compte les raccordements, bouches d'égout, grilles

Pour un PLAN D'AMÉNAGEMENT / IMPLANTATION :
- Mesure les surfaces (m²) par type de revêtement : enrobé, béton (sablé, balayé, désactivé, lissé), pavés, dalles, gravier
- Mesure les mètres linéaires de bordures, caniveaux, murets
- Compte les éléments ponctuels : potelets, bornes, bancs, poubelles, candélabres
- Mesure les surfaces vertes, plantations

Pour un PLAN ÉLECTRIQUE :
- Compte les circuits par type
- Compte les tableaux électriques, prises, interrupteurs, luminaires par type
- Mesure les mètres linéaires de chemins de câbles, goulottes
- Note les puissances si indiquées

Pour un PLAN DE FAÇADE :
- Mesure les surfaces (m²) par matériau/finition
- Compte les fenêtres et portes avec dimensions
- Mesure les surfaces d'isolation, de crépis
- Note les types de revêtements, couleurs RAL

Pour un PLAN DE STRUCTURE (gros-œuvre) :
- Estime les volumes de béton (m³) par élément (dalle, mur, poteau, poutre)
- Estime les surfaces de coffrage (m²)
- Note les épaisseurs, classes de béton si indiquées
- Identifie les éléments préfabriqués

Pour un PLAN CVC (chauffage-ventilation-climatisation) :
- Mesure les ml de conduites par diamètre
- Compte les diffuseurs, bouches d'extraction/soufflage
- Note les puissances, débits si indiqués
- Identifie les équipements principaux (CTA, chaudière, PAC)

Pour un PLAN SANITAIRE :
- Mesure les ml de conduites par diamètre et type (eau froide, eau chaude, évacuation)
- Compte les appareils sanitaires par type
- Identifie les colonnes montantes, descentes

Pour TOUT TYPE DE PLAN :
- Note les dimensions et cotes principales
- Identifie les matériaux spécifiés
- Relève les annotations textuelles importantes
- SURFACES : toute zone colorée, hachurée ou délimitée par un contour dans la légende DOIT être quantifiée en m² — utilise l'échelle pour convertir
- COTES ÉCRITES : si des dimensions sont annotées sur le plan (longueurs, largeurs), utilise-les en priorité pour calculer les surfaces et longueurs
- ÉCHELLE : si l'échelle est indiquée (ex: 1:100), rappelle-la dans le cartouche ET utilise-la systématiquement pour toutes les estimations de surface et de longueur

5. OBSERVATIONS PROFESSIONNELLES
Donne 3-5 observations de métreur professionnel : points d'attention, éléments manquants, incohérences éventuelles, recommandations.
- Si le document contient plusieurs vues/dessins, LISTE-LES avec leur titre et leur échelle.
- Indique de quelle vue tu as extrait chaque type de quantité.
- Signale si certains éléments n'ont pas pu être quantifiés car trop petits ou illisibles.

6. RÉSUMÉ
Un paragraphe de synthèse en français décrivant le contenu principal du plan. Si le document contient plusieurs vues, mentionne-le.

RÉPONSE EN JSON VALIDE UNIQUEMENT (pas de commentaires, pas de markdown) :
{
  "plan_type": "network",
  "discipline": "Canalisations / Génie civil",
  "title_block": {
    "plan_number": "GC-401-B",
    "plan_title": "Plan des canalisations — Zone Nord",
    "scale": "1:200",
    "date": "15.01.2026",
    "author": "M. Dupont",
    "company": "BG Ingénieurs Conseils SA",
    "revision": "C"
  },
  "legend_items": [
    {"symbol": "Trait bleu continu", "description": "Canalisation eaux claires (EC)", "color": "bleu"},
    {"symbol": "Trait rouge continu", "description": "Canalisation eaux usées (EU)", "color": "rouge"}
  ],
  "quantities": [
    {"category": "Canalisations EC", "item": "Tuyau PVC DN125", "quantity": 85.5, "unit": "ml", "specification": "DN125, pente 1%", "confidence": "high"},
    {"category": "Canalisations EC", "item": "Tuyau PVC DN200", "quantity": 42.0, "unit": "ml", "specification": "DN200, pente 0.5%", "confidence": "medium"},
    {"category": "Chambres", "item": "Chambre de visite Ø800", "quantity": 4, "unit": "pce", "specification": "béton, couvercle fonte", "confidence": "high"}
  ],
  "observations": [
    "Le raccordement en zone sud n'est pas coté — vérifier avec le bureau d'études",
    "Les pentes des canalisations EC semblent faibles (< 1%) — risque de colmatage"
  ],
  "summary": "Plan de canalisations de la zone Nord montrant le réseau d'eaux claires et d'eaux usées. Le réseau comprend environ 127 ml de canalisations EC (DN125 et DN200) et 4 chambres de visite Ø800."
}

IMPORTANT :
- Utilise l'échelle du plan pour estimer les distances et surfaces
- Si tu ne peux pas compter exactement, donne une estimation avec confidence "low"
- Si une quantité est clairement lisible, utilise confidence "high"
- Si tu dois mesurer/estimer, utilise confidence "medium"
- N'invente pas de données — si tu ne vois rien, retourne un tableau vide
- Les unités suisses : m², ml (mètres linéaires), pce (pièces), m³, kg, t

VUES MULTIPLES — DERNIÈRE VÉRIFICATION :
- AVANT de finaliser ta réponse, relis toutes tes quantités et vérifie que tu n'as PAS additionné des éléments apparaissant dans plusieurs vues du même ouvrage.
- Exemple d'ERREUR : compter 32 jets dans "Plan fontaine" + 12 jets dans "Plan hauteur des jets" = 44 jets → FAUX. Le vrai total est 32 jets (les deux vues montrent les mêmes jets).
- Exemple d'ERREUR : additionner la longueur d'un caniveau vu en plan + vu en coupe → FAUX. La longueur se lit sur UNE SEULE vue en plan.
- Pour les longueurs (ml), relève les COTES INDIVIDUELLES si elles sont annotées sur le plan (ex: 5.00 + 15.00 + 11.62 + 6.62 ml) plutôt qu'estimer visuellement.
- Si des cotes sont écrites sur le plan, utilise-les en priorité avec confidence "high".`;
}
