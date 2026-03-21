import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config';
import { scanDirectory } from '../utils/file-scanner';
import { extractImageFromPDF } from '../utils/pdf-parser';
import { callClaudeVision, safeParseJSON } from '../utils/ai-extractor';
import { normalizeCFC, normalizeUnit, detectRegion } from '../utils/normalizer';
import { IngestionLogger } from '../utils/logger';
import { supabase } from '../utils/db';
import { SYSTEM_PROMPT_EXTRACT_PLAN, buildPlanUserPrompt } from '../prompts/extract-plan-quantities';

// ═══ INTERFACES ═══

interface PlanIdentification {
  discipline: string;
  type_plan: string;
  echelle: string | null;
  bureau_auteur: string | null;
  numero_plan: string | null;
  projet: string | null;
  qualite: 'haute' | 'moyenne' | 'basse';
}

interface PlanSurfacesReference {
  surface_brute_plancher_m2: number | null;
  surface_nette_plancher_m2: number | null;
  surface_facade_m2: number | null;
  hauteur_etage_m: number | null;
}

interface PlanQuantite {
  cfc_code: string;
  description: string;
  quantite: number;
  unite: string;
  methode: 'cotation_lue' | 'mesure_echelle' | 'estimation';
  confiance: 'high' | 'medium' | 'low';
}

interface PlanRatios {
  beton_m3_par_m2_sbp: number | null;
  coffrage_m2_par_m2_sbp: number | null;
  facade_m2_par_m2_sbp: number | null;
  ouvertures_par_m2_sbp: number | null;
}

interface PlanExtraction {
  identification: PlanIdentification;
  surfaces_reference: PlanSurfacesReference;
  quantites: PlanQuantite[];
  ratios: PlanRatios;
  avertissements: string[];
}

// ═══ CONSTANTES PLANS ═══
const MAX_FILE_SIZE_MB = 20; // Vision API limit
const MAX_CONCURRENT_VISION = 2; // Vision calls are heavier
const DELAY_BETWEEN_CALLS_MS = 2000;
const BATCH_SIZE = 5;
const PAUSE_BETWEEN_BATCHES_MS = 10000;

// ═══ PIPELINE PRINCIPAL ═══

