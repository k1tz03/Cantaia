# CANTAIA — Inventaire exhaustif des fonctionnalites

> Document de reference pour l'elaboration de l'offre de prix clients.
> Derniere mise a jour : 3 mars 2026

---

## 1. VUE D'ENSEMBLE DE LA PLATEFORME

**Cantaia** est un SaaS de gestion de chantier augmente par l'intelligence artificielle, concu pour les chefs de projet et entreprises de construction en Suisse.

| Donnee | Valeur |
|--------|--------|
| Pages applicatives | 53 |
| Routes API | 93 |
| Langues supportees | FR, EN, DE |
| Monnaie par defaut | CHF |
| Authentification | OAuth Microsoft 365, Google, Email/Mot de passe |
| Hebergement | Vercel (serverless) |
| Base de donnees | Supabase (PostgreSQL) |
| Stockage fichiers | Supabase Storage |
| IA principale | Anthropic Claude Sonnet 4.5 |
| Transcription audio | OpenAI Whisper |
| Paiements | Stripe (prevu) |

---

## 2. MODULES ET FONCTIONNALITES DETAILLEES

---

### 2.1 CANTAIA MAIL — Messagerie intelligente IA

**Route** : `/mail`
**Produit** : Actif

#### 2.1.1 Synchronisation email

| Fonctionnalite | Detail |
|----------------|--------|
| Microsoft 365 (Outlook) | Synchronisation OAuth2 via Microsoft Graph API |
| Gmail (Google Workspace) | Synchronisation OAuth2 via Google API |
| IMAP/SMTP | Configuration manuelle avec presets : Infomaniak, Hostpoint, OVH, Swisscom Bluewin |
| Sync incrementale | Delta queries — ne telecharge que les nouveaux emails |
| Refresh automatique | Tokens OAuth rafraichis automatiquement |
| Sync manuelle | Bouton "Synchroniser" avec compteur de resultats |
| Sync CRON | Toutes les 5 minutes via Vercel CRON |
| Pieces jointes | Detection et telechargement via Graph API |

#### 2.1.2 Classification IA des emails (pipeline 3 niveaux)

| Niveau | Methode | Vitesse | Detail |
|--------|---------|---------|--------|
| L0 | Detection spam/newsletter | Instantane | Heuristiques sur expediteur (noreply@, newsletter@, mailchimp, sendgrid) et objet (newsletter, digest, unsubscribe, promo) |
| L1 | Regles locales + mots-cles | Instantane | Matching normalise sur : nom projet, code projet, mots-cles, expediteurs connus, destinataires, nom client. Score >= 8 + correspondance nom/ref requis. Penalite -15 si premier segment objet ne match pas |
| L2 | Claude IA (corps complet) | 2-5 sec | Classification IA avec contexte complet : expediteur, objet, corps, destinataires, liste projets. Sortie : projet, confiance (0-100), classification, resume FR/EN/DE |

**Classifications possibles** :
- `urgent` — Action immediate requise
- `action_required` — Action a planifier
- `waiting_response` — En attente de retour
- `info_only` — Pour information
- `archived` — Traite/archive

**Resultats de la classification** :
- Projet assigne (existant ou suggestion de nouveau projet)
- Score de confiance (0-100%)
- Resume IA en 3 langues (FR/EN/DE)
- Detection automatique de taches

#### 2.1.3 Interface boite mail

| Fonctionnalite | Detail |
|----------------|--------|
| Layout split-panel | Liste emails (gauche) + detail (droite), separateur redimensionnable |
| Tri | ASC/DESC par date |
| Filtre par projet | Boutons projet avec pastille couleur |
| Recherche | Plein texte cote serveur (expediteur, objet, corps) |
| 3 onglets | Boite de reception, Traites, En veille — avec compteurs badges |
| Groupement par projet | En-tetes sticky avec flou backdrop, groupes depliables |
| Indicateurs visuels | Point bleu (non lu), icone PJ, icone IA (resume disponible), tag projet couleur, badge classification |
| Raccourcis clavier | J/K (nav), O (lu), A (archiver), / (recherche), ESC (fermer) |
| Persistence | Largeur panneau sauvegardee en localStorage |

#### 2.1.4 Panneau detail email

| Fonctionnalite | Detail |
|----------------|--------|
| Metadonnees | Expediteur, destinataires TO/CC, objet, date, projet, classification |
| Resume IA | Affiche en permanence le resume genere par Claude |
| Corps complet | HTML sanitise (DOMPurify), scrollable, max 400px |
| Pieces jointes | Icone coloree par type (PDF rouge, DOCX bleu, XLSX vert, IMG violet), taille humanisee, telechargement individuel ou groupee |
| Badge "Plan enregistre" | Apparait si la PJ a ete detectee comme plan de construction |
| Taches detectees | Liste des taches extraites par IA, avec responsable et echeance. Bouton "Creer tache" par tache |
| Proposition de reponse IA | Texte editable genere par Claude, detection "pas de reponse necessaire". Boutons : Envoyer, Copier, Regenerer |
| Actions rapides | Archiver vers Outlook, Reclassifier (choix projet), Marquer traite, Marquer urgent, Creer tache manuelle |

