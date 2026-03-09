import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config';
import { parseMsg } from '../utils/msg-parser';
import { scanDirectory } from '../utils/file-scanner';
import { callClaude, safeParseJSON } from '../utils/ai-extractor';
import { IngestionLogger } from '../utils/logger';
import { supabase } from '../utils/db';

// ═══════════════════════════════════════════════════════════════
// PIPELINE D'INGESTION EMAILS (.msg)
// Passe 1 : Parsing local (GRATUIT, rapide)
// Passe 2 : Classification Claude (optionnelle, 500 emails max)
// ═══════════════════════════════════════════════════════════════

// ─── Mots vides à filtrer des sujets ───
const STOP_WORDS = new Set([
  // Email prefixes
  'tr', 're', 'fw', 'fwd', 'aw', 'wg',
  // French
  'de', 'du', 'le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou', 'en',
  'à', 'au', 'aux', 'ce', 'cette', 'ces', 'pour', 'par', 'sur', 'dans',
  'avec', 'est', 'sont', 'a', 'nous', 'vous', 'votre', 'vos', 'nos',
  'mon', 'ma', 'mes', 'son', 'sa', 'ses', 'que', 'qui', 'dont', 'où',
  'il', 'elle', 'on', 'je', 'tu', 'ne', 'pas', 'plus', 'si', 'bien',
  // German
  'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'in', 'von',
  'zu', 'mit', 'für', 'auf', 'an', 'ist', 'sind', 'den', 'dem',
  // English
  'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for',
  'of', 'is', 'are', 'was', 'be', 'has', 'have', 'it', 'we', 'you',
  // Common noise
  'nr', 'no', 'ref', 'info', 'mail', 'email', 'objet',
]);

// ─── Mots fréquents par langue pour la détection ───
const LANG_WORDS = {
  fr: ['bonjour', 'cordialement', 'merci', 'madame', 'monsieur', 'veuillez',
       'chantier', 'offre', 'travaux', 'projet', 'séance', 'réunion',
       'commande', 'livraison', 'facture', 'devis', 'entreprise'],
  de: ['guten', 'freundlich', 'grüsse', 'herr', 'frau', 'bitte',
       'baustelle', 'angebot', 'arbeiten', 'projekt', 'sitzung',
       'bestellung', 'lieferung', 'rechnung', 'offerte', 'firma'],
  en: ['hello', 'regards', 'thank', 'please', 'meeting', 'project',
       'order', 'delivery', 'invoice', 'quotation', 'dear', 'sincerely'],
};

// ─── Interfaces ───
interface EmailMetadata {
  org_id: string;
  source_file: string;
  from_email: string | null;
  from_name: string | null;
  from_domain: string | null;
  to_emails: string[];
  date_sent: string | null;
  subject: string | null;
  subject_keywords: string[];
  has_attachments: boolean;
  attachment_types: string[];
  body_length: number;
  language: string;
}

interface ClassificationResult {
  project: string | null;
  category: string | null;
}

// ═══════════════════════════════════════════════════════════════
// FONCTIONS UTILITAIRES
// ═══════════════════════════════════════════════════════════════

function extractDomain(email: string): string | null {
  if (!email) return null;
  const match = email.match(/@([a-zA-Z0-9.-]+)/);
  return match ? match[1].toLowerCase() : null;
}

