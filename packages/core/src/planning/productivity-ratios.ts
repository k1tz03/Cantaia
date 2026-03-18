// ═══════════════════════════════════════════════════════════════
// Cantaia Gantt — Productivity Ratios for Swiss Construction
// Source: CRB 2025 reference values, adjusted for CH average
// ═══════════════════════════════════════════════════════════════

export interface ProductivityRatio {
  cfc_code: string;
  description: string;
  unit: string;
  /** Units completed per day by a standard team */
  productivity_per_day: number;
  /** Default team size for this work type */
  team_size_default: number;
  /** Seasonal efficiency factors (1.0 = nominal) */
  seasonal_factors: {
    winter: number;   // Dec-Feb
    spring: number;   // Mar-May
    summer: number;   // Jun-Aug
    autumn: number;   // Sep-Nov
  };
}

// ============================================================================
// CFC 1 — Travaux préparatoires / Terrassement
// ============================================================================

const CFC_1_TERRASSEMENT: ProductivityRatio[] = [
  {
    cfc_code: '113',
    description: 'Terrassement général — excavation en terrain meuble',
    unit: 'm³',
    productivity_per_day: 120,
    team_size_default: 3,
    seasonal_factors: { winter: 0.60, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '113',
    description: 'Terrassement — fouille en tranchée',
    unit: 'm³',
    productivity_per_day: 45,
    team_size_default: 2,
    seasonal_factors: { winter: 0.55, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '114',
    description: 'Remblayage et compactage par couches',
    unit: 'm³',
    productivity_per_day: 80,
    team_size_default: 2,
    seasonal_factors: { winter: 0.55, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '116',
    description: 'Évacuation de matériaux — chargement et transport',
    unit: 'm³',
    productivity_per_day: 100,
    team_size_default: 2,
    seasonal_factors: { winter: 0.70, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
];

// ============================================================================
// CFC 211 — Béton armé
// ============================================================================

const CFC_211_BETON: ProductivityRatio[] = [
  {
    cfc_code: '211.1',
    description: 'Coffrage murs (traditionnel bois)',
    unit: 'm²',
    productivity_per_day: 12,
    team_size_default: 2,
    seasonal_factors: { winter: 0.75, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '211.1',
    description: 'Coffrage dalles (tables coffrantes)',
    unit: 'm²',
    productivity_per_day: 25,
    team_size_default: 3,
    seasonal_factors: { winter: 0.75, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '211.1',
    description: 'Coffrage escaliers / formes complexes',
    unit: 'm²',
    productivity_per_day: 6,
    team_size_default: 2,
    seasonal_factors: { winter: 0.70, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '211.2',
    description: 'Ferraillage — armature courante (dalles, murs)',
    unit: 'kg',
    productivity_per_day: 350,
    team_size_default: 2,
    seasonal_factors: { winter: 0.80, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '211.2',
    description: 'Ferraillage — armature complexe (poutres, colonnes)',
    unit: 'kg',
    productivity_per_day: 200,
    team_size_default: 2,
    seasonal_factors: { winter: 0.80, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '211.3',
    description: 'Béton armé — coulage standard (pompe)',
    unit: 'm³',
    productivity_per_day: 30,
    team_size_default: 4,
    seasonal_factors: { winter: 0.60, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '211.3',
    description: 'Béton armé — coulage fondations',
    unit: 'm³',
    productivity_per_day: 25,
    team_size_default: 4,
    seasonal_factors: { winter: 0.55, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '211.4',
    description: 'Béton armé — éléments préfabriqués (pose)',
    unit: 'pce',
    productivity_per_day: 8,
    team_size_default: 3,
    seasonal_factors: { winter: 0.70, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '211.5',
    description: 'Décoffrage et nettoyage',
    unit: 'm²',
    productivity_per_day: 40,
    team_size_default: 2,
    seasonal_factors: { winter: 0.80, spring: 0.95, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '211',
    description: 'Béton armé — travaux généraux',
    unit: 'm³',
    productivity_per_day: 8,
    team_size_default: 4,
    seasonal_factors: { winter: 0.60, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
];

// ============================================================================
// CFC 214 — Charpente métallique / Construction acier
// ============================================================================

const CFC_214_ACIER: ProductivityRatio[] = [
  {
    cfc_code: '214',
    description: 'Charpente métallique — montage structure',
    unit: 'kg',
    productivity_per_day: 500,
    team_size_default: 4,
    seasonal_factors: { winter: 0.70, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '214',
    description: 'Serrurerie / ouvrages métalliques (garde-corps, escaliers)',
    unit: 'ml',
    productivity_per_day: 6,
    team_size_default: 2,
    seasonal_factors: { winter: 0.80, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
];

// ============================================================================
// CFC 215 — Charpente bois
// ============================================================================

const CFC_215_BOIS: ProductivityRatio[] = [
  {
    cfc_code: '215',
    description: 'Charpente bois — montage toiture',
    unit: 'm²',
    productivity_per_day: 15,
    team_size_default: 3,
    seasonal_factors: { winter: 0.65, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
];

// ============================================================================
// CFC 216 — Maçonnerie
// ============================================================================

const CFC_216_MACONNERIE: ProductivityRatio[] = [
  {
    cfc_code: '216',
    description: 'Maçonnerie briques / blocs standard',
    unit: 'm²',
    productivity_per_day: 8,
    team_size_default: 2,
    seasonal_factors: { winter: 0.65, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '216',
    description: 'Maçonnerie — cloisons intérieures (briques légères)',
    unit: 'm²',
    productivity_per_day: 12,
    team_size_default: 2,
    seasonal_factors: { winter: 0.85, spring: 0.95, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '216',
    description: 'Crépis extérieur',
    unit: 'm²',
    productivity_per_day: 20,
    team_size_default: 2,
    seasonal_factors: { winter: 0.40, spring: 0.85, summer: 1.00, autumn: 0.75 },
  },
];

// ============================================================================
// CFC 221 — Fenêtres et portes extérieures
// ============================================================================

const CFC_221_FENETRES: ProductivityRatio[] = [
  {
    cfc_code: '221.1',
    description: 'Fenêtres PVC/alu — pose standard',
    unit: 'pce',
    productivity_per_day: 6,
    team_size_default: 2,
    seasonal_factors: { winter: 0.80, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '221.1',
    description: 'Fenêtres bois-alu — pose avec étanchéité',
    unit: 'pce',
    productivity_per_day: 4,
    team_size_default: 2,
    seasonal_factors: { winter: 0.75, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '221.2',
    description: 'Portes extérieures (porte d\'entrée, porte de garage)',
    unit: 'pce',
    productivity_per_day: 3,
    team_size_default: 2,
    seasonal_factors: { winter: 0.80, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '221.3',
    description: 'Portes intérieures — pose avec huisseries',
    unit: 'pce',
    productivity_per_day: 5,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '221',
    description: 'Stores / volets roulants — pose',
    unit: 'pce',
    productivity_per_day: 8,
    team_size_default: 2,
    seasonal_factors: { winter: 0.80, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
];

// ============================================================================
// CFC 224 — Façade / Isolation extérieure
// ============================================================================

const CFC_224_FACADE: ProductivityRatio[] = [
  {
    cfc_code: '224.1',
    description: 'Isolation extérieure EPS/laine minérale (ITE)',
    unit: 'm²',
    productivity_per_day: 15,
    team_size_default: 2,
    seasonal_factors: { winter: 0.40, spring: 0.85, summer: 1.00, autumn: 0.75 },
  },
  {
    cfc_code: '224.2',
    description: 'Façade ventilée — pose sous-construction + panneaux',
    unit: 'm²',
    productivity_per_day: 8,
    team_size_default: 3,
    seasonal_factors: { winter: 0.60, spring: 0.90, summer: 1.00, autumn: 0.80 },
  },
  {
    cfc_code: '224.3',
    description: 'Enduit de façade (crépi sur isolation)',
    unit: 'm²',
    productivity_per_day: 25,
    team_size_default: 2,
    seasonal_factors: { winter: 0.30, spring: 0.80, summer: 1.00, autumn: 0.70 },
  },
  {
    cfc_code: '224',
    description: 'Étanchéité toiture plate',
    unit: 'm²',
    productivity_per_day: 30,
    team_size_default: 2,
    seasonal_factors: { winter: 0.35, spring: 0.85, summer: 1.00, autumn: 0.75 },
  },
];

// ============================================================================
// CFC 225 — Couverture / Toiture
// ============================================================================

const CFC_225_TOITURE: ProductivityRatio[] = [
  {
    cfc_code: '225',
    description: 'Couverture tuiles terre cuite / béton',
    unit: 'm²',
    productivity_per_day: 20,
    team_size_default: 2,
    seasonal_factors: { winter: 0.50, spring: 0.90, summer: 1.00, autumn: 0.80 },
  },
];

// ============================================================================
// CFC 232 — Installations électriques
// ============================================================================

const CFC_232_ELECTRICITE: ProductivityRatio[] = [
  {
    cfc_code: '232.1',
    description: 'Tableaux électriques — montage et câblage',
    unit: 'pce',
    productivity_per_day: 0.5,
    team_size_default: 2,
    seasonal_factors: { winter: 0.95, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '232.2',
    description: 'Câblage — tirage de câbles (courant fort)',
    unit: 'ml',
    productivity_per_day: 80,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '232.3',
    description: 'Prises et interrupteurs — pose et raccordement',
    unit: 'pce',
    productivity_per_day: 15,
    team_size_default: 1,
    seasonal_factors: { winter: 0.95, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '232.4',
    description: 'Éclairage — pose luminaires + raccordement',
    unit: 'pce',
    productivity_per_day: 10,
    team_size_default: 1,
    seasonal_factors: { winter: 0.95, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '232.5',
    description: 'Courant faible — réseau informatique / téléphone',
    unit: 'pce',
    productivity_per_day: 8,
    team_size_default: 1,
    seasonal_factors: { winter: 0.95, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '232',
    description: 'Installations électriques — travaux généraux',
    unit: 'm²',
    productivity_per_day: 5,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
];

// ============================================================================
// CFC 242 — Chauffage / Ventilation / Climatisation
// ============================================================================

const CFC_242_CVC: ProductivityRatio[] = [
  {
    cfc_code: '242.1',
    description: 'Chauffage au sol — pose tubes et collecteurs',
    unit: 'm²',
    productivity_per_day: 25,
    team_size_default: 2,
    seasonal_factors: { winter: 0.85, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '242.2',
    description: 'Radiateurs — pose et raccordement',
    unit: 'pce',
    productivity_per_day: 6,
    team_size_default: 2,
    seasonal_factors: { winter: 0.85, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '242.3',
    description: 'Ventilation — gaines et bouches',
    unit: 'ml',
    productivity_per_day: 15,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '242.4',
    description: 'Chaufferie / pompe à chaleur — installation',
    unit: 'pce',
    productivity_per_day: 0.2,
    team_size_default: 3,
    seasonal_factors: { winter: 0.85, spring: 0.95, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '242',
    description: 'CVC — travaux généraux',
    unit: 'm²',
    productivity_per_day: 4,
    team_size_default: 2,
    seasonal_factors: { winter: 0.85, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
];

// ============================================================================
// CFC 251 — Installations sanitaires
// ============================================================================

const CFC_251_SANITAIRE: ProductivityRatio[] = [
  {
    cfc_code: '251.1',
    description: 'Tuyauterie eau froide/chaude — cuivre ou multicouche',
    unit: 'ml',
    productivity_per_day: 20,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '251.2',
    description: 'Appareils sanitaires — pose (lavabo, WC, douche)',
    unit: 'pce',
    productivity_per_day: 3,
    team_size_default: 1,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '251.3',
    description: 'Canalisations évacuation EU/EV',
    unit: 'ml',
    productivity_per_day: 15,
    team_size_default: 2,
    seasonal_factors: { winter: 0.85, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
];

// ============================================================================
// CFC 271 — Chapes
// ============================================================================

const CFC_271_CHAPES: ProductivityRatio[] = [
  {
    cfc_code: '271.1',
    description: 'Chape ciment flottante (épaisseur 6-8 cm)',
    unit: 'm²',
    productivity_per_day: 60,
    team_size_default: 3,
    seasonal_factors: { winter: 0.70, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '271.2',
    description: 'Chape anhydrite / fluide',
    unit: 'm²',
    productivity_per_day: 100,
    team_size_default: 3,
    seasonal_factors: { winter: 0.65, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '271',
    description: 'Isolation sous chape (EPS / XPS)',
    unit: 'm²',
    productivity_per_day: 80,
    team_size_default: 2,
    seasonal_factors: { winter: 0.85, spring: 0.95, summer: 1.00, autumn: 0.95 },
  },
];

// ============================================================================
// CFC 281 — Revêtements de sols
// ============================================================================

const CFC_281_SOLS: ProductivityRatio[] = [
  {
    cfc_code: '281.1',
    description: 'Carrelage sol — pose standard (30×60 cm)',
    unit: 'm²',
    productivity_per_day: 10,
    team_size_default: 1,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '281.2',
    description: 'Carrelage mural — faïence salle de bain',
    unit: 'm²',
    productivity_per_day: 8,
    team_size_default: 1,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '281.3',
    description: 'Parquet — pose flottante',
    unit: 'm²',
    productivity_per_day: 20,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '281.4',
    description: 'Parquet — pose collée',
    unit: 'm²',
    productivity_per_day: 12,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
];

// ============================================================================
// CFC 285 — Peinture / Revêtements muraux
// ============================================================================

const CFC_285_PEINTURE: ProductivityRatio[] = [
  {
    cfc_code: '285.1',
    description: 'Peinture intérieure — murs (2 couches)',
    unit: 'm²',
    productivity_per_day: 50,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '285.2',
    description: 'Peinture intérieure — plafonds (2 couches)',
    unit: 'm²',
    productivity_per_day: 35,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '285.3',
    description: 'Peinture extérieure — façade (avec échafaudage)',
    unit: 'm²',
    productivity_per_day: 25,
    team_size_default: 2,
    seasonal_factors: { winter: 0.30, spring: 0.80, summer: 1.00, autumn: 0.70 },
  },
];

// ============================================================================
// CFC 272 — Faux-plafonds
// ============================================================================

const CFC_272_PLAFONDS: ProductivityRatio[] = [
  {
    cfc_code: '272',
    description: 'Faux-plafonds — plaques de plâtre sur ossature',
    unit: 'm²',
    productivity_per_day: 15,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
];

// ============================================================================
// CFC 273 — Cloisons légères / Plâtrerie sèche
// ============================================================================

const CFC_273_PLATRERIE: ProductivityRatio[] = [
  {
    cfc_code: '273',
    description: 'Cloisons placo — montage ossature + plaques (double face)',
    unit: 'm²',
    productivity_per_day: 12,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
];

// ============================================================================
// CFC 3 — Équipements d'exploitation / Systèmes
// ============================================================================

const CFC_3_SYSTEMES: ProductivityRatio[] = [
  {
    cfc_code: '311',
    description: 'Ascenseur — installation complète',
    unit: 'pce',
    productivity_per_day: 0.05,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '312',
    description: 'Cuisine professionnelle — installation équipements',
    unit: 'pce',
    productivity_per_day: 0.25,
    team_size_default: 3,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
];

// ============================================================================
// COMBINED REGISTRY
// ============================================================================

export const PRODUCTIVITY_RATIOS: ProductivityRatio[] = [
  ...CFC_1_TERRASSEMENT,
  ...CFC_211_BETON,
  ...CFC_214_ACIER,
  ...CFC_215_BOIS,
  ...CFC_216_MACONNERIE,
  ...CFC_221_FENETRES,
  ...CFC_224_FACADE,
  ...CFC_225_TOITURE,
  ...CFC_232_ELECTRICITE,
  ...CFC_242_CVC,
  ...CFC_251_SANITAIRE,
  ...CFC_271_CHAPES,
  ...CFC_272_PLAFONDS,
  ...CFC_273_PLATRERIE,
  ...CFC_281_SOLS,
  ...CFC_285_PEINTURE,
  ...CFC_3_SYSTEMES,
];

// ============================================================================
// LOOKUP HELPERS
// ============================================================================

/**
 * Find the best matching productivity ratio for a given CFC code and unit.
 * Tries exact code match first, then prefix match (e.g. "211.3" matches "211").
 */
export function findProductivityRatio(
  cfc_code: string,
  unit?: string,
  _description?: string,
): ProductivityRatio | null {
  // 1. Exact CFC code + exact unit match
  if (unit) {
    const exactMatch = PRODUCTIVITY_RATIOS.find(
      (r) => r.cfc_code === cfc_code && normalizeUnit(r.unit) === normalizeUnit(unit),
    );
    if (exactMatch) return exactMatch;
  }

  // 2. Exact CFC code (any unit)
  const codeMatches = PRODUCTIVITY_RATIOS.filter((r) => r.cfc_code === cfc_code);
  if (codeMatches.length > 0) {
    // If unit provided, try to find closest match
    if (unit) {
      const unitMatch = codeMatches.find((r) => normalizeUnit(r.unit) === normalizeUnit(unit));
      if (unitMatch) return unitMatch;
    }
    return codeMatches[0];
  }

  // 3. Prefix match (e.g. "211.3" → "211", or "232.2.1" → "232.2" → "232")
  const codeParts = cfc_code.split('.');
  for (let i = codeParts.length - 1; i >= 1; i--) {
    const prefix = codeParts.slice(0, i).join('.');
    const prefixMatches = PRODUCTIVITY_RATIOS.filter((r) => r.cfc_code === prefix);
    if (prefixMatches.length > 0) {
      if (unit) {
        const unitMatch = prefixMatches.find((r) => normalizeUnit(r.unit) === normalizeUnit(unit));
        if (unitMatch) return unitMatch;
      }
      return prefixMatches[0];
    }
  }

  // 4. Major CFC group match (first 1-3 digits)
  const majorCode = cfc_code.replace(/\..*/g, '');
  const groupMatches = PRODUCTIVITY_RATIOS.filter((r) =>
    r.cfc_code.replace(/\..*/g, '') === majorCode,
  );
  if (groupMatches.length > 0) {
    if (unit) {
      const unitMatch = groupMatches.find((r) => normalizeUnit(r.unit) === normalizeUnit(unit));
      if (unitMatch) return unitMatch;
    }
    return groupMatches[0];
  }

  return null;
}

/**
 * Get the seasonal factor for a given month (0-indexed: 0=January, 11=December).
 */
export function getSeasonalFactor(ratio: ProductivityRatio, month: number): number {
  if (month >= 11 || month <= 1) return ratio.seasonal_factors.winter;  // Dec, Jan, Feb
  if (month >= 2 && month <= 4) return ratio.seasonal_factors.spring;   // Mar, Apr, May
  if (month >= 5 && month <= 7) return ratio.seasonal_factors.summer;   // Jun, Jul, Aug
  return ratio.seasonal_factors.autumn;                                  // Sep, Oct, Nov
}

/** Normalize unit strings for comparison (m² / m2 / M2 → "m2") */
function normalizeUnit(u: string): string {
  return u
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\s+/g, '')
    .trim();
}