#### 2.1.5 Capacites IA du module Mail

| Capacite IA | Modele | Detail |
|-------------|--------|--------|
| Classification projet | Claude Sonnet 4.5 | 9 regles de matching + fallback IA corps complet |
| Extraction de taches | Claude Sonnet 4.5 | Detecte actions, responsables, echeances, priorites dans le corps email |
| Generation de reponse | Claude Sonnet 4.5 | Reponse professionnelle contextualisee (projet, profil utilisateur, entreprise) |
| Detection transfert | Algorithmique | Identifie FW:/TR:/Fwd: et texte ajoute avant le marqueur forward |
| Detection plans | Heuristique + patterns | Extension (.pdf, .dwg, .dxf), taille > 100KB, patterns nom fichier (211-B2-04, ARC-301, facade, schema) |
| Detection prix | Heuristique + HMAC | Code de tracking unique dans le corps email + fallback sur email expediteur |
| Apprentissage | Algorithmique | Les corrections utilisateur alimentent le scoring futur |

#### 2.1.6 Parametres email configurables

| Parametre | Detail |
|-----------|--------|
| Seuil de confiance classification | 50%, 60%, 70%, 80%, 85%, 90%, 95% |
| Auto-classifier active | Oui/Non |
| Suggestion creation projet | Oui/Non |
| Ignorer newsletters | Oui/Non |
| Ignorer spam | Oui/Non |
| Ignorer emails internes | Oui/Non |
| Domaines ignores | Liste editable (ex: hilti-promo.com) |
| Mapping domaine → projet | Ex: bg-ingenieurs.ch → "Projet X" |
| Dossier Outlook racine | Nom du dossier (defaut "Cantaia") |
| Auto-deplacer vers Outlook | Oui/Non |
| Auto-dismiss spam/newsletters | Oui/Non |
| Duree snooze par defaut | 1h, 2h, 4h, 8h, 24h |
| Archive locale | Chemin Windows (ex: C:\Chantiers), active/desactive |

---

### 2.2 CANTAIA SOUMISSIONS — Gestion des offres et prix

**Route** : `/submissions`
**Produit** : Actif

#### 2.2.1 Import et extraction

| Fonctionnalite | Detail |
|----------------|--------|
| Upload drag-and-drop | PDF, Excel (.xlsx/.xls), CSV |
| Extraction IA | Claude parse le document et extrait les postes : numero, code CAN, description, quantite, unite, prix unitaire, total |
| Fallback modele | Haiku (rapide) → Sonnet (precis) si le premier echoue |
| Reparation JSON | Gestion automatique des JSON tronques par le modele |
| Score de confiance | Chaque poste extrait a un niveau : high/medium/low |
| Flags review | Postes marques pour verification manuelle |
| Metadonnees extraites | Projet suggere, titre document, chapitre CFC, monnaie |

#### 2.2.2 Edition et gestion

| Fonctionnalite | Detail |
|----------------|--------|
| Tableau editable | Position, code CAN, description, quantite, unite, prix unitaire, total |
| Reordonnement | Drag-to-reorder (GripVertical) |
| Liaison projet | Association a un projet existant |
| Sauvegarde | Enregistrement pour edition ulterieure |
| Re-extraction | Possibilite de relancer l'extraction IA |
| Export | Export des donnees extraites |

#### 2.2.3 Demandes de prix

| Fonctionnalite | Detail |
|----------------|--------|
| Envoi aux fournisseurs | Selection fournisseurs, envoi par email avec postes demandes |
| Code de tracking unique | HMAC-SHA256 insere dans l'email pour identification automatique des reponses |
| Suivi des reponses | Detection automatique dans le flux email (Level 0 du pipeline de sync) |
| Extraction prix reponse | Claude IA extrait les prix, conditions, delais depuis l'email/PJ du fournisseur |
| Matching lignes | IA tente de faire correspondre les descriptions fournisseur aux postes de la soumission |

---

### 2.3 CANTAIA FOURNISSEURS — Base de donnees fournisseurs

**Route** : `/suppliers`
**Produit** : Actif (badge "Nouveau")

#### 2.3.1 Gestion CRUD

