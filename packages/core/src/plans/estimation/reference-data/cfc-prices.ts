// Prix de référence suisses par code CFC
// Source : CRB 2024/2025, ajustés pour CH moyenne
// À mettre à jour annuellement

export interface CFCReferencePrice {
  cfc_code: string;
  description: string;
  unite: string;
  prix_min: number;
  prix_median: number;
  prix_max: number;
  region_ref: string;
  periode: string;
}

export const CFC_REFERENCE_PRICES: CFCReferencePrice[] = [
  // CFC 1 — Travaux préparatoires
  { cfc_code: '111', description: 'Démolition bâtiment (sans désamiantage)', unite: 'm³', prix_min: 25, prix_median: 40, prix_max: 65, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '112', description: 'Démolition avec tri sélectif', unite: 'm³', prix_min: 45, prix_median: 65, prix_max: 95, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '113', description: 'Désamiantage', unite: 'm²', prix_min: 80, prix_median: 150, prix_max: 300, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '117', description: 'Abattage d\'arbres (diamètre > 30cm)', unite: 'pce', prix_min: 500, prix_median: 1200, prix_max: 3000, region_ref: 'CH moyenne', periode: '2025' },

  // CFC 2 — Gros œuvre : Terrassement
  { cfc_code: '211.1', description: 'Fouilles en pleine masse (terrain meuble)', unite: 'm³', prix_min: 18, prix_median: 28, prix_max: 45, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '211.2', description: 'Fouilles en pleine masse (terrain rocheux)', unite: 'm³', prix_min: 55, prix_median: 85, prix_max: 140, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '211.3', description: 'Fouilles en tranchée', unite: 'm³', prix_min: 25, prix_median: 40, prix_max: 65, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '211.4', description: 'Remblayage compacté', unite: 'm³', prix_min: 15, prix_median: 22, prix_max: 35, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '211.5', description: 'Évacuation de matériaux (décharge)', unite: 'm³', prix_min: 25, prix_median: 45, prix_max: 75, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '211.6', description: 'Étanchéité sous radier (bitumineuse)', unite: 'm²', prix_min: 35, prix_median: 55, prix_max: 80, region_ref: 'CH moyenne', periode: '2025' },

  // CFC 2 — Gros œuvre : Béton
  { cfc_code: '215.0', description: 'Béton non armé C25/30', unite: 'm³', prix_min: 220, prix_median: 280, prix_max: 360, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.1', description: 'Béton armé C30/37 (fourniture + coulage)', unite: 'm³', prix_min: 280, prix_median: 350, prix_max: 450, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.2', description: 'Béton armé C30/37 pompé', unite: 'm³', prix_min: 300, prix_median: 380, prix_max: 480, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.3', description: 'Coffrage plan (dalles)', unite: 'm²', prix_min: 35, prix_median: 50, prix_max: 70, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.4', description: 'Coffrage vertical (voiles, murs)', unite: 'm²', prix_min: 45, prix_median: 65, prix_max: 90, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.5', description: 'Coffrage courbe ou complexe', unite: 'm²', prix_min: 80, prix_median: 120, prix_max: 180, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.6', description: 'Ferraillage standard (fourni posé)', unite: 'kg', prix_min: 2.20, prix_median: 2.80, prix_max: 3.60, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.7', description: 'Treillis soudé (fourni posé)', unite: 'kg', prix_min: 2.00, prix_median: 2.50, prix_max: 3.20, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '216.0', description: 'Maçonnerie bloc béton (20cm)', unite: 'm²', prix_min: 85, prix_median: 120, prix_max: 160, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '216.1', description: 'Maçonnerie brique (paroi simple)', unite: 'm²', prix_min: 95, prix_median: 135, prix_max: 180, region_ref: 'CH moyenne', periode: '2025' },

  // CFC 2 — Enveloppe
  { cfc_code: '221.0', description: 'Fenêtre PVC double vitrage standard', unite: 'm²', prix_min: 450, prix_median: 600, prix_max: 800, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '221.1', description: 'Fenêtre bois-alu triple vitrage', unite: 'm²', prix_min: 700, prix_median: 950, prix_max: 1300, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '221.2', description: 'Porte-fenêtre coulissante (alu)', unite: 'm²', prix_min: 800, prix_median: 1100, prix_max: 1500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '224.0', description: 'Isolation façade EPS (16cm)', unite: 'm²', prix_min: 55, prix_median: 75, prix_max: 100, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '224.1', description: 'Isolation façade laine de roche (16cm)', unite: 'm²', prix_min: 65, prix_median: 90, prix_max: 120, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '225.0', description: 'Crépi extérieur (2 couches)', unite: 'm²', prix_min: 45, prix_median: 65, prix_max: 90, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '225.1', description: 'Façade ventilée (fibrociment)', unite: 'm²', prix_min: 120, prix_median: 180, prix_max: 260, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '227.0', description: 'Étanchéité toiture plate (bitume 2 couches)', unite: 'm²', prix_min: 45, prix_median: 65, prix_max: 90, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '227.1', description: 'Toiture plate végétalisée extensive', unite: 'm²', prix_min: 70, prix_median: 100, prix_max: 140, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '228.0', description: 'Couverture tuiles (terre cuite)', unite: 'm²', prix_min: 80, prix_median: 120, prix_max: 170, region_ref: 'CH moyenne', periode: '2025' },

  // CFC 23 — Électricité
  { cfc_code: '232.0', description: 'Installation électrique (logement standard)', unite: 'm² SBP', prix_min: 80, prix_median: 110, prix_max: 150, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '232.1', description: 'Installation électrique (bureau)', unite: 'm² SBP', prix_min: 100, prix_median: 140, prix_max: 190, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '232.2', description: 'Point lumineux (fourni posé)', unite: 'pce', prix_min: 250, prix_median: 400, prix_max: 650, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '232.3', description: 'Prise courant (fourni posé)', unite: 'pce', prix_min: 120, prix_median: 180, prix_max: 280, region_ref: 'CH moyenne', periode: '2025' },

  // CFC 24 — CVC
  { cfc_code: '241.0', description: 'Chauffage sol (eau chaude, fourni posé)', unite: 'm²', prix_min: 55, prix_median: 80, prix_max: 110, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '242.0', description: 'Ventilation double-flux (logement)', unite: 'm² SBP', prix_min: 50, prix_median: 75, prix_max: 105, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '242.1', description: 'Ventilation double-flux (bureau)', unite: 'm² SBP', prix_min: 65, prix_median: 95, prix_max: 130, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '244.0', description: 'PAC air-eau (fournie posée, 15kW)', unite: 'fft', prix_min: 25000, prix_median: 35000, prix_max: 50000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '244.1', description: 'PAC géothermique (sondes incluses)', unite: 'fft', prix_min: 45000, prix_median: 65000, prix_max: 90000, region_ref: 'CH moyenne', periode: '2025' },

  // CFC 25 — Sanitaire
  { cfc_code: '251.0', description: 'Installation sanitaire (logement standard)', unite: 'm² SBP', prix_min: 55, prix_median: 80, prix_max: 110, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '253.0', description: 'WC suspendu (fourni posé)', unite: 'pce', prix_min: 1200, prix_median: 1800, prix_max: 2800, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '253.1', description: 'Lavabo (fourni posé, standard)', unite: 'pce', prix_min: 800, prix_median: 1200, prix_max: 2000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '253.2', description: 'Douche de plain-pied (fournie posée)', unite: 'pce', prix_min: 2500, prix_median: 4000, prix_max: 6500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '253.3', description: 'Baignoire (fournie posée, standard)', unite: 'pce', prix_min: 2000, prix_median: 3500, prix_max: 5500, region_ref: 'CH moyenne', periode: '2025' },

  // CFC 27 — Aménagements intérieurs
  { cfc_code: '271.0', description: 'Chape ciment (60-80mm)', unite: 'm²', prix_min: 28, prix_median: 40, prix_max: 55, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '271.1', description: 'Chape anhydrite (50-60mm)', unite: 'm²', prix_min: 32, prix_median: 45, prix_max: 60, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '273.0', description: 'Carrelage sol (standard, 30x60)', unite: 'm²', prix_min: 65, prix_median: 95, prix_max: 140, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '273.1', description: 'Carrelage mural (salle de bain)', unite: 'm²', prix_min: 75, prix_median: 110, prix_max: 160, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '274.0', description: 'Parquet chêne (fourni posé)', unite: 'm²', prix_min: 80, prix_median: 120, prix_max: 180, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '275.0', description: 'Peinture intérieure (2 couches, murs)', unite: 'm²', prix_min: 18, prix_median: 28, prix_max: 42, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '276.0', description: 'Plâtre projeté (murs)', unite: 'm²', prix_min: 22, prix_median: 32, prix_max: 45, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '276.1', description: 'Faux-plafond (plaques de plâtre)', unite: 'm²', prix_min: 55, prix_median: 80, prix_max: 110, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '281.0', description: 'Porte intérieure (bois, standard)', unite: 'pce', prix_min: 800, prix_median: 1200, prix_max: 1800, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '281.1', description: 'Porte coupe-feu EI30', unite: 'pce', prix_min: 1500, prix_median: 2200, prix_max: 3200, region_ref: 'CH moyenne', periode: '2025' },
];
