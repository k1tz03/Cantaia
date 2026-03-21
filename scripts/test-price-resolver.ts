// Test du price-resolver avec les données ingérées (mv_reference_prices + ingested_offer_lines)
// Usage: npx tsx scripts/test-price-resolver.ts

import { createClient } from '@supabase/supabase-js';
import { resolvePrice } from '../packages/core/src/plans/estimation/price-resolver';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('Run with: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/test-price-resolver.ts');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TEST_CASES = [
  { cfc_code: '421.0', description: 'Peinture intérieure', unite: 'm²' },
  { cfc_code: '211.0', description: 'Fouilles en pleine masse', unite: 'm³' },
  { cfc_code: '215.0', description: 'Béton non armé', unite: 'm³' },
  { cfc_code: '227.0', description: 'Étanchéité toiture plate', unite: 'm²' },
  { cfc_code: '271.0', description: 'Chape ciment', unite: 'm²' },
];

async function main() {
  console.log('=== Test Price Resolver — Données ingérées ===\n');

  // Vérifier la vue matérialisée
  const { data: mvCount, error: mvErr } = await supabase
    .from('mv_reference_prices')
    .select('cfc_code', { count: 'exact', head: true });

  if (mvErr) {
    console.error('mv_reference_prices inaccessible:', mvErr.message);
  } else {
    console.log(`mv_reference_prices: accessible\n`);
  }

  // Vérifier ingested_offer_lines
  const { count: iolCount, error: iolErr } = await supabase
    .from('ingested_offer_lines')
    .select('*', { count: 'exact', head: true });

  if (iolErr) {
    console.error('ingested_offer_lines inaccessible:', iolErr.message);
  } else {
    console.log(`ingested_offer_lines: ${iolCount} lignes\n`);
  }

  console.log('--- Résolution de prix ---\n');

  for (const tc of TEST_CASES) {
    try {
      const result = await resolvePrice({
        cfc_code: tc.cfc_code,
        description: tc.description,
        unite: tc.unite,
        region: 'vaud',
        quarter: '2026-Q1',
        org_id: '00000000-0000-0000-0000-000000000000', // test org
        supabase,
      });

      console.log(`CFC ${tc.cfc_code} — ${tc.description}`);
      console.log(`  Source     : ${result.source}`);
      console.log(`  Min        : ${result.min !== null ? result.min + ' CHF' : '—'}`);
      console.log(`  Médian     : ${result.median !== null ? result.median + ' CHF' : '—'}`);
      console.log(`  Max        : ${result.max !== null ? result.max + ' CHF' : '—'}`);
      console.log(`  Détail     : ${result.detail_source}`);
      if (result.ajustements.length > 0) {
        console.log(`  Ajustements: ${result.ajustements.join(', ')}`);
      }
      console.log('');
    } catch (err: any) {
      console.error(`CFC ${tc.cfc_code} — ERREUR: ${err.message}\n`);
    }
  }

  console.log('=== Test terminé ===');
}

main().catch(console.error);
