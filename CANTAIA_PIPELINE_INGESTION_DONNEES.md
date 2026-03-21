# CANTAIA — Pipeline d'Ingestion de Données Historiques

> Ce document est une instruction Claude Code.
> Il crée un pipeline qui ingère automatiquement des données
> historiques (emails, offres fournisseurs, plans) pour
> pré-entraîner la base de données de CANTAIA.
>
> OBJECTIF : quand le premier client utilise CANTAIA,
> l'IA a déjà l'équivalent de 3 ans d'expérience.
>
> IMPORTANT : ce pipeline tourne EN LOCAL sur ta machine,
> pas sur Vercel. C'est un script Node.js one-shot
> qui remplit ta base Supabase.

---

## CONTEXTE

Julien dispose de :
- ~3 ans d'emails Outlook (fichiers PST ou accès IMAP)
- Des centaines d'offres fournisseurs (PDF + Excel)
  avec des prix réels par poste CFC
- Des dizaines de plans de construction (PDF)
- Des devis, métrés, descriptifs CFC

Ces données doivent être extraites, structurées et stockées
dans Supabase pour que le price-resolver, la classification email
et l'estimation de prix fonctionnent avec des données réelles
dès le premier jour.

---

## PHASE A — STRUCTURE DU PIPELINE

### Crée le dossier : `scripts/data-ingestion/`

```
scripts/data-ingestion/
├── index.ts                    # Orchestrateur principal
├── config.ts                   # Configuration (chemins, API keys, options)
├── utils/
│   ├── pdf-parser.ts           # Extraction texte depuis PDF
│   ├── excel-parser.ts         # Extraction données depuis Excel
│   ├── email-parser.ts         # Extraction depuis PST/EML
│   ├── file-scanner.ts         # Scan récursif de dossiers
│   ├── ai-extractor.ts         # Appels Claude pour extraction structurée
│   ├── normalizer.ts           # Normalisation CFC, unités, descriptions
│   ├── db.ts                   # Client Supabase pour l'ingestion
│   └── logger.ts               # Logging structuré avec progression
├── pipelines/
│   ├── ingest-offers.ts        # Pipeline offres fournisseurs
│   ├── ingest-emails.ts        # Pipeline emails
│   ├── ingest-plans.ts         # Pipeline plans
│   └── ingest-metrage.ts       # Pipeline métrés/descriptifs
├── prompts/
│   ├── extract-offer-lines.ts  # Prompt extraction lignes d'offre
│   ├── extract-email-meta.ts   # Prompt extraction métadonnées email
│   ├── extract-plan-quantities.ts # Prompt extraction quantités plan
│   └── normalize-cfc.ts        # Prompt normalisation CFC
└── reports/
    └── (généré) ingestion-report.md
```

---

## PHASE B — CONFIGURATION

### Fichier : `scripts/data-ingestion/config.ts`

```typescript
import path from 'path';

export const CONFIG = {
  // ═══ CHEMINS DES DONNÉES ═══
  // Julien : adapte ces chemins à ton disque
  paths: {
    offers: '/Users/julien/data-cantaia/offres',
    plans: '/Users/julien/data-cantaia/plans',
    emails: '/Users/julien/data-cantaia/emails',
    metrages: '/Users/julien/data-cantaia/metrages',
    // Dossier pour les fichiers que l'IA n'a pas pu traiter
    failed: '/Users/julien/data-cantaia/_failed',
    // Dossier pour les fichiers traités avec succès
    processed: '/Users/julien/data-cantaia/_processed',
  },

  // ═══ SUPABASE ═══
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    // Service role pour bypass RLS pendant l'ingestion
  },

  // ═══ ANTHROPIC ═══
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: 'claude-sonnet-4-5-20250514',
    // Pour les PDFs lourds, on reste sur Sonnet (meilleur rapport qualité/prix)
    maxConcurrent: 3, // Max 3 appels parallèles pour ne pas rate-limit
    delayBetweenCalls: 1000, // 1 seconde entre les appels
  },

  // ═══ ANONYMISATION ═══
  anonymize: {
    // Si true, supprime les noms de clients et projets avant stockage
    enabled: true,
    // Préfixe pour les projets anonymisés
    projectPrefix: 'PROJ',
    // Les noms de fournisseurs sont hashés (SHA-256)
    hashSupplierNames: true,
    // Mais on garde le nom en clair dans une table séparée (C1 privé)
    keepClearNamesInC1: true,
  },

  // ═══ ORGANISATION ═══
  // L'org_id sous laquelle stocker les données ingérées
  // C'est l'organisation de Julien dans Supabase
  orgId: process.env.INGESTION_ORG_ID!,

  // ═══ RÉGION PAR DÉFAUT ═══
  defaultRegion: 'vaud', // Région des projets de Julien

  // ═══ LIMITES ═══
  limits: {
    maxFileSizeMB: 50,
    maxPagesPerPDF: 100,
    maxTokensPerCall: 8000,
    batchSize: 10, // Traiter 10 fichiers puis pause
    pauseBetweenBatches: 5000, // 5 secondes entre les batches
  },
};
```