| Fonctionnalite | Detail |
|----------------|--------|
| Ajout manuel | Formulaire : nom entreprise, contact, email, telephone, adresse, ville, specialites, codes CFC, certifications, zone geo, note |
| Import CSV | Import en masse depuis fichier CSV |
| Edition | Modification de tous les champs |
| Suppression | Avec confirmation |
| Recherche | Par nom, email, contact, ville |
| Filtres | Specialite (18 types), zone geographique (20 cantons suisses + national/international), statut |

#### 2.3.2 Specialites disponibles (18)

| Code | Label FR |
|------|----------|
| gros_oeuvre | Gros oeuvre |
| electricite | Electricite |
| cvc | CVC (chauffage/ventilation/climatisation) |
| sanitaire | Sanitaire |
| peinture | Peinture |
| menuiserie | Menuiserie |
| etancheite | Etancheite |
| facades | Facades |
| serrurerie | Serrurerie |
| carrelage | Carrelage |
| platrerie | Platrerie |
| charpente | Charpente |
| couverture | Couverture |
| ascenseur | Ascenseur |
| amenagement_exterieur | Amenagement exterieur |
| demolition | Demolition |
| terrassement | Terrassement |
| echafaudage | Echafaudage |

#### 2.3.3 Scoring fournisseur (automatique)

| Critere | Poids | Detail |
|---------|-------|--------|
| Taux de reponse | 25% | offres_recues / demandes_envoyees x 100 |
| Competitivite prix | 35% | Score 1-100 base sur positionnement vs concurrence |
| Fiabilite | 25% | Score 0-100 base sur historique |
| Note manuelle | 15% | 0-5 etoiles converties en 0-100 |

**Affichage score** : rouge < 50, amber 50-70, bleu 70-85, vert >= 85

#### 2.3.4 Panneau detail fournisseur

| Section | Contenu |
|---------|---------|
| En-tete | Avatar initiales, nom, contact, boutons Enrichir/Editer/Supprimer |
| Score | Score global, taux de reponse, delai moyen reponse (jours), note manuelle |
| Contact | Email, telephone, adresse, site web |
| Specialites | Liste complete avec badges colores |
| Codes CFC | Liste des codes BKP/CFC couverts |
| Certifications | ISO 9001, Minergie, etc. avec icone Award |
| Statistiques | Total demandes, offres, projets impliques |
| Notes | Zone texte libre |

#### 2.3.5 Capacites IA fournisseurs

| Capacite IA | Modele | Detail |
|-------------|--------|--------|
| Recherche IA | Claude Sonnet 4.5 | Trouve des fournisseurs suisses par specialite, zone geo, code CFC. 5-10 suggestions avec confiance >= 0.6. Connaissance du marche suisse de la construction |
| Enrichissement IA | Claude Sonnet 4.5 | Complete automatiquement : site web, contacts supplementaires, certifications, nombre employes, annee creation, description entreprise |

---

### 2.4 CANTAIA PRIX — Intelligence tarifaire

**Route** : `/cantaia-prix`
**Produit** : Actif (badge "Nouveau")

#### 2.4.1 Onglet Alertes actives

| Fonctionnalite | Detail |
|----------------|--------|
| Alertes prix | Cartes avec titre, message, action suggeree |
| Severite | Critical (rouge), Warning (amber), Info (bleu) |
| Ecart % | Pourcentage de deviation vs moyenne |
| Impact financier | Montant CHF de l'ecart |
| Actions | Renegocier, Utiliser comme reference, Ignorer |

**5 types d'alertes generees automatiquement** :

| Type | Severite | Declencheur |
|------|----------|-------------|
| Anomalie de prix | Warning/Critical | Offre > +-30% vs moyenne du marche |
| Ecart eleve | Info | Spread > 50% entre min/max pour un poste (probleme de specs ?) |
| Nouveau moins-disant | Info | Fournisseur le moins cher sur 50%+ des postes |
| Reponse manquante | Warning | Demande envoyee il y a > 7 jours, pas de reponse |
| Opportunite | Info | Poste avec 1 seule offre — demander d'autres devis |

#### 2.4.2 Onglet Benchmark

| Fonctionnalite | Detail |
|----------------|--------|
| Recherche | Par article ou code CFC |
| Tableau | Article, CFC, Unite, Prix min, Prix median, Prix max, Tendance %, Points de donnees |
| Tendances | Fleche avec % de variation sur 6 mois |
| Format | CHF suisse, 0 decimales |

#### 2.4.3 Onglet Top Fournisseurs

| Fonctionnalite | Detail |
|----------------|--------|
| Classement 1-3 | Badges metalliques (or, argent, bronze) |
| Metriques | Score global, competitivite %, taux reponse %, nombre projets |

#### 2.4.4 Comparaison de prix multi-fournisseurs

