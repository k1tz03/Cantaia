import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });
export const CONFIG = {
  // ═══ CHEMINS DES DONNÉES ═══
  paths: {
    offers: 'C:\\Users\\julien.ray\\data-cantaia\\offres',
    plans: 'C:\\Users\\julien.ray\\data-cantaia\\plans\\priorite-1',
    emails: 'C:\\Users\\julien.ray\\data-cantaia\\emails',
    metrages: 'C:\\Users\\julien.ray\\data-cantaia\\metrages',
    // Dossier pour les fichiers que l'IA n'a pas pu traiter
    failed: 'C:\\Users\\julien.ray\\data-cantaia\\_failed',
    // Dossier pour les fichiers traités avec succès
    processed: 'C:\\Users\\julien.ray\\data-cantaia\\_processed',
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
    model: 'claude-sonnet-4-6',
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

  // ═══ EXTENSIONS À SCANNER ═══
  extensions: {
    offers: ['.msg'], // Les offres arrivent dans des emails .msg
    plans: ['.pdf', '.png', '.jpg', '.jpeg'],
    emails: ['.eml', '.msg'],
    metrages: ['.pdf', '.xlsx', '.xls'],
  },

  // ═══ LIMITES ═══
  limits: {
    maxFileSizeMB: 50,
    maxPagesPerPDF: 100,
    maxTokensPerCall: 8000,
    batchSize: 10, // Traiter 10 fichiers puis pause
    pauseBetweenBatches: 5000, // 5 secondes entre les batches
  },
};
