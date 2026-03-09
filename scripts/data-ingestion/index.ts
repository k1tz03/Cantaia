import { CONFIG } from './config';
import { ingestOffers } from './pipelines/ingest-offers';
import { ingestPlans } from './pipelines/ingest-plans';
import { ingestEmails, classifyEmails } from './pipelines/ingest-emails';
import { ingestMetrages } from './pipelines/ingest-metrage';
import { supabase } from './utils/db';

async function main() {
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║  CANTAIA — Ingestion Données Historiques  ║');
  console.log('╚═══════════════════════════════════════════╝\n');
  console.log(`Organisation : ${CONFIG.orgId}`);
  console.log(`Région par défaut : ${CONFIG.defaultRegion}`);
  console.log(`Anonymisation : ${CONFIG.anonymize.enabled ? 'ACTIVÉE' : 'DÉSACTIVÉE'}`);
  console.log(`Max appels parallèles : ${CONFIG.anthropic.maxConcurrent}`);
  console.log('');

  // Vérifier la connexion Supabase
  const { error: pingError } = await supabase.from('users').select('id').limit(1);
  if (pingError) {
    console.error('❌ Impossible de se connecter à Supabase:', pingError.message);
    console.error('   Vérifie SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env');
    process.exit(1);
  }
  console.log('✅ Connexion Supabase OK\n');

  const startTime = Date.now();

  // Parse les arguments pour lancer un pipeline spécifique
  const args = process.argv.slice(2);
  const runAll = args.length === 0;
  const runOffers = runAll || args.includes('--offers');
  const runPlans = args.includes('--plans');
  const runEmails = args.includes('--emails');
  const runEmailsClassify = args.includes('--emails-classify');
  const runMetrages = args.includes('--metrages');

  // ═══ ÉTAPE 1 : OFFRES FOURNISSEURS (PRIORITÉ MAXIMALE) ═══
  if (runOffers) {
    await ingestOffers();
  }

  // ═══ ÉTAPE 2 : MÉTRÉS / DESCRIPTIFS ═══
  if (runMetrages) {
    await ingestMetrages();
  }

  // ═══ ÉTAPE 3 : PLANS ═══
  if (runPlans) {
    await ingestPlans();
  }

  // ═══ ÉTAPE 4 : EMAILS (Passe 1 — parsing local, gratuit) ═══
  if (runEmails) {
    await ingestEmails();
  }

  // ═══ ÉTAPE 5 : CLASSIFICATION EMAILS (Passe 2 — Claude, ~$2-3) ═══
  if (runEmailsClassify) {
    await classifyEmails(500);
  }

  // ═══ RAFRAÎCHIR LES VUES ═══
  if (runOffers || runMetrages) {
    console.log('\n📊 Rafraîchissement des vues matérialisées...');
    const { error: rpcError } = await supabase.rpc('refresh_reference_prices');
    if (rpcError) {
      console.log('  ⚠️  Rafraîchissement échoué (table peut-être vide):', rpcError.message);
      console.log('  → Lance manuellement : SELECT refresh_reference_prices();');
    } else {
      console.log('  ✅ Vue mv_reference_prices rafraîchie');
    }
  }

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