export async function ingestPlans() {
  console.log('\n═══════════════════════════════════════');
  console.log('  INGESTION DES PLANS DE CONSTRUCTION');
  console.log('═══════════════════════════════════════\n');

  const plansDir = CONFIG.paths.plans;
  console.log(`Répertoire : ${plansDir}`);

  // 1. Scanner les fichiers PDF
  const files = scanDirectory(plansDir, CONFIG.extensions.plans);
  const logger = new IngestionLogger('PLANS', files.length);

  console.log(`Fichiers trouvés : ${files.length}\n`);

  if (files.length === 0) {
    console.log('  Aucun fichier trouvé dans', plansDir);
    return;
  }

  // Compteurs pour le résumé
  let totalQuantites = 0;
  let totalFichiers = 0;
  let totalSkippedSize = 0;
  let totalSkippedQuality = 0;
  let totalSkippedType = 0;
  let totalJsonErrors = 0;

  // Accumulateurs pour le résumé final
  const cfcCounter: Record<string, number> = {};
  const disciplineCounter: Record<string, number> = {};
  const ratiosByDiscipline: Record<string, { beton: number[]; coffrage: number[]; facade: number[] }> = {};

  // 2. Traiter par batch de 5
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);

    // Traiter max 2 en parallèle dans le batch
    for (let j = 0; j < batch.length; j += MAX_CONCURRENT_VISION) {
      const parallelFiles = batch.slice(j, j + MAX_CONCURRENT_VISION);

      await Promise.all(
        parallelFiles.map(async (filePath) => {
          const filename = path.basename(filePath);
          const ext = path.extname(filePath).toLowerCase();

          try {
            // ═══ Vérifier la taille (20 Mo max pour Vision) ═══
            const stats = fs.statSync(filePath);
            const sizeMB = stats.size / (1024 * 1024);
            if (sizeMB > MAX_FILE_SIZE_MB) {
              logger.failure(filename, `Trop volumineux (${Math.round(sizeMB)}MB > ${MAX_FILE_SIZE_MB}MB)`);
              totalSkippedSize++;
              return;
            }

            // Déterminer le type de média
            let mediaType: 'application/pdf' | 'image/png' | 'image/jpeg';
            if (ext === '.pdf') {
              mediaType = 'application/pdf';
            } else if (ext === '.png') {
              mediaType = 'image/png';
            } else {
              mediaType = 'image/jpeg';
            }

            // Encoder en base64
            const imageBase64 = await extractImageFromPDF(filePath);

            // Délai entre appels
            await new Promise((r) => setTimeout(r, DELAY_BETWEEN_CALLS_MS));

            // ═══ Appeler Claude Vision ═══
            const response = await callClaudeVision({
              systemPrompt: SYSTEM_PROMPT_EXTRACT_PLAN,
              userPrompt: buildPlanUserPrompt(filename),
              imageBase64,
              mediaType,
            });

            if (!response) {
              logger.failure(filename, 'Pas de réponse Claude Vision');
              moveToFailed(filePath);
              return;
            }

            // ═══ Parser le JSON ═══
            const extraction = safeParseJSON<PlanExtraction>(response);
            if (!extraction) {
              logger.failure(filename, 'JSON invalide');
              moveToFailed(filePath);
              totalJsonErrors++;
              return;
            }

            // ═══ Vérifier qualité et type ═══
            if (extraction.identification.qualite === 'basse') {
              logger.failure(filename, 'Plan illisible (qualité basse)');
              totalSkippedQuality++;
              moveToFailed(filePath);
              return;
            }

            if (extraction.identification.type_plan === 'non_exploitable') {
              logger.failure(filename, 'Pas un plan de construction');
              totalSkippedType++;
              moveToFailed(filePath);
              return;
            }

            // Déterminer la région
            const region = detectRegion(
              [extraction.identification.projet, filePath].filter(Boolean).join(' ')
            );
            const discipline = extraction.identification.discipline?.toLowerCase() || 'inconnu';

            // ═══ Stocker les quantités ═══
            const quantitiesToInsert = extraction.quantites.map((q) => ({
              org_id: CONFIG.orgId,
              source_file: filename,
              discipline,
              type_plan: extraction.identification.type_plan,
              echelle: extraction.identification.echelle,
              bureau_auteur: extraction.identification.bureau_auteur,
              cfc_code: q.cfc_code ? normalizeCFC(q.cfc_code) : null,
              description: q.description,
              quantite: q.quantite,
              unite: normalizeUnit(q.unite),
              methode_mesure: q.methode,
              confiance: q.confiance,
              surface_brute_plancher: extraction.surfaces_reference.surface_brute_plancher_m2,
              type_batiment: null, // sera enrichi après
              region,
              created_at: new Date().toISOString(),
            }));

            if (quantitiesToInsert.length > 0) {
              const { error } = await supabase
                .from('ingested_plan_quantities')
                .insert(quantitiesToInsert);

              if (error) {
                logger.failure(filename, `Erreur Supabase (quantités): ${error.message}`);
                moveToFailed(filePath);
                return;
              }
            }

            // ═══ Stocker les ratios ═══
            const hasRatios =
              extraction.ratios.beton_m3_par_m2_sbp !== null ||
              extraction.ratios.coffrage_m2_par_m2_sbp !== null ||
              extraction.ratios.facade_m2_par_m2_sbp !== null ||
              extraction.ratios.ouvertures_par_m2_sbp !== null;

            if (hasRatios) {
              const ratioRow = {
                org_id: CONFIG.orgId,
                source_file: filename,
                discipline,
                type_plan: extraction.identification.type_plan,
                bureau_auteur: extraction.identification.bureau_auteur,
                projet: extraction.identification.projet,
                surface_brute_plancher_m2: extraction.surfaces_reference.surface_brute_plancher_m2,
                beton_m3_par_m2_sbp: extraction.ratios.beton_m3_par_m2_sbp,
                coffrage_m2_par_m2_sbp: extraction.ratios.coffrage_m2_par_m2_sbp,
                facade_m2_par_m2_sbp: extraction.ratios.facade_m2_par_m2_sbp,
                ouvertures_par_m2_sbp: extraction.ratios.ouvertures_par_m2_sbp,
              };

              const { error: ratioError } = await supabase
                .from('ingested_plan_ratios')
                .insert(ratioRow);

              if (ratioError) {
                // Non-bloquant : on log mais on continue
                console.log(`    ⚠ Ratio non stocké pour ${filename}: ${ratioError.message}`);
              }
            }

            // ═══ Accumuler pour le résumé ═══
            totalQuantites += quantitiesToInsert.length;
            totalFichiers++;

            // Compteur CFC
            for (const q of extraction.quantites) {
              if (q.cfc_code) {
                const code = normalizeCFC(q.cfc_code);
                cfcCounter[code] = (cfcCounter[code] || 0) + 1;
              }
            }

            // Compteur discipline
            disciplineCounter[discipline] = (disciplineCounter[discipline] || 0) + 1;

            // Accumuler ratios par discipline
            if (hasRatios) {
              if (!ratiosByDiscipline[discipline]) {
                ratiosByDiscipline[discipline] = { beton: [], coffrage: [], facade: [] };
              }
              if (extraction.ratios.beton_m3_par_m2_sbp !== null) {
                ratiosByDiscipline[discipline].beton.push(extraction.ratios.beton_m3_par_m2_sbp);
              }
              if (extraction.ratios.coffrage_m2_par_m2_sbp !== null) {
                ratiosByDiscipline[discipline].coffrage.push(extraction.ratios.coffrage_m2_par_m2_sbp);
              }
              if (extraction.ratios.facade_m2_par_m2_sbp !== null) {
                ratiosByDiscipline[discipline].facade.push(extraction.ratios.facade_m2_par_m2_sbp);
              }
            }

            // Avertissements
            if (extraction.avertissements && extraction.avertissements.length > 0) {
              for (const warn of extraction.avertissements) {
                console.log(`    ⚠ ${filename}: ${warn}`);
              }
            }

            logger.success(
              filename,
              `${quantitiesToInsert.length} quantités extraites`
            );
            moveToProcessed(filePath);
          } catch (error: any) {
            logger.failure(filename, error.message || 'Erreur inconnue');
            moveToFailed(filePath);
          }
        })
      );
    }

    // Pause entre les batches de 5
    if (i + BATCH_SIZE < files.length) {
      console.log(`\n  ⏸ Pause entre batches (${PAUSE_BETWEEN_BATCHES_MS / 1000}s)...\n`);
      await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_BATCHES_MS));
    }
  }

  // ═══ RÉSUMÉ FINAL ═══
  console.log(logger.summary());

  console.log('  ═══ RÉSUMÉ DÉTAILLÉ ═══\n');
  console.log(`  Plans analysés avec succès : ${totalFichiers}`);
  console.log(`  Quantités extraites : ${totalQuantites}`);
  console.log(`  Skip — trop volumineux (>${MAX_FILE_SIZE_MB}MB) : ${totalSkippedSize}`);
  console.log(`  Skip — plan illisible : ${totalSkippedQuality}`);
  console.log(`  Skip — pas un plan : ${totalSkippedType}`);
  console.log(`  Erreurs JSON : ${totalJsonErrors}`);

  // Plans par discipline
  console.log('\n  ─── Plans par discipline ───');
  for (const [disc, count] of Object.entries(disciplineCounter).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${disc.padEnd(20)} ${count} plans`);
  }

  // Top 10 CFC
  const topCFC = Object.entries(cfcCounter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (topCFC.length > 0) {
    console.log('\n  ─── Top 10 codes CFC ───');
    for (const [code, count] of topCFC) {
      console.log(`  CFC ${code.padEnd(10)} ${count} occurrences`);
    }
  }

  // Ratios moyens par discipline
  const disciplinesWithRatios = Object.keys(ratiosByDiscipline);
  if (disciplinesWithRatios.length > 0) {
    console.log('\n  ─── Ratios moyens par discipline ───');
    for (const disc of disciplinesWithRatios) {
      const r = ratiosByDiscipline[disc];
      const avgBeton = r.beton.length > 0
        ? (r.beton.reduce((a, b) => a + b, 0) / r.beton.length).toFixed(3)
        : '—';
      const avgCoffrage = r.coffrage.length > 0
        ? (r.coffrage.reduce((a, b) => a + b, 0) / r.coffrage.length).toFixed(3)
        : '—';
      const avgFacade = r.facade.length > 0
        ? (r.facade.reduce((a, b) => a + b, 0) / r.facade.length).toFixed(3)
        : '—';
      console.log(`  ${disc}:`);
      console.log(`    m³ béton / m² SBP : ${avgBeton} (${r.beton.length} plans)`);
      console.log(`    m² coffrage / m² SBP : ${avgCoffrage} (${r.coffrage.length} plans)`);
      console.log(`    m² façade / m² SBP : ${avgFacade} (${r.facade.length} plans)`);
    }
  }

  console.log('');
}

// ═══ Helpers ═══

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