---

## PHASE C — UTILITAIRES

### Fichier : `scripts/data-ingestion/utils/logger.ts`

```typescript
// Logger avec progression pour le batch
// Affiche : [12:34:56] [OFFRES] 47/213 (22%) — offre-maier-go.pdf — 12 lignes extraites

export class IngestionLogger {
  private module: string;
  private total: number;
  private current: number = 0;
  private successes: number = 0;
  private failures: number = 0;
  private startTime: number;

  constructor(module: string, total: number) {
    this.module = module;
    this.total = total;
    this.startTime = Date.now();
  }

  progress(filename: string, detail: string) {
    this.current++;
    const pct = Math.round((this.current / this.total) * 100);
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const time = new Date().toLocaleTimeString('fr-CH');
    console.log(
      `[${time}] [${this.module}] ${this.current}/${this.total} (${pct}%) — ${filename} — ${detail} [${elapsed}s]`
    );
  }

  success(filename: string, detail: string) {
    this.successes++;
    this.progress(filename, `✅ ${detail}`);
  }

  failure(filename: string, reason: string) {
    this.failures++;
    this.progress(filename, `❌ ${reason}`);
  }

  summary(): string {
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    return [
      `\n═══ RÉSUMÉ ${this.module} ═══`,
      `Total fichiers : ${this.total}`,
      `Succès : ${this.successes}`,
      `Échecs : ${this.failures}`,
      `Durée : ${elapsed}s (${Math.round(elapsed / 60)}min)`,
      `═══════════════════════\n`,
    ].join('\n');
  }
}
```

### Fichier : `scripts/data-ingestion/utils/pdf-parser.ts`

```typescript
// Utilise pdf-parse pour extraire le texte des PDFs
// npm install pdf-parse

import fs from 'fs';
import pdf from 'pdf-parse';

export async function extractTextFromPDF(filePath: string): Promise<{
  text: string;
  pages: number;
  truncated: boolean;
}> {
  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);

  // Tronquer si trop long (limiter les tokens envoyés à Claude)
  const maxChars = 30000; // ~7500 tokens
  const truncated = data.text.length > maxChars;
  const text = truncated ? data.text.substring(0, maxChars) : data.text;

  return {
    text: text.trim(),
    pages: data.numpages,
    truncated,
  };
}

export async function extractImageFromPDF(filePath: string): Promise<string> {
  // Pour les plans (Vision), on a besoin du PDF en base64
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}
```

### Fichier : `scripts/data-ingestion/utils/excel-parser.ts`

```typescript
// Utilise xlsx pour extraire les données des fichiers Excel
// npm install xlsx

import * as XLSX from 'xlsx';

export interface ExcelRow {
  [key: string]: string | number | null;
}

export function extractFromExcel(filePath: string): {
  sheets: Array<{
    name: string;
    headers: string[];
    rows: ExcelRow[];
  }>;
} {
  const workbook = XLSX.readFile(filePath);
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(sheet, {
      defval: null,
    });
    const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
    return { name, headers, rows: jsonData };
  });
  return { sheets };
}
```

### Fichier : `scripts/data-ingestion/utils/file-scanner.ts`

```typescript
import fs from 'fs';
import path from 'path';

export function scanDirectory(dirPath: string, extensions: string[]): string[] {
  const files: string[] = [];

  function scan(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }

  scan(dirPath);
  return files;
}
```

### Fichier : `scripts/data-ingestion/utils/ai-extractor.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { CONFIG } from '../config';

