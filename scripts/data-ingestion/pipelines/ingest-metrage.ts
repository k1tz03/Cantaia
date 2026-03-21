import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config';
import { scanDirectory } from '../utils/file-scanner';
import { extractTextFromPDF } from '../utils/pdf-parser';
import { extractFromExcel } from '../utils/excel-parser';
import { callClaude, safeParseJSON } from '../utils/ai-extractor';
import { normalizeCFC, normalizeUnit, detectRegion, dateToQuarter } from '../utils/normalizer';
import { IngestionLogger } from '../utils/logger';
import { supabase } from '../utils/db';

const SYSTEM_PROMPT_EXTRACT_METRAGE = `Tu es un métreur professionnel suisse spécialisé dans l'analyse de descriptifs et métrés CFC.

Ta tâche : extraire TOUTES les lignes d'un descriptif de métré / devis quantitatif.

Pour chaque ligne, extrais :
- Le code CFC/CAN
- La description du poste
- La quantité
- L'unité (m², m³, ml, kg, pce, fft, h, etc.)
- Le prix unitaire HT si présent
- Le prix total HT si présent

Extrais aussi les métadonnées :
- Projet / chantier
- Bureau / architecte auteur du métré
- Date du document
- Phase du projet (APD, DCE, soumission, exécution)

RÈGLES :
- Extrais TOUTES les lignes, y compris les sous-totaux par chapitre CFC
- Si le CFC est un titre de chapitre (ex: "221 Maçonnerie"), note-le comme tel
- Les prix doivent être en CHF HT (sans TVA)
- Conserve la hiérarchie CFC (chapitre → sous-chapitre → poste)
- Si tu ne peux pas lire une valeur, mets null

Réponds UNIQUEMENT en JSON valide :

{
  "metadata": {
    "projet": "string ou null",
    "bureau_auteur": "string ou null",
    "date_document": "YYYY-MM-DD ou null",
    "phase": "apd | dce | soumission | execution | autre | null",
    "type_document": "descriptif | metrage | devis_quantitatif | recapitulatif"
  },
  "lignes": [
    {
      "numero_ligne": number,
      "cfc_code": "string",
      "est_titre_chapitre": boolean,
      "description": "string",
      "quantite": number ou null,
      "unite": "string ou null",
      "prix_unitaire_ht": number ou null,
      "prix_total_ht": number ou null,
      "niveau_hierarchie": 1 | 2 | 3
    }
  ],
  "totaux": {
    "montant_total_ht": number ou null,
    "nb_chapitres_cfc": number,
    "nb_postes": number
  },
  "qualite_extraction": {
    "confiance_globale": "high | medium | low",
    "problemes": ["string"]
  }
}`;

interface MetrageExtraction {
  metadata: {
    projet: string | null;
    bureau_auteur: string | null;
    date_document: string | null;
    phase: string | null;
    type_document: string;
  };
  lignes: Array<{
    numero_ligne: number;
    cfc_code: string;
    est_titre_chapitre: boolean;
    description: string;
    quantite: number | null;
    unite: string | null;
    prix_unitaire_ht: number | null;
    prix_total_ht: number | null;
    niveau_hierarchie: number;
  }>;
  totaux: {
    montant_total_ht: number | null;
    nb_chapitres_cfc: number;
    nb_postes: number;
  };
  qualite_extraction: {
    confiance_globale: 'high' | 'medium' | 'low';
    problemes: string[];
  };
}