| Fonctionnalite | Detail |
|----------------|--------|
| Groupement postes | Normalisation des descriptions pour rapprochement |
| Calculs par poste | Moyenne, min, max, ecart % |
| Identification | Moins-disant et plus cher par poste |
| Meilleur global | Fournisseur avec le total le plus bas |
| Economies potentielles | Ecart entre total le plus cher et le moins cher |

#### 2.4.5 Estimation de couts IA (depuis plans)

| Fonctionnalite | Detail |
|----------------|--------|
| Pipeline hybride | 1. Recherche prix historiques en BDD → 2. Estimation IA Claude pour postes sans historique |
| Marges configurables | Tight (1.05x), Standard (1.12x), Comfortable (1.20x) |
| Cout transport | Base + prix/km configurable |
| Sortie par poste | Prix unitaire, total, confiance (high/medium/low), source (db_historical ou ai_knowledge), fourchette min/max/median, code CFC, marge appliquee |
| Synthese | Sous-total, marge totale, transport, grand total, % couverture BDD, resume confiance |
| Configuration org | Taux horaire (defaut 95 CHF), lieu depart, niveau marge, exclusions, perimetre |

---

### 2.5 CANTAIA PLANS — Registre de plans de construction

**Route** : `/plans`
**Produit** : Actif (badge "Nouveau")

#### 2.5.1 Detection et enregistrement automatique

| Fonctionnalite | Detail |
|----------------|--------|
| Pre-filtre | Extensions .pdf/.dwg/.dxf/.png/.jpg, taille > 100KB, exclusion factures/offres/courriers/PV |
| Patterns nom fichier | 211-B2-04, ARC-301, EL-201, plan, coupe, facade, schema, detail |
| Mots-cles email | plan, mise a jour, revision, version, indice, BPE, BAE, dessin |
| Pipeline | Download Graph API → Upload Supabase Storage → Enregistrement BDD plan_registry + plan_versions |
| Deduplication | Par plan_number et source_email_id |
| Badge email | "Plan enregistre" sur les PJ detectees comme plans |

#### 2.5.2 Interface registre

| Fonctionnalite | Detail |
|----------------|--------|
| Stats | 4 cartes : total plans, versions, alertes obsoletes, en attente approbation |
| Recherche | Par numero, titre, auteur |
| Filtres | Projet, discipline (7 types), statut |
| Vues | Liste (tableau triable) et grille (cartes) |
| Disciplines | Architecture, Structure, CVCS, Electricite, Sanitaire, Facades, Amenagement |
| Statuts | Actif, Remplace, Retire, En approbation, Approuve, Rejete |
| Upload manuel | Telechargement de plans PDF/images |
| Rescan emails | Relance la detection sur tous les emails |

#### 2.5.3 Analyse de plans par IA (Vision)