function extractKeywords(subject: string): string[] {
  if (!subject) return [];
  return subject
    .toLowerCase()
    .replace(/[^a-zà-ÿ0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    .filter((w, i, arr) => arr.indexOf(w) === i); // deduplicate
}

function extractAttachmentTypes(attachments: Array<{ fileName: string }>): string[] {
  const exts = new Set<string>();
  for (const att of attachments) {
    const ext = path.extname(att.fileName).toLowerCase();
    if (ext) exts.add(ext);
  }
  return Array.from(exts);
}

function detectLanguage(text: string): string {
  if (!text) return 'fr';
  const lower = text.toLowerCase().substring(0, 2000);

  const scores: Record<string, number> = { fr: 0, de: 0, en: 0 };
  for (const [lang, words] of Object.entries(LANG_WORDS)) {
    for (const word of words) {
      if (lower.includes(word)) scores[lang]++;
    }
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : 'fr'; // default FR
}

function extractRecipients(msgData: any): string[] {
  // msgreader returns recipients in various formats
  const recipients: string[] = [];
  if (msgData.recipients) {
    for (const r of msgData.recipients) {
      const email = r.email || r.smtpAddress || '';
      if (email) recipients.push(email.toLowerCase());
    }
  }
  return recipients;
}

// ═══════════════════════════════════════════════════════════════
// PASSE 1 : PARSING LOCAL (GRATUIT)
// ═══════════════════════════════════════════════════════════════

export async function ingestEmails() {
  console.log('\n═══════════════════════════════════════');
  console.log('  INGESTION EMAILS — MÉTADONNÉES');
  console.log('═══════════════════════════════════════\n');

  // 1. Scanner les fichiers .msg
  const files = scanDirectory(CONFIG.paths.emails, ['.msg']);
  const logger = new IngestionLogger('EMAILS', files.length);

  console.log(`Fichiers .msg trouvés : ${files.length}`);
  console.log(`Dossier : ${CONFIG.paths.emails}\n`);

  if (files.length === 0) {
    console.log('  Aucun fichier .msg trouvé dans', CONFIG.paths.emails);
    return;
  }

  // Vérifier les doublons déjà ingérés
  const { data: existing } = await supabase
    .from('ingested_email_metadata')
    .select('source_file')
    .eq('org_id', CONFIG.orgId);

  const alreadyDone = new Set((existing || []).map((e: any) => e.source_file));
  const toProcess = files.filter((f) => !alreadyDone.has(path.basename(f)));
  console.log(`  Déjà ingérés : ${alreadyDone.size}`);
  console.log(`  À traiter : ${toProcess.length}\n`);

  if (toProcess.length === 0) {
    console.log('  ✅ Tous les fichiers ont déjà été ingérés.');
    await printStats();
    return;
  }

  let totalProcessed = 0;
  let totalFailed = 0;

  // 2. Traiter par batch
  for (let i = 0; i < toProcess.length; i += CONFIG.limits.batchSize) {
    const batch = toProcess.slice(i, i + CONFIG.limits.batchSize);

    for (const filePath of batch) {
      const filename = path.basename(filePath);

      try {
        // Parse le .msg
        const msg = parseMsg(filePath);

        // Extraire les métadonnées SANS appel IA
        const metadata: EmailMetadata = {
          org_id: CONFIG.orgId,
          source_file: filename,
          from_email: msg.senderEmail?.toLowerCase() || null,
          from_name: msg.sender || null,
          from_domain: extractDomain(msg.senderEmail),
          to_emails: extractRecipients(msg),
          date_sent: msg.date?.toISOString() || null,
          subject: msg.subject || null,
          subject_keywords: extractKeywords(msg.subject),
          has_attachments: msg.attachments.length > 0,
          attachment_types: extractAttachmentTypes(msg.attachments),
          body_length: msg.body?.length || 0,
          language: detectLanguage(msg.body),
        };

        // Insérer dans Supabase
        const { error } = await supabase
          .from('ingested_email_metadata')
          .insert(metadata);

        if (error) {
          logger.failure(filename, `Supabase: ${error.message}`);
          totalFailed++;
          continue;
        }

        totalProcessed++;
        const preview = msg.subject ? msg.subject.substring(0, 50) : '(pas d\'objet)';
        logger.success(filename, `${metadata.from_domain || '?'} | ${metadata.language} | ${preview}`);

      } catch (error: any) {
        logger.failure(filename, error.message || 'Erreur parsing');
        totalFailed++;
      }
    }

    // Pause entre les batches (léger, juste pour éviter de bloquer le disque)
    if (i + CONFIG.limits.batchSize < toProcess.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log(logger.summary());
  console.log(`  📊 Résultat : ${totalProcessed} traités, ${totalFailed} échecs\n`);

  // 3. Statistiques
  await printStats();
}

// ═══════════════════════════════════════════════════════════════
// PASSE 2 : CLASSIFICATION CLAUDE (optionnelle, 500 max)
// ═══════════════════════════════════════════════════════════════

const CLASSIFICATION_PROMPT = `Classifie cet email de chantier suisse.
Réponds UNIQUEMENT en JSON : {"project": string|null, "category": string}
Catégories possibles : demande_prix, offre, coordination, convocation, validation, facturation, relance, information, personnel, spam`;

const VALID_CATEGORIES = new Set([
  'demande_prix', 'offre', 'coordination', 'convocation',
  'validation', 'facturation', 'relance', 'information',
  'personnel', 'spam',
]);

export async function classifyEmails(limit: number = 500) {
  console.log('\n═══════════════════════════════════════');
  console.log(`  CLASSIFICATION CLAUDE (${limit} emails max)`);
  console.log('═══════════════════════════════════════\n');

  // Récupérer les emails non classifiés, les plus récents d'abord
  const { data: emails, error } = await supabase
    .from('ingested_email_metadata')
    .select('id, from_name, from_email, subject')
    .eq('org_id', CONFIG.orgId)
    .is('detected_category', null)
    .order('date_sent', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('  ❌ Erreur Supabase:', error.message);
    return;
  }

  if (!emails || emails.length === 0) {
    console.log('  ✅ Aucun email à classifier.');
    return;
  }

  console.log(`  Emails à classifier : ${emails.length}\n`);
  const logger = new IngestionLogger('CLASSIFY', emails.length);
  let classified = 0;

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const fromDisplay = email.from_name || email.from_email || 'Inconnu';

    try {
      const userPrompt = `De: ${fromDisplay} <${email.from_email || ''}>\nObjet: ${email.subject || '(vide)'}`;

      const response = await callClaude({
        systemPrompt: CLASSIFICATION_PROMPT,
        userPrompt,
        maxTokens: 200,
      });

      if (!response) {
        logger.failure(`#${i + 1}`, 'Pas de réponse Claude');
        continue;
      }

      const result = safeParseJSON<ClassificationResult>(response);
      if (!result) {
        logger.failure(`#${i + 1}`, 'JSON invalide');
        continue;
      }

      // Valider la catégorie
      const category = result.category && VALID_CATEGORIES.has(result.category)
        ? result.category
        : null;

      // Mettre à jour dans Supabase
      const { error: updateError } = await supabase
        .from('ingested_email_metadata')
        .update({
          detected_project: result.project || null,
          detected_category: category,
        })
        .eq('id', email.id);

      if (updateError) {
        logger.failure(`#${i + 1}`, `Supabase: ${updateError.message}`);
        continue;
      }

      classified++;
      logger.success(
        `#${i + 1}`,
        `${category || '?'} | ${result.project || '(aucun projet)'} | ${fromDisplay}`
      );

    } catch (error: any) {
      logger.failure(`#${i + 1}`, error.message || 'Erreur');
    }
  }

  console.log(logger.summary());
  console.log(`  📊 Classifiés : ${classified}/${emails.length}\n`);

  // Rafraîchir la vue matérialisée
  console.log('  📊 Rafraîchissement de mv_email_classification_rules...');
  const { error: refreshError } = await supabase.rpc('refresh_email_classification_rules');
  if (refreshError) {
    console.log('  ⚠️  Rafraîchissement échoué:', refreshError.message);
    console.log('  → Lance manuellement : REFRESH MATERIALIZED VIEW CONCURRENTLY mv_email_classification_rules;');
  } else {
    console.log('  ✅ Vue matérialisée rafraîchie');
  }
}

// ═══════════════════════════════════════════════════════════════
// STATISTIQUES
// ═══════════════════════════════════════════════════════════════

async function printStats() {
  console.log('\n─── STATISTIQUES ───\n');

  // Total ingérés
  const { count: total } = await supabase
    .from('ingested_email_metadata')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', CONFIG.orgId);

  console.log(`  Total emails ingérés : ${total || 0}`);

  // Top 20 domaines
  let domains: any[] | null = null;
  try {
    const res = await supabase
      .rpc('get_top_email_domains', { p_org_id: CONFIG.orgId, p_limit: 20 });
    domains = res.data;
  } catch {
    // RPC function might not exist yet, fallback below
  }

  if (domains) {
    console.log('\n  Top 20 domaines :');
    for (const d of domains) {
      console.log(`    ${d.from_domain.padEnd(35)} ${String(d.nb_emails).padStart(5)} emails`);
    }
  } else {
    // Fallback : requête directe
    const { data: rawDomains } = await supabase
      .from('ingested_email_metadata')
      .select('from_domain')
      .eq('org_id', CONFIG.orgId)
      .not('from_domain', 'is', null);

    if (rawDomains && rawDomains.length > 0) {
      const domainCounts: Record<string, number> = {};
      for (const r of rawDomains) {
        domainCounts[r.from_domain] = (domainCounts[r.from_domain] || 0) + 1;
      }
      const sorted = Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

      console.log('\n  Top 20 domaines :');
      for (const [domain, count] of sorted) {
        console.log(`    ${domain.padEnd(35)} ${String(count).padStart(5)} emails`);
      }
    }
  }

  // Top mots-clés
  const { data: allKeywords } = await supabase
    .from('ingested_email_metadata')
    .select('subject_keywords')
    .eq('org_id', CONFIG.orgId)
    .not('subject_keywords', 'is', null);

  if (allKeywords && allKeywords.length > 0) {
    const kwCounts: Record<string, number> = {};
    for (const row of allKeywords) {
      if (Array.isArray(row.subject_keywords)) {
        for (const kw of row.subject_keywords) {
          kwCounts[kw] = (kwCounts[kw] || 0) + 1;
        }
      }
    }
    const topKw = Object.entries(kwCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);

    console.log('\n  Top 30 mots-clés dans les objets :');
    for (const [kw, count] of topKw) {
      console.log(`    ${kw.padEnd(25)} ${String(count).padStart(5)}x`);
    }
  }

  // Langues
  const { data: allLangs } = await supabase
    .from('ingested_email_metadata')
    .select('language')
    .eq('org_id', CONFIG.orgId);

  if (allLangs && allLangs.length > 0) {
    const langCounts: Record<string, number> = {};
    for (const r of allLangs) {
      langCounts[r.language || 'fr'] = (langCounts[r.language || 'fr'] || 0) + 1;
    }
    console.log('\n  Langues détectées :');
    for (const [lang, count] of Object.entries(langCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${lang.toUpperCase().padEnd(5)} ${String(count).padStart(5)} emails`);
    }
  }

  // Classification (si passe 2 exécutée)
  const { count: classified } = await supabase
    .from('ingested_email_metadata')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', CONFIG.orgId)
    .not('detected_category', 'is', null);

  if (classified && classified > 0) {
    console.log(`\n  Emails classifiés : ${classified}/${total}`);

    const { data: allCats } = await supabase
      .from('ingested_email_metadata')
      .select('detected_category')
      .eq('org_id', CONFIG.orgId)
      .not('detected_category', 'is', null);

    if (allCats) {
      const catCounts: Record<string, number> = {};
      for (const r of allCats) {
        catCounts[r.detected_category] = (catCounts[r.detected_category] || 0) + 1;
      }
      console.log('\n  Catégories :');
      for (const [cat, count] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${cat.padEnd(20)} ${String(count).padStart(5)}x`);
      }
    }
  }

  console.log('\n───────────────────\n');
}
