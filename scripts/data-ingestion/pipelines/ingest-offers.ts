import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config';
import { scanDirectory } from '../utils/file-scanner';
import { extractTextFromPDF } from '../utils/pdf-parser';
import { extractFromExcel } from '../utils/excel-parser';
import { parseMsg } from '../utils/msg-parser';
import { callClaude, safeParseJSON } from '../utils/ai-extractor';
import { extractWithGemini } from '../utils/gemini-extractor';
import { normalizeCFC, normalizeUnit, hashSupplierName, detectRegion, dateToQuarter } from '../utils/normalizer';
import { IngestionLogger } from '../utils/logger';
import { supabase } from '../utils/db';
import { SYSTEM_PROMPT_EXTRACT_OFFER, buildUserPrompt, buildUserPromptFromEmail } from '../prompts/extract-offer-lines';

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

  // 1. Scanner les fichiers selon les extensions configurées
  const files = scanDirectory(CONFIG.paths.offers, CONFIG.extensions.offers);
  const logger = new IngestionLogger('OFFRES', files.length);

  console.log(`Fichiers trouvés : ${files.length}\n`);

  if (files.length === 0) {
    console.log('  Aucun fichier trouvé dans', CONFIG.paths.offers);
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
        // Vérifier la taille du fichier
        const stats = fs.statSync(filePath);
        if (stats.size > CONFIG.limits.maxFileSizeMB * 1024 * 1024) {
          logger.failure(filename, `Fichier trop gros (${Math.round(stats.size / 1024 / 1024)}MB)`);
          moveToFailed(filePath);
          continue;
        }

        let userPrompt: string;
        let supplierFromEmail: string | null = null;
        let dateFromEmail: Date | null = null;

        if (ext === '.msg') {
          // ═══ TRAITEMENT .MSG ═══
          const msg = parseMsg(filePath);
          supplierFromEmail = msg.sender;
          dateFromEmail = msg.date;

          // Extraire le contenu des pièces jointes
          const attachmentContents: Array<{ fileName: string; content: string }> = [];

          for (const att of msg.attachments) {
            const attExt = att.fileName.toLowerCase();
            try {
              if (attExt.endsWith('.pdf')) {
                const pdf = await extractTextFromPDF(att.content);
                if (pdf.text && pdf.text.length > 20) {
                  attachmentContents.push({ fileName: att.fileName, content: pdf.text });
                }
              } else if (attExt.endsWith('.xlsx') || attExt.endsWith('.xls')) {
                const excel = extractFromExcelBuffer(att.content);
                if (excel) {
                  attachmentContents.push({ fileName: att.fileName, content: excel });
                }
              } else if (attExt.endsWith('.docx')) {
                // DOCX non supporté pour l'instant, on signale
                attachmentContents.push({ fileName: att.fileName, content: '(Document DOCX — extraction non supportée)' });
              }
            } catch (attError: any) {
              console.log(`    ⚠ PJ "${att.fileName}" illisible: ${attError.message}`);
            }
          }

          // Si ni corps ni PJ n'ont de contenu exploitable
          const hasBody = msg.body && msg.body.trim().length > 20;
          const hasAttachments = attachmentContents.length > 0;

          if (!hasBody && !hasAttachments) {
            logger.failure(filename, 'Email sans contenu exploitable (corps vide, pas de PJ lisible)');
            moveToFailed(filePath);
            continue;
          }

          const dateStr = msg.date
            ? msg.date.toISOString().split('T')[0]
            : 'date inconnue';

          userPrompt = buildUserPromptFromEmail({
            sender: msg.sender,
            date: dateStr,
            subject: msg.subject,
            body: msg.body,
            attachments: attachmentContents,
          });

        } else if (ext === '.pdf') {
          // ═══ TRAITEMENT PDF DIRECT (rétrocompat) ═══
          const pdf = await extractTextFromPDF(filePath);
          if (!pdf.text || pdf.text.length < 50) {
            logger.failure(filename, 'PDF vide ou illisible (scan image ?)');
            moveToFailed(filePath);
            continue;
          }
          userPrompt = buildUserPrompt(pdf.text, filename);

        } else {
          // ═══ TRAITEMENT EXCEL DIRECT (rétrocompat) ═══
          const excel = extractFromExcel(filePath);
          const content = excel.sheets
            .map((s) =>
              `Feuille: ${s.name}\nColonnes: ${s.headers.join(' | ')}\n` +
              s.rows.map((r) => Object.values(r).join(' | ')).join('\n')
            )
            .join('\n\n');
          userPrompt = buildUserPrompt(content, filename);
        }

        // Appeler Gemini Flash pour extraction (Claude Haiku en fallback)
        let response: string | null = null;
        let usedModel = 'gemini-2.0-flash';

        try {
          response = await extractWithGemini(SYSTEM_PROMPT_EXTRACT_OFFER, userPrompt);
        } catch (geminiError: any) {
          console.log(`  ⚠ Gemini échoué (${geminiError.message}) → fallback Claude Haiku`);
          usedModel = 'claude-haiku-4-5-20251001';
          response = await callClaude({
            systemPrompt: SYSTEM_PROMPT_EXTRACT_OFFER,
            userPrompt,
          });
        }

        if (!response) {
          logger.failure(filename, 'Pas de réponse IA');
          moveToFailed(filePath);
          continue;
        }

        let extraction = safeParseJSON<OfferExtraction>(response);

        // Si JSON invalide depuis Gemini, retry avec Claude Haiku
        if (!extraction && usedModel === 'gemini-2.0-flash') {
          console.log(`  ⚠ JSON invalide (Gemini) → fallback Claude Haiku`);
          usedModel = 'claude-haiku-4-5-20251001';
          response = await callClaude({
            systemPrompt: SYSTEM_PROMPT_EXTRACT_OFFER,
            userPrompt,
          });
          if (response) {
            extraction = safeParseJSON<OfferExtraction>(response);
          }
        }

        if (!extraction) {
          logger.failure(filename, 'JSON invalide dans la réponse');
          moveToFailed(filePath);
          continue;
        }

        // Pour les .msg : le fournisseur = l'expéditeur, la date = date de l'email
        if (supplierFromEmail && (!extraction.metadata.fournisseur || extraction.metadata.fournisseur === 'Inconnu')) {
          extraction.metadata.fournisseur = supplierFromEmail;
        }
        if (dateFromEmail && !extraction.metadata.date_offre) {
          extraction.metadata.date_offre = dateFromEmail.toISOString().split('T')[0];
        }

        // Email sans prix → c'est normal, pas une erreur
        if (extraction.lignes.length === 0) {
          logger.success(filename, '0 lignes — email informatif (pas de prix)');
          moveToProcessed(filePath);
          totalFichiers++;
          continue;
        }

        // Déterminer la région et le trimestre
        const region = detectRegion(
          [extraction.metadata.projet, filePath].filter(Boolean).join(' ')
        );
        const dateOffre = extraction.metadata.date_offre
          ? new Date(extraction.metadata.date_offre)
          : dateFromEmail || new Date();
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
        logger.success(filename, `${linesToInsert.length} lignes de prix extraites (${usedModel})`);
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
  console.log(`  Total : ${totalLignes} lignes de prix extraites de ${totalFichiers} fichiers\n`);
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

// Extraire le contenu Excel depuis un buffer (pour les PJ des .msg)
function extractFromExcelBuffer(buffer: Buffer): string | null {
  const XLSX = require('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const parts: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    if (rows.length === 0) continue;
    const headers = Object.keys(rows[0] as Record<string, unknown>);
    parts.push(
      `Feuille: ${name}\nColonnes: ${headers.join(' | ')}\n` +
      rows.map((r: any) => Object.values(r).join(' | ')).join('\n')
    );
  }
  return parts.length > 0 ? parts.join('\n\n') : null;
}