| Fonctionnalite | Detail |
|----------------|--------|
| Modele | Claude Sonnet 4.5 avec Vision |
| Entree | PDF/image (base64), max 20MB |
| Role IA | Metreur professionnel (20 ans d'experience) |
| Sortie structuree | Type plan, cartouche, legende, quantites, observations, resume |
| Types de plans | Reseaux, structure, electrique, facade, amenagement, CVC, sanitaire, plantation, etc. |
| Quantites | Categorie, description, quantite, unite, specification, confiance |
| Regles strictes | Detection vues multiples (plan + coupe + section), pas de double-comptage, lecture echelle, mesure surfaces |
| Max tokens | 8000 |

---

### 2.6 PROJETS — Gestion de chantiers

**Route** : `/projects`
**Produit** : Actif

#### 2.6.1 Liste des projets

| Fonctionnalite | Detail |
|----------------|--------|
| Vues | Cartes (defaut) ou liste (tableau) — persistee en localStorage |
| Tri | Urgence, nom, date creation, activite recente |
| Recherche | Par nom, code, client, ville |
| Filtres | Statut (actif, planification, pause, termine, archive), sante (attention) |
| Stats par projet | Nombre emails, taches, taches en retard, prochaine reunion |
| Sante | Indicateur vert/amber/rouge base sur les metriques |
| Actions rapides | Survol carte → boutons Mail, Taches, Reunions |

#### 2.6.2 Creation de projet

| Champ | Detail |
|-------|--------|
| Nom projet | Requis |
| Code projet | Optionnel |
| Statut | Planification, Actif, En pause |
| Client | Nom du client |
| Ville / Adresse | Localisation |
| Dates debut/fin | Calendrier |
| Budget | Montant numerique |
| Monnaie | CHF, EUR |
| Couleur | 10 presets colores |
| Description | Zone texte |
| Mots-cles classification | Auto-generes depuis nom/code/client (> 3 caracteres) + ajout manuel |
| Expediteurs connus | Emails associes au projet |

#### 2.6.3 Detail projet (onglets)

| Onglet | Contenu |
|--------|---------|
| Vue d'ensemble | Statut, budget, dates, equipe |
| Emails | Tous les emails classifies au projet, recherche, panneau detail |
| Taches | Taches liees au projet |
| Soumissions | Offres et comparatifs du projet |
| Reserves | Problemes et reserves pendant le chantier |
| Cloture | Remise, garanties, PV signes |
| Parametres | Configuration du projet |

---

### 2.7 TACHES — Gestion des taches

**Route** : `/tasks`
**Produit** : Actif

#### 2.7.1 Vues et filtres

| Fonctionnalite | Detail |
|----------------|--------|
| Vues | Liste (tableau) et Kanban (4 colonnes drag-and-drop) |
| Colonnes Kanban | A faire, En cours, En attente, Termine |
| Filtres | Projet, statut, priorite (urgent/haute/moyenne/basse), source (email/reunion/manuel/reserve), echeance (en retard/aujourd'hui/cette semaine/plus tard) |
| Recherche | Par titre, description, assigne a |
| Compteurs | En retard (rouge), Aujourd'hui, Cette semaine, Plus tard, Termine |

#### 2.7.2 Actions

| Action | Detail |
|--------|--------|
| Creation | Modal avec tous les champs |
| Edition | Panneau lateral detail |
| Actions en masse | Selection multiple → changer statut, priorite, assignation, suppression |
| Drag-and-drop | Deplacement entre colonnes Kanban (dnd-kit) |
| Marquer termine | Checkmark inline dans la liste |

#### 2.7.3 Sources de taches

| Source | Detail |
|--------|--------|
| Email | Extraction IA automatique depuis le corps email |
| Reunion/PV | Extraction depuis les proces-verbaux |
| Manuel | Creation manuelle par l'utilisateur |
| Suggestion IA | Proposee par l'IA lors de la classification |
| Reserve | Issue d'une reserve chantier |

---

### 2.8 REUNIONS & PV DE CHANTIER

**Route** : `/meetings` et `/pv-chantier`
**Produit** : Actif (PV greyed-out sur landing, actif dans l'app)

#### 2.8.1 Gestion des reunions

| Fonctionnalite | Detail |
|----------------|--------|
| Creation | Projet (requis), titre (auto-rempli), numero (auto-calcule), date/heure, lieu, duree (30-180 min) |
| Participants | Nom, entreprise, role, email — toggle present/absent |
| Ordre du jour | Points numerotes, ajout/suppression dynamique |
| Actions creation | Creer / Creer & Enregistrer (avec micro) |

#### 2.8.2 Pipeline enregistrement → PV

| Etape | Statut | Detail |
|-------|--------|--------|
| 1 | Planifie | Reunion creee, pas encore demarree |
| 2 | Enregistrement | Capture audio en cours (navigateur) |
| 3 | Transcription | Whisper IA transcrit l'audio (OpenAI Whisper, max 24MB inline ou chunked) |
| 4 | Generation PV | Claude IA genere le PV structure (sections, decisions, actions, prochaines etapes) |
| 5 | Revision | PV editable par l'utilisateur |
| 6 | Finalise | PV verrouille, pret a l'export |
| 7 | Envoye | PV distribue aux participants |

#### 2.8.3 Export

| Format | Detail |
|--------|--------|
| PDF | Export PDF du PV finalise |
| Word (.docx) | Export Word avec tableau participants, sections, decisions, actions, prochaines etapes |

---

### 2.9 VISITES CLIENT

**Route** : `/visits`
**Produit** : Actif

#### 2.9.1 Fonctionnalites

| Fonctionnalite | Detail |
|----------------|--------|
| Creation visite | Projet, client, date, lieu |
| Enregistrement audio | Capture en direct via navigateur |
| Transcription IA | OpenAI Whisper avec segments + timestamps |
| Rapport IA | Claude genere un rapport structure depuis la transcription |
| Export rapport | PDF avec couleurs marque |

#### 2.9.2 Rapport de visite IA (sortie structuree)

| Section | Detail |
|---------|--------|
| Titre et resume | Synthese de la visite |
| Info client extraites | Nom, entreprise, telephone, email, adresse |
| Demandes client | Categorie, description, details, priorite, code CFC |
| Mesures | Zone, dimensions, notes |
| Contraintes | Liste des contraintes identifiees |
| Budget | Montant mentionne, fourchette min/max, notes |
| Planning | Date souhaitee debut/fin, contraintes, urgence |
| Prochaines etapes | Actions a mener |
| Concurrents mentionnes | Noms des concurrents evoques |
| Sentiment client | Positif / Neutre / Hesitant / Negatif |
| Probabilite de closing | 0-100% |
| Notes closing | Analyse de la probabilite |

---

### 2.10 CHAT IA — Assistant JM

**Route** : `/chat`
**Produit** : Actif

#### 2.10.1 Interface

| Fonctionnalite | Detail |
|----------------|--------|
| Conversations | Liste a gauche groupee par date (Aujourd'hui, Hier, Plus ancien) |
| Gestion | Nouvelle conversation, supprimer conversation |
| Messages | Bulles utilisateur (gold, droite) et assistant (gris, gauche, Markdown rendu) |
| Streaming | Reponse en temps reel (SSE), rendu smooth frame-by-frame |
| Curseur | Indicateur clignotant pendant le streaming |
| Questions suggerees | 3 questions aleatoires parmi un pool de 15, affichees pour chaque nouvelle conversation |
| Saisie | Textarea auto-resize, max 160px, Enter pour envoyer, Shift+Enter pour saut de ligne |

#### 2.10.2 Expertise JM (prompt systeme)

| Domaine | Detail |
|---------|--------|
| Profil | Veteran 30 ans construction (architecte + ingenieur + economiste + chef de projet) |
| Normes SIA | 60+ normes detaillees (SIA 102, 103, 108, 112, 118, 180, 262, 380, etc.) |
| Codes CFC/BKP | Classification complete 0-9 avec sous-codes |
| Droit suisse | CO, OPB, LPE, LAT |
| Langues | FR prioritaire, peut switcher EN/DE |
| Specialisations | Formules de prix, selection materiaux, analyse contrats (SIA 118), phases projet (SIA 112), garanties, conditions paiement, delais |
| Restriction | Refuse les questions hors construction |
| Ton | Professionnel, precis, pragmatique |

---

### 2.11 BRIEFING QUOTIDIEN

**Route** : `/briefing`
**Produit** : Actif

#### 2.11.1 Contenu du briefing

| Section | Detail |
|---------|--------|
| Navigation dates | Calendrier, fleches, bouton "Aujourd'hui" |
| Barre statistiques | 6 cartes : projets totaux, emails non lus, emails action requise, taches en retard, taches du jour, reunions du jour |
| Alertes prioritaires | Encadres amber pour les elements urgents |
| Alertes garanties | Liees a la cloture/garanties des projets |
| Alertes plans | Avertissements lies aux plans |
| Visites recentes | Visites avec statut necessitant attention |
| Resume projets | Cartes projet avec emoji statut, nom, resume IA, actions a mener |
| Reunions du jour | Heure, projet, titre |
| Resume global | Synthese IA 1-2 phrases |
| Mode | Indicateur "IA" ou "Fallback" |

#### 2.11.2 Generation IA

| Fonctionnalite | Detail |
|----------------|--------|
| Modele | Claude Sonnet 4.5 |
| Fallback | Template factuel si l'IA echoue |
| Donnees sources | Emails, taches, reunions, projets, visites agreges par jour |
| Regeneration | Bouton pour regenerer a la demande |
| Preference | Configurable : heure d'envoi, activation, envoi par email |

---

### 2.12 DASHBOARD

**Route** : `/dashboard`
**Produit** : Actif

| Fonctionnalite | Detail |
|----------------|--------|
| Accueil | Message "Bienvenue, {prenom}" |
| Grille de cartes | 9 cartes d'acces rapide (3 colonnes desktop) |
| Badges | Compteur non-lus (Mail), "Nouveau" (Fournisseurs, Cantaia Prix) |
| Navigation | Clic sur une carte → module correspondant |

---

## 3. ADMINISTRATION ET PARAMETRES

### 3.1 Parametres utilisateur (9 onglets)

| Onglet | Contenu |
|--------|---------|
| Profil | Prenom, nom, telephone, email (lecture seule), photo |
| Langue | FR/EN/DE, format date (CH/FR/ISO/US), fuseau horaire |
| Notifications | Briefing (heure, email), notifications generales (email, push, desktop, rapport hebdo) |
| Outlook | Connexion OAuth Microsoft/Google/IMAP, statut sync, compteur emails |
| Preferences email | Dossier Outlook, auto-dismiss spam/newsletters, snooze par defaut, archive locale |
| Classification | Seuil confiance, auto-classif, ignorer categories, domaines ignores, mapping domaine→projet |
| Securite | Changer MDP, sessions actives, zone danger (supprimer compte), diagnostics Supabase |
| Organisation | Branding (logo, couleurs, nom), gestion membres equipe |
| Abonnement | Plan actuel, jours restants, upgrade/downgrade |

### 3.2 Administration (Super-admin)

| Page | Fonctionnalite |
|------|----------------|
| `/admin` | Dashboard admin |
| `/admin/users` | Gestion utilisateurs |
| `/admin/members` | Gestion membres organisation |
| `/admin/organizations` | Liste/gestion organisations |
| `/admin/settings` | Parametres systeme globaux |
| `/admin/finances` | Facturation, paiements, revenus |
| `/admin/logs` | Journaux d'audit |
| `/admin/alerts` | Alertes systeme et monitoring |
| `/admin/branding` | White-label par tenant |
| `/api-costs` | Suivi couts API (Claude, Whisper, Graph) |
| `/analytics` | Metriques d'utilisation |

### 3.3 Branding / White-label

| Personnalisation | Detail |
|------------------|--------|
| Logo principal | Upload image |
| Logo dark mode | Upload image |
| Couleur primaire | Hex (defaut #0A1F30) |
| Couleur secondaire | Hex |
| Couleur sidebar | Hex |
| Couleur accent | Hex |
| Nom personnalise | Remplace "Cantaia" dans l'interface |
| Favicon | Upload image |
| Activation | Toggle global branding active/desactive |

---

## 4. INTEGRATIONS TECHNIQUES

### 4.1 APIs externes consommees

| Service | Usage | Nb routes |
|---------|-------|-----------|
| Anthropic Claude Sonnet 4.5 | Classification, extraction, generation, analyse plans, estimation prix, chat, recherche fournisseurs, enrichissement, briefing, rapport visite | 15+ |
| OpenAI Whisper | Transcription audio (reunions, visites) | 2 |
| Microsoft Graph API | Sync emails, PJ, dossiers, envoi, archivage | 12+ |
| Google API | Alternative Gmail sync | 2+ |
| Supabase | BDD PostgreSQL, Auth, Storage | Toutes |
| Stripe | Paiements et abonnements (prevu) | 1 |

### 4.2 Capacites IA detaillees

| Capacite | Modele | Tokens max | Detail technique |
|----------|--------|------------|------------------|
| Classification email | Claude Sonnet 4.5 | 4096 | 3 niveaux, 9 regles matching, score 0-100 |
| Extraction taches | Claude Sonnet 4.5 | 4096 | Actions, responsables, echeances, priorites |
| Generation reponse | Claude Sonnet 4.5 | 4096 | Contexte projet + profil utilisateur |
| Analyse plan (Vision) | Claude Sonnet 4.5 | 8000 | PDF/image → quantites structurees |
| Estimation prix | Claude Sonnet 4.5 | 4096 | Hybrid BDD + IA, 3 niveaux marge |
| Chat JM | Claude Sonnet 4.5 (streaming) | 4096 | SSE, 60+ normes SIA, multi-tour |
| Briefing quotidien | Claude Sonnet 4.5 | 4096 | Synthese projets + alertes + actions |
| Recherche fournisseurs | Claude Sonnet 4.5 | 4096 | Marche suisse, 5-10 suggestions |
| Enrichissement fournisseur | Claude Sonnet 4.5 | 4096 | Web, contacts, certifications |
| Extraction prix | Claude Sonnet 4.5 | 4096 | Email/PJ → prix structures |
| Rapport visite | Claude Sonnet 4.5 | 4096 | Transcription → rapport 15 sections |
| Generation PV | Claude Sonnet 4.5 | 4096 | Transcription → PV structure SIA |
| Transcription audio | OpenAI Whisper 1 | N/A | Max 24MB inline, segments + timestamps |
| Detection spam | Heuristique | N/A | Patterns expediteur/objet, 0 cout API |
| Detection plans | Heuristique | N/A | Extension + taille + patterns, 0 cout API |
| Detection prix | HMAC + heuristique | N/A | Code tracking + email expediteur, 0 cout API |

---

## 5. MODELE DE DONNEES (TABLES PRINCIPALES)

| Table | Cles | Description |
|-------|------|-------------|
| organizations | id, name, subscription_plan, stripe_*, trial_ends_at, pricing_config (JSONB) | Entreprises clientes |
| users | id, org_id, microsoft_tokens, notification_preferences (JSONB) | Utilisateurs |
| projects | id, org_id, name, code, status, budget, color, email_keywords[], email_senders[] | Chantiers |
| email_records | id, org_id, project_id, classification, ai_confidence, ai_summary, triage_status, recipients[], snooze_until | Emails |
| tasks | id, project_id, status, priority, source, source_id, due_date, assigned_to | Taches |
| plan_registry | id, org_id, project_id, plan_number, discipline, status, source_email_id | Plans |
| plan_versions | id, plan_id, version_code, file_path | Versions de plans |
| plan_analyses | id, plan_id, analysis_result (JSONB) | Analyses IA |
| plan_estimates | id, plan_id, subtotal, margin_total, transport_cost, grand_total, db_coverage_percent | Estimations |
| suppliers | id, org_id, company_name, specialties[], cfc_codes[], overall_score, response_rate | Fournisseurs |
| price_requests | id, submission_id, supplier_id, tracking_code | Demandes de prix |
| supplier_offers | id, supplier_id, submission_id, total_amount | Offres fournisseurs |
| offer_line_items | id, offer_id, description, unit_price, quantity | Lignes d'offre |
| pricing_alerts | id, org_id, type, severity, title, description | Alertes prix |
| meetings | id, project_id, title, date, status, pv_content, audio_url | Reunions |
| client_visits | id, project_id, status, transcription, report (JSONB) | Visites |
| chat_conversations | id, user_id, title, messages[] | Conversations chat |
| api_usage_logs | id, org_id, action_type, input_tokens, output_tokens | Suivi couts API |
| email_connections | id, user_id, provider, access_token, refresh_token | Connexions email |

**23 migrations SQL** couvrant l'evolution du schema depuis la creation.

---

## 6. PLANS TARIFAIRES (ACTUELS)

| Plan | Prix | Cible |
|------|------|-------|
| **Essai** | Gratuit (14 jours) | Decouverte, sidebar affiche "12j restants" |
| **Starter** | 79 CHF/mois | Petites entreprises, fonctionnalites de base |
| **Pro** | 149 CHF/mois | PME, toutes fonctionnalites (mise en avant) |
| **Enterprise** | Sur devis | Grands groupes, support dedie, white-label |

---

## 7. SECURITE ET CONFORMITE

| Aspect | Implementation |
|--------|----------------|
| Authentification | Supabase Auth (OAuth2 + email/password) |
| Multi-tenant | Isolation par organization_id sur toutes les tables |
| Tokens Microsoft | Stockes chiffres en BDD, refresh automatique |
| Sanitisation HTML | DOMPurify sur tous les contenus email affiches |
| API protegees | Verification session + organization sur chaque route |
| Row Level Security | Supabase RLS policies |
| Audit trail | Journaux d'activite utilisateur |

---

## 8. EXPERIENCE UTILISATEUR

| Aspect | Detail |
|--------|--------|
| Design system | Tailwind CSS 3 + shadcn/ui |
| Palette | Navy #0A1F30, Gold #C4A661, Parchment #F5F2EB, Steel #8A9CA8 |
| Typographie | Playfair Display (titres), Inter (corps), JetBrains Mono (code) |
| Responsive | Desktop (sidebar colapsable) + Mobile (bottom tab bar) |
| Animations | Framer Motion (landing page), transitions CSS (app) |
| Themes | Light mode avec support dark partiel |
| i18n | Francais, English, Deutsch (next-intl) |
| Raccourcis clavier | Navigation email (J/K/O/A///ESC) |
| Persistence locale | localStorage pour preferences UI (largeur panneaux, vue liste/carte, tri) |

---

## 9. RECAPITULATIF DES MODULES PAR OFFRE

### Offre Starter (79 CHF/mois)

| Module | Inclus |
|--------|--------|
| Mail (sync + classification IA) | Oui |
| Projets (CRUD + stats) | Oui |
| Taches (liste + kanban) | Oui |
| Dashboard + Briefing | Oui |
| Chat JM | Oui |
| Plans (registre basique) | Oui |
| Soumissions | Limite |
| Fournisseurs | Limite |
| Cantaia Prix | Non |
| PV de chantier | Non |
| Visites client | Non |
| Branding/White-label | Non |

### Offre Pro (149 CHF/mois)

| Module | Inclus |
|--------|--------|
| Tous modules Starter | Oui |
| Soumissions (illimite + extraction IA) | Oui |
| Fournisseurs (illimite + IA enrichissement) | Oui |
| Cantaia Prix (alertes + benchmark + estimation) | Oui |
| PV de chantier (enregistrement + transcription + generation) | Oui |
| Visites client (rapport IA) | Oui |
| Analyse plans Vision IA | Oui |
| Estimation couts depuis plans | Oui |

### Offre Enterprise (sur devis)

| Module | Inclus |
|--------|--------|
| Tous modules Pro | Oui |
| Branding/White-label | Oui |
| Multi-organisations | Oui |
| Support dedie | Oui |
| SLA garanti | Oui |
| Integrations custom | Oui |
| Formation sur site | Oui |
| API acces | Oui |

---

> **Ce document couvre l'integralite des 53 pages, 93 routes API, 16 capacites IA, 20 tables de donnees et toutes les interactions utilisateur de la plateforme Cantaia au 3 mars 2026.**