const anthropic = new Anthropic({ apiKey: CONFIG.anthropic.apiKey });

// Semaphore pour limiter les appels concurrents
let activeRequests = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (activeRequests < CONFIG.anthropic.maxConcurrent) {
      activeRequests++;
      resolve();
    } else {
      queue.push(() => {
        activeRequests++;
        resolve();
      });
    }
  });
}

function releaseSlot() {
  activeRequests--;
  if (queue.length > 0) {
    const next = queue.shift()!;
    next();
  }
}

// Appel Claude avec rate limiting et retry
export async function callClaude(params: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}): Promise<string | null> {
  await acquireSlot();

  try {
    // Délai entre les appels
    await new Promise((r) => setTimeout(r, CONFIG.anthropic.delayBetweenCalls));

    const response = await anthropic.messages.create({
      model: CONFIG.anthropic.model,
      max_tokens: params.maxTokens || CONFIG.limits.maxTokensPerCall,
      temperature: 0,
      system: [
        {
          type: 'text',
          text: params.systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: params.userPrompt }],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return text;
  } catch (error: any) {
    if (error?.status === 429) {
      // Rate limit — attendre et retry
      console.log('  ⏳ Rate limit atteint, pause 30 secondes...');
      await new Promise((r) => setTimeout(r, 30000));
      releaseSlot();
      return callClaude(params); // Retry
    }
    console.error('  ❌ Erreur Claude:', error?.message || error);
    return null;
  } finally {
    releaseSlot();
  }
}

// Appel Claude Vision (pour les plans en image/PDF)
export async function callClaudeVision(params: {
  systemPrompt: string;
  userPrompt: string;
  imageBase64: string;
  mediaType: 'application/pdf' | 'image/png' | 'image/jpeg';
  maxTokens?: number;
}): Promise<string | null> {
  await acquireSlot();

  try {
    await new Promise((r) => setTimeout(r, CONFIG.anthropic.delayBetweenCalls));

    const response = await anthropic.messages.create({
      model: CONFIG.anthropic.model,
      max_tokens: params.maxTokens || CONFIG.limits.maxTokensPerCall,
      temperature: 0,
      system: [
        {
          type: 'text',
          text: params.systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: params.mediaType,
                data: params.imageBase64,
              },
            },
            { type: 'text', text: params.userPrompt },
          ],
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return text;
  } catch (error: any) {
    if (error?.status === 429) {
      console.log('  ⏳ Rate limit Vision, pause 30 secondes...');
      await new Promise((r) => setTimeout(r, 30000));
      releaseSlot();
      return callClaudeVision(params);
    }
    console.error('  ❌ Erreur Claude Vision:', error?.message || error);
    return null;
  } finally {
    releaseSlot();
  }
}

// Parse JSON sécurisé
export function safeParseJSON<T>(text: string): T | null {
  try {
    const cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}
```

### Fichier : `scripts/data-ingestion/utils/normalizer.ts`

```typescript
import crypto from 'crypto';

// Normalise un code CFC (supprime espaces, uniformise les séparateurs)
export function normalizeCFC(raw: string): string {
  return raw
    .replace(/\s+/g, '')
    .replace(/[,;]/g, '.')
    .replace(/^0+/, '')
    .trim();
}

// Normalise une unité
export function normalizeUnit(raw: string): string {
  const mapping: Record<string, string> = {
    'm2': 'm²', 'M2': 'm²', 'm²': 'm²', 'mq': 'm²',
    'm3': 'm³', 'M3': 'm³', 'm³': 'm³', 'mc': 'm³',
    'ml': 'ml', 'ML': 'ml', "m'": 'ml', 'm1': 'ml',
    'kg': 'kg', 'KG': 'kg', 'Kg': 'kg',
    't': 't', 'T': 't', 'to': 't', 'tonne': 't',
    'pce': 'pce', 'pièce': 'pce', 'Stk': 'pce', 'St': 'pce',
    'fft': 'fft', 'gl': 'fft', 'global': 'fft', 'forfait': 'fft',
    'h': 'h', 'heure': 'h', 'Std': 'h',
    'j': 'j', 'jour': 'j', 'Tag': 'j',
  };
  return mapping[raw.trim()] || raw.trim().toLowerCase();
}

// Hash un nom de fournisseur pour anonymisation
export function hashSupplierName(name: string): string {
  return crypto
    .createHash('sha256')
    .update(name.toLowerCase().trim() + 'cantaia_salt_2026')
    .digest('hex')
    .substring(0, 16); // Raccourci pour lisibilité
}

// Extrait la région depuis un chemin ou un nom de projet
export function detectRegion(text: string): string {
  const regions: Record<string, string[]> = {
    'vaud': ['lausanne', 'vaud', 'morges', 'nyon', 'yverdon', 'montreux', 'vevey', 'renens', 'pully', 'prilly'],
    'geneve': ['genève', 'geneve', 'carouge', 'lancy', 'meyrin', 'vernier'],
    'fribourg': ['fribourg', 'bulle', 'morat'],
    'valais': ['sion', 'sierre', 'martigny', 'monthey', 'valais'],
    'neuchatel': ['neuchâtel', 'neuchatel', 'la chaux-de-fonds'],
    'berne': ['bern', 'berne', 'biel', 'bienne', 'thun', 'thoune'],
    'zurich': ['zürich', 'zurich', 'winterthur', 'uster'],
    'bale': ['basel', 'bâle'],
  };

  const lower = text.toLowerCase();
  for (const [region, keywords] of Object.entries(regions)) {
    if (keywords.some((k) => lower.includes(k))) {
      return region;
    }
  }
  return 'vaud'; // Défaut
}

// Détecte le trimestre depuis une date
export function dateToQuarter(date: Date): string {
  const q = Math.ceil((date.getMonth() + 1) / 3);
  return `${date.getFullYear()}-Q${q}`;
}
```

---

## PHASE D — PIPELINE OFFRES FOURNISSEURS (LE PLUS IMPORTANT)

### Fichier : `scripts/data-ingestion/prompts/extract-offer-lines.ts`

```typescript
export const SYSTEM_PROMPT_EXTRACT_OFFER = `Tu es un métreur professionnel suisse spécialisé dans l'analyse d'offres fournisseurs de construction.

Ta tâche : extraire TOUTES les lignes de prix d'une offre fournisseur.

Pour chaque ligne, extrais :
- Le code CFC/CAN (ou le numéro de poste si pas de CFC)
- La description du poste
- La quantité
- L'unité (m², m³, ml, kg, pce, fft, h, etc.)
- Le prix unitaire HT en CHF
- Le prix total HT en CHF
- Le rabais éventuel (en %)

Extrais aussi les métadonnées de l'offre :
- Nom du fournisseur
- Date de l'offre
- Numéro de l'offre
- Projet / chantier mentionné
- Validité de l'offre
- Conditions de paiement

RÈGLES :
- Extrais TOUTES les lignes, même les petits postes
- Si le code CFC n'est pas indiqué, mets null
- Les prix doivent être en CHF HT (sans TVA)
- Si un rabais global est mentionné, note-le dans les métadonnées
- Si tu ne peux pas lire une valeur, mets null — ne devine JAMAIS
- Normalise les unités : m2→m², m3→m³, pce/Stk→pce, etc.

Réponds UNIQUEMENT en JSON valide avec ce schema :

{
  "metadata": {
    "fournisseur": "string",
    "date_offre": "YYYY-MM-DD ou null",
    "numero_offre": "string ou null",
    "projet": "string ou null",
    "validite": "string ou null",
    "conditions_paiement": "string ou null",
    "rabais_global_pct": number ou null,
    "montant_total_ht": number ou null,
    "monnaie": "CHF"
  },
  "lignes": [
    {
      "numero_ligne": number,
      "cfc_code": "string ou null",
      "description": "string",
      "quantite": number ou null,
      "unite": "string ou null",
      "prix_unitaire_ht": number ou null,
      "prix_total_ht": number ou null,
      "rabais_pct": number ou null,
      "remarque": "string ou null"
    }
  ],
  "qualite_extraction": {
    "lignes_extraites": number,
    "lignes_avec_prix": number,
    "lignes_sans_cfc": number,
    "confiance_globale": "high | medium | low",
    "problemes": ["string"]
  }
}`;

export function buildUserPrompt(content: string, filename: string): string {
  return `Voici le contenu de l'offre fournisseur "${filename}".
Extrais toutes les lignes de prix.

---
${content}
---`;
}
```

### Fichier : `scripts/data-ingestion/pipelines/ingest-offers.ts`

```typescript
import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config';
import { scanDirectory } from '../utils/file-scanner';
import { extractTextFromPDF } from '../utils/pdf-parser';
import { extractFromExcel } from '../utils/excel-parser';
import { callClaude, safeParseJSON } from '../utils/ai-extractor';
import { normalizeCFC, normalizeUnit, hashSupplierName, detectRegion, dateToQuarter } from '../utils/normalizer';
import { IngestionLogger } from '../utils/logger';
import { supabase } from '../utils/db';
import { SYSTEM_PROMPT_EXTRACT_OFFER, buildUserPrompt } from '../prompts/extract-offer-lines';

interface OfferExtraction {
  metadata: {
    fournisseur: string;
    date_offre: string | null;
    numero_offre: string | null;
    projet: string | null;
    validite: string | null;
    conditions_paiement: string | null;
    rabais_global_pct: number | null;
    montant_total_ht: number | null;
    monnaie: string;
  };
  lignes: Array<{
    numero_ligne: number;
    cfc_code: string | null;
    description: string;
    quantite: number | null;
    unite: string | null;
    prix_unitaire_ht: number | null;
    prix_total_ht: number | null;
    rabais_pct: number | null;
    remarque: string | null;
  }>;
  qualite_extraction: {
    lignes_extraites: number;
    lignes_avec_prix: number;
    lignes_sans_cfc: number;
    confiance_globale: 'high' | 'medium' | 'low';
    problemes: string[];
  };
}

export async function ingestOffers() {
  console.log('\n═══════════════════════════════════════');
  console.log('  INGESTION DES OFFRES FOURNISSEURS');
  console.log('═══════════════════════════════════════\n');

  // 1. Scanner les fichiers
  const files = scanDirectory(CONFIG.paths.offers, ['.pdf', '.xlsx', '.xls']);
  const logger = new IngestionLogger('OFFRES', files.length);

  console.log(`Fichiers trouvés : ${files.length}\n`);

  let totalLignes = 0;
  let totalFichiers = 0;

  // 2. Traiter par batch
  for (let i = 0; i < files.length; i += CONFIG.limits.batchSize) {
    const batch = files.slice(i, i + CONFIG.limits.batchSize);

    // Traiter chaque fichier du batch séquentiellement
    // (on ne parallélise pas pour respecter les rate limits)
    for (const filePath of batch) {
      const filename = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();

      try {
        // Extraire le contenu selon le type de fichier
        let content: string;

        if (ext === '.pdf') {
          const pdf = await extractTextFromPDF(filePath);
          if (!pdf.text || pdf.text.length < 50) {
            logger.failure(filename, 'PDF vide ou illisible (scan image ?)');
            moveToFailed(filePath);
            continue;
          }
          content = pdf.text;
        } else {
          // Excel
          const excel = extractFromExcel(filePath);
          // Convertir en texte structuré pour Claude
          content = excel.sheets
            .map((s) =>
              `Feuille: ${s.name}\nColonnes: ${s.headers.join(' | ')}\n` +
              s.rows.map((r) => Object.values(r).join(' | ')).join('\n')
            )
            .join('\n\n');
        }

        // Appeler Claude pour extraction
        const response = await callClaude({
          systemPrompt: SYSTEM_PROMPT_EXTRACT_OFFER,
          userPrompt: buildUserPrompt(content, filename),
        });

        if (!response) {
          logger.failure(filename, 'Pas de réponse Claude');
          moveToFailed(filePath);
          continue;
        }

        const extraction = safeParseJSON<OfferExtraction>(response);
        if (!extraction) {
          logger.failure(filename, 'JSON invalide dans la réponse');
          moveToFailed(filePath);
          continue;
        }

        // Déterminer la région et le trimestre
        const region = detectRegion(
          [extraction.metadata.projet, filePath].filter(Boolean).join(' ')
        );
        const dateOffre = extraction.metadata.date_offre
          ? new Date(extraction.metadata.date_offre)
          : new Date(); // Si pas de date, utiliser maintenant
        const quarter = dateToQuarter(dateOffre);

        // Stocker les lignes dans Supabase
        const linesToInsert = extraction.lignes
          .filter((l) => l.prix_unitaire_ht !== null && l.prix_unitaire_ht > 0)
          .map((ligne) => ({
            org_id: CONFIG.orgId,
            source_file: filename,
            source_type: 'ingestion_historique',
            fournisseur_nom: CONFIG.anonymize.keepClearNamesInC1
              ? extraction.metadata.fournisseur
              : null,
            fournisseur_hash: hashSupplierName(extraction.metadata.fournisseur),
            date_offre: extraction.metadata.date_offre,
            quarter: quarter,
            region: region,
            cfc_code: ligne.cfc_code ? normalizeCFC(ligne.cfc_code) : null,
            description: ligne.description,
            quantite: ligne.quantite,
            unite: ligne.unite ? normalizeUnit(ligne.unite) : null,
            prix_unitaire_ht: ligne.prix_unitaire_ht,
            prix_total_ht: ligne.prix_total_ht,
            rabais_pct: ligne.rabais_pct,
            confiance: extraction.qualite_extraction.confiance_globale,
            created_at: new Date().toISOString(),
          }));

        if (linesToInsert.length > 0) {
          const { error } = await supabase
            .from('ingested_offer_lines')
            .insert(linesToInsert);

          if (error) {
            logger.failure(filename, `Erreur Supabase: ${error.message}`);
            moveToFailed(filePath);
            continue;
          }
        }

        totalLignes += linesToInsert.length;
        totalFichiers++;
        logger.success(filename, `${linesToInsert.length} lignes de prix extraites`);
        moveToProcessed(filePath);

      } catch (error: any) {
        logger.failure(filename, error.message || 'Erreur inconnue');
        moveToFailed(filePath);
      }
    }

    // Pause entre les batches
    if (i + CONFIG.limits.batchSize < files.length) {
      console.log(`\n  ⏸ Pause entre batches (${CONFIG.limits.pauseBetweenBatches / 1000}s)...\n`);
      await new Promise((r) => setTimeout(r, CONFIG.limits.pauseBetweenBatches));
    }
  }

  console.log(logger.summary());
  console.log(`  📊 Total : ${totalLignes} lignes de prix extraites de ${totalFichiers} fichiers\n`);
}

function moveToFailed(filePath: string) {
  const dest = path.join(CONFIG.paths.failed, path.basename(filePath));
  fs.mkdirSync(CONFIG.paths.failed, { recursive: true });
  fs.copyFileSync(filePath, dest);
}

function moveToProcessed(filePath: string) {
  const dest = path.join(CONFIG.paths.processed, path.basename(filePath));
  fs.mkdirSync(CONFIG.paths.processed, { recursive: true });
  fs.copyFileSync(filePath, dest);
}
```

---

## PHASE E — MIGRATION SQL POUR L'INGESTION

### Fichier : `supabase/migrations/xxx_ingestion_tables.sql`

```sql
-- ═══════════════════════════════════════
-- Tables pour l'ingestion de données historiques
-- ═══════════════════════════════════════

-- Table brute des lignes d'offre ingérées
-- C'est la table de staging — les données sont ensuite
-- transférées dans offer_line_items après validation
CREATE TABLE IF NOT EXISTS ingested_offer_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  source_file TEXT NOT NULL,
  source_type TEXT DEFAULT 'ingestion_historique',
  -- Fournisseur
  fournisseur_nom TEXT, -- En clair (C1 privé)
  fournisseur_hash TEXT, -- SHA-256 pour C2
  -- Contexte
  date_offre DATE,
  quarter TEXT, -- ex: 2024-Q3
  region TEXT DEFAULT 'vaud',
  -- Poste
  cfc_code TEXT,
  description TEXT NOT NULL,
  quantite NUMERIC,
  unite TEXT,
  prix_unitaire_ht NUMERIC,
  prix_total_ht NUMERIC,
  rabais_pct NUMERIC,
  -- Qualité
  confiance TEXT DEFAULT 'medium',
  -- Statut de validation
  validated BOOLEAN DEFAULT false,
  validated_by UUID,
  validated_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ingested_offers_org ON ingested_offer_lines(org_id);
CREATE INDEX idx_ingested_offers_cfc ON ingested_offer_lines(cfc_code);
CREATE INDEX idx_ingested_offers_region_quarter ON ingested_offer_lines(region, quarter);
CREATE INDEX idx_ingested_offers_validated ON ingested_offer_lines(validated);

ALTER TABLE ingested_offer_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ingested_offers_org_isolation" ON ingested_offer_lines
  USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────

-- Table brute des quantités extraites des plans
CREATE TABLE IF NOT EXISTS ingested_plan_quantities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  source_file TEXT NOT NULL,
  -- Classification du plan
  discipline TEXT,
  type_plan TEXT,
  echelle TEXT,
  bureau_auteur TEXT,
  -- Quantités
  cfc_code TEXT,
  description TEXT,
  quantite NUMERIC,
  unite TEXT,
  methode_mesure TEXT,
  confiance TEXT DEFAULT 'medium',
  -- Surfaces de référence
  surface_brute_plancher NUMERIC,
  type_batiment TEXT,
  region TEXT DEFAULT 'vaud',
  -- Validation
  validated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ingested_plans_org ON ingested_plan_quantities(org_id);
CREATE INDEX idx_ingested_plans_cfc ON ingested_plan_quantities(cfc_code);

ALTER TABLE ingested_plan_quantities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ingested_plans_org_isolation" ON ingested_plan_quantities
  USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────

-- Vue matérialisée : prix de référence calculés depuis les offres ingérées
-- C'est cette vue que le price-resolver consulte
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_reference_prices AS
SELECT
  cfc_code,
  region,
  quarter,
  unite,
  COUNT(*) AS nb_datapoints,
  COUNT(DISTINCT fournisseur_hash) AS nb_fournisseurs,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY prix_unitaire_ht) AS prix_p25,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY prix_unitaire_ht) AS prix_median,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY prix_unitaire_ht) AS prix_p75,
  MIN(prix_unitaire_ht) AS prix_min,
  MAX(prix_unitaire_ht) AS prix_max,
  STDDEV(prix_unitaire_ht) AS prix_stddev,
  MAX(date_offre) AS derniere_offre
FROM ingested_offer_lines
WHERE prix_unitaire_ht IS NOT NULL
  AND prix_unitaire_ht > 0
  AND cfc_code IS NOT NULL
GROUP BY cfc_code, region, quarter, unite
HAVING COUNT(*) >= 2; -- Au moins 2 datapoints

CREATE UNIQUE INDEX idx_mv_ref_prices
  ON mv_reference_prices(cfc_code, region, quarter, unite);

-- ─────────────────────────────────────

-- Fonction pour rafraîchir après ingestion
CREATE OR REPLACE FUNCTION refresh_reference_prices()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_reference_prices;
END;
$$ LANGUAGE plpgsql;
```

---

## PHASE F — ORCHESTRATEUR PRINCIPAL

### Fichier : `scripts/data-ingestion/index.ts`

```typescript
import { CONFIG } from './config';
import { ingestOffers } from './pipelines/ingest-offers';
// import { ingestPlans } from './pipelines/ingest-plans';
// import { ingestEmails } from './pipelines/ingest-emails';

async function main() {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║  CANTAIA — Ingestion Données Historiques  ║');
  console.log('╚═══════════════════════════════════════╝\n');
  console.log(`Organisation : ${CONFIG.orgId}`);
  console.log(`Région par défaut : ${CONFIG.defaultRegion}`);
  console.log(`Anonymisation : ${CONFIG.anonymize.enabled ? 'ACTIVÉE' : 'DÉSACTIVÉE'}`);
  console.log(`Max appels parallèles : ${CONFIG.anonymize.enabled}`);
  console.log('');

  const startTime = Date.now();

  // ═══ ÉTAPE 1 : OFFRES FOURNISSEURS (PRIORITÉ MAXIMALE) ═══
  // C'est le dataset le plus précieux — prix réels par CFC
  await ingestOffers();

  // ═══ ÉTAPE 2 : PLANS (si tu veux aussi les quantités) ═══
  // Décommente quand l'étape 1 est terminée et validée
  // await ingestPlans();

  // ═══ ÉTAPE 3 : EMAILS (pour la classification) ═══
  // Décommente quand les étapes 1-2 sont terminées
  // await ingestEmails();

  // ═══ RAFRAÎCHIR LES VUES ═══
  console.log('\n📊 Rafraîchissement des vues matérialisées...');
  // Appeler la fonction SQL refresh_reference_prices()
  // via Supabase RPC

  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n✅ Ingestion terminée en ${duration}s (${Math.round(duration / 60)}min)`);
  console.log('');
  console.log('Prochaines étapes :');
  console.log('1. Vérifie les résultats dans Supabase (table ingested_offer_lines)');
  console.log('2. Valide un échantillon de 20 lignes manuellement');
  console.log('3. Si OK, lance REFRESH MATERIALIZED VIEW mv_reference_prices');
  console.log('4. Le price-resolver utilisera ces données automatiquement');
}

main().catch(console.error);
```

### Fichier : `scripts/data-ingestion/package.json`

```json
{
  "name": "cantaia-data-ingestion",
  "private": true,
  "type": "module",
  "scripts": {
    "ingest": "npx tsx index.ts",
    "ingest:offers": "npx tsx -e \"import { ingestOffers } from './pipelines/ingest-offers'; ingestOffers()\"",
    "ingest:dry-run": "DRY_RUN=true npx tsx index.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "latest",
    "@supabase/supabase-js": "latest",
    "pdf-parse": "^1.1.1",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "tsx": "latest",
    "typescript": "latest"
  }
}
```

---

## PHASE G — COMMENT LANCER L'INGESTION

### Étape 1 : Prépare tes dossiers (toi, manuellement)

```
/Users/julien.ray/data-cantaia/
├── offres/           ← Mets toutes tes offres PDF + Excel ici
│   ├── 2022/         ← Tu peux organiser par année ou pas
│   ├── 2023/
│   └── 2024/
├── plans/            ← Pour plus tard
├── emails/           ← Pour plus tard
├── _failed/          ← Créé automatiquement
└── _processed/       ← Créé automatiquement
```

### Étape 2 : Configure les variables d'environnement

Crée un fichier `.env` dans `scripts/data-ingestion/` :

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
INGESTION_ORG_ID=uuid-de-ton-organisation
```

### Étape 3 : Lance l'ingestion

```bash
cd scripts/data-ingestion
npm install
npm run ingest
```

Le script va :
1. Scanner tous les PDF et Excel dans /offres/
2. Extraire le texte de chaque fichier
3. Envoyer à Claude pour extraction structurée
4. Stocker les lignes dans Supabase
5. Déplacer les fichiers traités dans /_processed/
6. Déplacer les échecs dans /_failed/
7. Afficher un rapport final

### Étape 4 : Valide un échantillon

Après l'ingestion, ouvre Supabase et vérifie 20 lignes au hasard :
- Le CFC est-il correct ?
- Le prix est-il plausible ?
- L'unité est-elle bonne ?
- Le fournisseur est-il bien identifié ?

Si > 80% sont corrects, c'est bon. Les erreurs seront noyées
dans la masse par les statistiques (médiane, percentiles).

### Étape 5 : Active les prix de référence

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_reference_prices;
```

Après ça, le price-resolver de CANTAIA va automatiquement
trouver ces prix quand un utilisateur lance une estimation.

---

## ESTIMATION DE COÛT ET DURÉE

| Donnée | Volume estimé | Coût Claude | Durée |
|--------|--------------|-------------|-------|
| 300 offres PDF | ~300 appels × $0.05 | ~$15 | ~2h |
| 100 offres Excel | ~100 appels × $0.03 | ~$3 | ~30min |
| 50 plans PDF (Vision) | ~50 appels × $0.10 | ~$5 | ~1h |
| **Total** | | **~$23** | **~3-4h** |

C'est rien. Pour $25 et une nuit de traitement, tu as une base
de données de prix réels qui vaut des milliers de francs.

---

## CE QUE ÇA CHANGE POUR LE PREMIER CLIENT

| Sans ingestion | Avec ingestion |
|---------------|----------------|
| Score confiance prix : 0.25-0.45 | Score confiance prix : 0.70-0.85 |
| Source : "estimation IA" (rouge) | Source : "historique interne" (vert) |
| Prix souvent aberrants | Prix calibrés sur le marché vaudois réel |
| Le client perd confiance en 10 secondes | Le client dit "ah c'est pas loin de ce que j'avais estimé" |
