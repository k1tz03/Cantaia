// Coefficients régionaux suisses (base 100 = Zurich)
// et ratios CHF/m² SBP par type de bâtiment

export const REGIONAL_COEFFICIENTS: Record<string, number> = {
  'zurich': 1.00,
  'berne': 0.95,
  'bale': 0.98,
  'geneve': 1.05,
  'vaud': 1.02,
  'lausanne': 1.02,
  'valais': 0.90,
  'fribourg': 0.93,
  'neuchatel': 0.92,
  'tessin': 0.88,
  'lucerne': 0.97,
  'zoug': 0.97,
  'st-gall': 0.92,
  'thurgovie': 0.92,
  'grisons': 0.95,
  'jura': 0.88,
  'argovie': 0.96,
  'soleure': 0.94,
  'schaffhouse': 0.93,
  'appenzell': 0.90,
  'schwyz': 0.97,
  'obwald': 0.93,
  'nidwald': 0.93,
  'uri': 0.92,
  'glaris': 0.90,
};

export const RATIOS_M2_SBP: Record<string, { min: number; median: number; max: number; source: string }> = {
  'logement_collectif_standard': { min: 3200, median: 3800, max: 4800, source: 'CRB 2024' },
  'logement_collectif_standing': { min: 4500, median: 5500, max: 7500, source: 'CRB 2024' },
  'villa_individuelle': { min: 3800, median: 4800, max: 7000, source: 'CRB 2024' },
  'bureau_administratif': { min: 3500, median: 4200, max: 5500, source: 'CRB 2024' },
  'scolaire': { min: 4000, median: 4800, max: 6000, source: 'CRB 2024' },
  'commercial': { min: 2200, median: 3000, max: 4200, source: 'CRB 2024' },
  'industriel_entrepot': { min: 1500, median: 2200, max: 3200, source: 'CRB 2024' },
  'ems_institution': { min: 4500, median: 5500, max: 7000, source: 'CRB 2024' },
  'renovation_lourde': { min: 2500, median: 3500, max: 5500, source: 'CRB 2024' },
};