export async function ingestMetrages() {
  console.log('\n═══════════════════════════════════════');
  console.log('  INGESTION DES MÉTRÉS / DESCRIPTIFS');
  console.log('═══════════════════════════════════════\n');

  // 1. Scanner les fichiers
  const files = scanDirectory(CONFIG.paths.metrages, ['.pdf', '.xlsx', '.xls']);
  const logger = new IngestionLogger('MÉTRÉS', files.length);

  console.log(`Fichiers trouvés : ${files.length}\n`);

  if (files.length === 0) {
    console.log('  Aucun fichier trouvé dans', CONFIG.paths.metrages);
    return;
  }

  let totalLignes = 0;
  let totalFichiers = 0;

  // 2. Traiter par batch
  for (let i = 0; i < files.length; i += CONFIG.limits.batchSize) {
    const batch = files.slice(i, i + CONFIG.limits.batchSize);

    for (const filePath of batch) {
      const filename = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();

      try {
        // Vérifier la taille
        const stats = fs.statSync(filePath);
        if (stats.size > CONFIG.limits.maxFileSizeMB * 1024 * 1024) {
          logger.failure(filename, `Fichier trop gros (${Math.round(stats.size / 1024 / 1024)}MB)`);
          moveToFailed(filePath);
          continue;
        }

        // Extraire le contenu
        let content: string;

        if (ext === '.pdf') {
          const pdf = await extractTextFromPDF(filePath);
          if (!pdf.text || pdf.text.length < 50) {
            logger.failure(filename, 'PDF vide ou illisible');
            moveToFailed(filePath);
            continue;
          }
          content = pdf.text;
        } else {
          const excel = extractFromExcel(filePath);
          content = excel.sheets
            .map((s) =>
              `Feuille: ${s.name}\nColonnes: ${s.headers.join(' | ')}\n` +
              s.rows.map((r) => Object.values(r).join(' | ')).join('\n')
            )
            .join('\n\n');
        }

        // Appeler Claude
        const response = await callClaude({
          systemPrompt: SYSTEM_PROMPT_EXTRACT_METRAGE,
          userPrompt: `Voici le contenu du métré/descriptif "${filename}". Extrais toutes les lignes.\n\n---\n${content}\n---`,
        });

        if (!response) {
          logger.failure(filename, 'Pas de réponse Claude');
          moveToFailed(filePath);
          continue;
        }

        const extraction = safeParseJSON<MetrageExtraction>(response);
        if (!extraction) {
          logger.failure(filename, 'JSON invalide dans la réponse');
          moveToFailed(filePath);
          continue;
        }

        // Déterminer la région
        const region = detectRegion(
          [extraction.metadata.projet, filePath].filter(Boolean).join(' ')
        );
        const dateDoc = extraction.metadata.date_document
          ? new Date(extraction.metadata.date_document)
          : new Date();
        const quarter = dateToQuarter(dateDoc);

        // Stocker les lignes avec prix dans ingested_offer_lines
        // (même table, source_type différent pour identifier l'origine)
        const linesToInsert = extraction.lignes
          .filter((l) => !l.est_titre_chapitre && l.prix_unitaire_ht !== null && l.prix_unitaire_ht > 0)
          .map((ligne) => ({
            org_id: CONFIG.orgId,
            source_file: filename,
            source_type: 'ingestion_metrage',
            fournisseur_nom: extraction.metadata.bureau_auteur || null,
            fournisseur_hash: extraction.metadata.bureau_auteur
              ? 'bureau_' + extraction.metadata.bureau_auteur.toLowerCase().replace(/\s+/g, '_')
              : 'unknown',
            date_offre: extraction.metadata.date_document,
            quarter: quarter,
            region: region,
            cfc_code: normalizeCFC(ligne.cfc_code),
            description: ligne.description,
            quantite: ligne.quantite,
            unite: ligne.unite ? normalizeUnit(ligne.unite) : null,
            prix_unitaire_ht: ligne.prix_unitaire_ht,
            prix_total_ht: ligne.prix_total_ht,
            rabais_pct: null,
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
        logger.success(
          filename,
          `${linesToInsert.length} lignes de prix | ${extraction.totaux.nb_chapitres_cfc} chapitres CFC | ${extraction.metadata.type_document}`
        );
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
  console.log(`  📊 Total : ${totalLignes} lignes de prix extraites de ${totalFichiers} métrés\n`);
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
