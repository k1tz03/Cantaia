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

// ============================================================================
// SIA Phase Calibration Factors
// Tolerances de précision selon la phase du projet (norme SIA)
// ============================================================================
export const SIA_PHASE_FACTORS = {
  esquisse: { label: 'Esquisse (SIA 101)', tolerance: 0.30 },          // ±30%
  avant_projet: { label: 'Avant-projet (SIA 102)', tolerance: 0.15 },  // ±15%
  projet: { label: "Projet d'exécution (SIA 103)", tolerance: 0.10 },  // ±10%
  execution: { label: 'Exécution (SIA 104)', tolerance: 0.05 },        // ±5%
  unknown: { label: 'Phase inconnue', tolerance: 0.25 },               // ±25% default
};

// ============================================================================
// CFC Reference Prices — 300+ entries
// ============================================================================
export const CFC_REFERENCE_PRICES: CFCReferencePrice[] = [

  // ==========================================================================
  // CFC 1 — Travaux préparatoires (15 entries)
  // ==========================================================================
  { cfc_code: '111', description: 'Démolition bâtiment (sans désamiantage)', unite: 'm³', prix_min: 25, prix_median: 40, prix_max: 65, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '112', description: 'Démolition avec tri sélectif', unite: 'm³', prix_min: 45, prix_median: 65, prix_max: 95, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '113.0', description: 'Désamiantage', unite: 'm²', prix_min: 80, prix_median: 150, prix_max: 300, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '113.1', description: 'Terrassement mécanique', unite: 'm³', prix_min: 25, prix_median: 35, prix_max: 45, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '114', description: 'Terrassement manuel', unite: 'm³', prix_min: 80, prix_median: 100, prix_max: 120, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '115', description: 'Évacuation de terre', unite: 'm³', prix_min: 35, prix_median: 45, prix_max: 55, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '116', description: 'Remblayage compacté', unite: 'm³', prix_min: 20, prix_median: 28, prix_max: 35, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '117.0', description: 'Abattage d\'arbres (diamètre > 30cm)', unite: 'pce', prix_min: 500, prix_median: 1200, prix_max: 3000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '117.1', description: 'Soutènement provisoire', unite: 'm²', prix_min: 120, prix_median: 160, prix_max: 200, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '118', description: 'Drainage périphérique', unite: 'ml', prix_min: 45, prix_median: 60, prix_max: 75, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '119', description: 'Assainissement conduites', unite: 'ml', prix_min: 80, prix_median: 115, prix_max: 150, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '121', description: 'Fondations profondes / pieux', unite: 'ml', prix_min: 250, prix_median: 350, prix_max: 450, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '122', description: 'Palplanches', unite: 'm²', prix_min: 150, prix_median: 215, prix_max: 280, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '123', description: 'Injection de sol', unite: 'ml', prix_min: 180, prix_median: 265, prix_max: 350, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '124', description: 'Rabattement nappe phréatique', unite: 'jour', prix_min: 800, prix_median: 1150, prix_max: 1500, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 2 — Gros oeuvre : Terrassement (6 entries)
  // ==========================================================================
  { cfc_code: '211.1', description: 'Fouilles en pleine masse (terrain meuble)', unite: 'm³', prix_min: 18, prix_median: 28, prix_max: 45, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '211.2', description: 'Fouilles en pleine masse (terrain rocheux)', unite: 'm³', prix_min: 55, prix_median: 85, prix_max: 140, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '211.3', description: 'Fouilles en tranchée', unite: 'm³', prix_min: 25, prix_median: 40, prix_max: 65, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '211.4', description: 'Remblayage compacté', unite: 'm³', prix_min: 15, prix_median: 22, prix_max: 35, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '211.5', description: 'Évacuation de matériaux (décharge)', unite: 'm³', prix_min: 25, prix_median: 45, prix_max: 75, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '211.6', description: 'Étanchéité sous radier (bitumineuse)', unite: 'm²', prix_min: 35, prix_median: 55, prix_max: 80, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 2 — Gros oeuvre : Béton (26 entries)
  // ==========================================================================
  { cfc_code: '215.00', description: 'Béton non armé C20/25', unite: 'm³', prix_min: 180, prix_median: 200, prix_max: 220, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.01', description: 'Béton non armé C25/30', unite: 'm³', prix_min: 200, prix_median: 225, prix_max: 250, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.0', description: 'Béton non armé C25/30', unite: 'm³', prix_min: 220, prix_median: 280, prix_max: 360, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.1', description: 'Béton armé C30/37 (fourniture + coulage)', unite: 'm³', prix_min: 280, prix_median: 350, prix_max: 450, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.10', description: 'Béton armé C25/30', unite: 'm³', prix_min: 250, prix_median: 305, prix_max: 360, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.11', description: 'Béton armé C35/45', unite: 'm³', prix_min: 260, prix_median: 290, prix_max: 320, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.12', description: 'Béton armé C40/50', unite: 'm³', prix_min: 300, prix_median: 340, prix_max: 380, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.13', description: 'Béton pompé supplément', unite: 'm³', prix_min: 15, prix_median: 20, prix_max: 25, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.14', description: 'Béton autoplaçant SCC', unite: 'm³', prix_min: 280, prix_median: 315, prix_max: 350, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.15', description: 'Béton fibré BFUP', unite: 'm³', prix_min: 350, prix_median: 425, prix_max: 500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.2', description: 'Béton armé C30/37 pompé', unite: 'm³', prix_min: 300, prix_median: 380, prix_max: 480, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.3', description: 'Coffrage plan (dalles)', unite: 'm²', prix_min: 35, prix_median: 50, prix_max: 70, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.30', description: 'Coffrage standard', unite: 'm²', prix_min: 45, prix_median: 55, prix_max: 65, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.31', description: 'Coffrage apparent', unite: 'm²', prix_min: 70, prix_median: 85, prix_max: 100, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.32', description: 'Coffrage grimpant', unite: 'm²', prix_min: 55, prix_median: 68, prix_max: 80, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.33', description: 'Coffrage glissant', unite: 'm²', prix_min: 60, prix_median: 73, prix_max: 85, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.4', description: 'Coffrage vertical (voiles, murs)', unite: 'm²', prix_min: 45, prix_median: 65, prix_max: 90, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.5', description: 'Coffrage courbe ou complexe', unite: 'm²', prix_min: 80, prix_median: 120, prix_max: 180, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.6', description: 'Ferraillage standard B500B (fourni posé)', unite: 'kg', prix_min: 2.20, prix_median: 2.80, prix_max: 3.60, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.60', description: 'Ferraillage sismique', unite: 'kg', prix_min: 3.0, prix_median: 3.75, prix_max: 4.5, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.7', description: 'Treillis soudé (fourni posé)', unite: 'm²', prix_min: 8, prix_median: 11.5, prix_max: 15, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.71', description: 'Fibres acier', unite: 'kg', prix_min: 4, prix_median: 5, prix_max: 6, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.8', description: 'Joint de dilatation', unite: 'ml', prix_min: 30, prix_median: 45, prix_max: 60, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.9', description: 'Éléments préfabriqués béton', unite: 'm²', prix_min: 150, prix_median: 200, prix_max: 250, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.91', description: 'Prédalle', unite: 'm²', prix_min: 80, prix_median: 100, prix_max: 120, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.92', description: 'Escalier préfabriqué', unite: 'pce', prix_min: 2000, prix_median: 3000, prix_max: 4000, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 2 — Gros oeuvre : Maconnerie (6 entries)
  // ==========================================================================
  { cfc_code: '216.0', description: 'Maçonnerie bloc béton (20cm)', unite: 'm²', prix_min: 85, prix_median: 120, prix_max: 160, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '216.1', description: 'Maçonnerie brique porteur', unite: 'm²', prix_min: 90, prix_median: 110, prix_max: 130, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '216.2', description: 'Maçonnerie brique non-porteur', unite: 'm²', prix_min: 60, prix_median: 75, prix_max: 90, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '216.3', description: 'Maçonnerie blocs béton cellulaire', unite: 'm²', prix_min: 70, prix_median: 85, prix_max: 100, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '216.4', description: 'Maçonnerie pierre naturelle', unite: 'm²', prix_min: 180, prix_median: 265, prix_max: 350, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '216.5', description: 'Maçonnerie brique apparente', unite: 'm²', prix_min: 120, prix_median: 155, prix_max: 190, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 21 — Fenêtres, portes extérieures & fermetures (25 entries)
  // ==========================================================================
  { cfc_code: '221.0', description: 'Fenêtre PVC double vitrage standard', unite: 'm²', prix_min: 350, prix_median: 425, prix_max: 500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '221.01', description: 'Fenêtre PVC triple vitrage', unite: 'm²', prix_min: 450, prix_median: 550, prix_max: 650, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '221.1', description: 'Fenêtre alu double vitrage', unite: 'm²', prix_min: 500, prix_median: 600, prix_max: 700, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '221.11', description: 'Fenêtre alu triple vitrage', unite: 'm²', prix_min: 600, prix_median: 725, prix_max: 850, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '221.2', description: 'Fenêtre bois double vitrage', unite: 'm²', prix_min: 450, prix_median: 550, prix_max: 650, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '221.21', description: 'Fenêtre bois-alu triple vitrage', unite: 'm²', prix_min: 650, prix_median: 800, prix_max: 950, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '221.3', description: 'Porte-fenêtre coulissante (alu)', unite: 'm²', prix_min: 800, prix_median: 1100, prix_max: 1500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '221.4', description: 'Vitrage fixe', unite: 'm²', prix_min: 250, prix_median: 325, prix_max: 400, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '221.5', description: 'Mur-rideau (facade vitrée)', unite: 'm²', prix_min: 600, prix_median: 900, prix_max: 1200, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '221.6', description: 'Verrière', unite: 'm²', prix_min: 800, prix_median: 1150, prix_max: 1500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '222.0', description: "Porte d'entrée standard", unite: 'pce', prix_min: 1500, prix_median: 2250, prix_max: 3000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '222.1', description: "Porte d'entrée sécurisée RC2", unite: 'pce', prix_min: 3000, prix_median: 4500, prix_max: 6000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '222.2', description: 'Porte de garage sectionnelle', unite: 'pce', prix_min: 2000, prix_median: 3000, prix_max: 4000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '222.3', description: 'Porte coulissante extérieure', unite: 'pce', prix_min: 600, prix_median: 900, prix_max: 1200, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '223.0', description: 'Store extérieur', unite: 'm²', prix_min: 200, prix_median: 275, prix_max: 350, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '223.1', description: 'Volet roulant', unite: 'm²', prix_min: 180, prix_median: 240, prix_max: 300, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '223.2', description: 'Store à lamelles (brise-soleil)', unite: 'm²', prix_min: 250, prix_median: 375, prix_max: 500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '223.3', description: 'Volet battant bois', unite: 'm²', prix_min: 200, prix_median: 300, prix_max: 400, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 22 — Enveloppe : Isolation & Façade (12 entries)
  // ==========================================================================
  { cfc_code: '224.0', description: 'Isolation façade EPS (16cm)', unite: 'm²', prix_min: 55, prix_median: 75, prix_max: 100, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '224.1', description: 'Isolation façade laine de roche (16cm)', unite: 'm²', prix_min: 65, prix_median: 90, prix_max: 120, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '224.2', description: 'Isolation façade laine de verre (16cm)', unite: 'm²', prix_min: 55, prix_median: 78, prix_max: 100, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '224.3', description: 'Isolation toiture plate (PUR 20cm)', unite: 'm²', prix_min: 50, prix_median: 70, prix_max: 90, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '224.4', description: 'Isolation toiture inclinée (entre chevrons)', unite: 'm²', prix_min: 40, prix_median: 58, prix_max: 75, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '224.5', description: 'Isolation sol / radier (XPS 12cm)', unite: 'm²', prix_min: 30, prix_median: 43, prix_max: 55, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '224.6', description: 'Isolation acoustique (murs)', unite: 'm²', prix_min: 25, prix_median: 38, prix_max: 50, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '225.0', description: 'Crépi extérieur (2 couches)', unite: 'm²', prix_min: 45, prix_median: 65, prix_max: 90, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '225.1', description: 'Façade ventilée (fibrociment)', unite: 'm²', prix_min: 120, prix_median: 180, prix_max: 260, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '225.2', description: 'Façade ventilée (bois)', unite: 'm²', prix_min: 100, prix_median: 155, prix_max: 210, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '225.3', description: 'Façade ventilée (métal/aluminium)', unite: 'm²', prix_min: 150, prix_median: 225, prix_max: 300, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '225.4', description: 'Bardage composite (HPL)', unite: 'm²', prix_min: 130, prix_median: 190, prix_max: 250, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 22 — Enveloppe : Toiture (10 entries)
  // ==========================================================================
  { cfc_code: '227.0', description: 'Étanchéité toiture plate (bitume 2 couches)', unite: 'm²', prix_min: 45, prix_median: 65, prix_max: 90, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '227.1', description: 'Toiture plate végétalisée extensive', unite: 'm²', prix_min: 70, prix_median: 100, prix_max: 140, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '227.2', description: 'Toiture plate végétalisée intensive', unite: 'm²', prix_min: 120, prix_median: 175, prix_max: 230, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '227.3', description: 'Étanchéité membrane synthétique (PVC/TPO)', unite: 'm²', prix_min: 40, prix_median: 58, prix_max: 75, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '227.4', description: 'Étanchéité EPDM', unite: 'm²', prix_min: 35, prix_median: 50, prix_max: 65, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '228.0', description: 'Couverture tuiles (terre cuite)', unite: 'm²', prix_min: 80, prix_median: 120, prix_max: 170, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '228.1', description: 'Couverture tuiles béton', unite: 'm²', prix_min: 65, prix_median: 95, prix_max: 125, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '228.2', description: 'Couverture ardoise', unite: 'm²', prix_min: 120, prix_median: 175, prix_max: 230, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '228.3', description: 'Couverture bac acier', unite: 'm²', prix_min: 50, prix_median: 73, prix_max: 95, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '228.4', description: 'Couverture zinc / cuivre', unite: 'm²', prix_min: 100, prix_median: 150, prix_max: 200, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 23 — Électricité (30 entries)
  // ==========================================================================
  { cfc_code: '232.0', description: 'Installation électrique (logement standard)', unite: 'm² SBP', prix_min: 80, prix_median: 110, prix_max: 150, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '232.1', description: 'Installation électrique (bureau)', unite: 'm² SBP', prix_min: 100, prix_median: 140, prix_max: 190, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '232.2', description: 'Point lumineux (fourni posé)', unite: 'pce', prix_min: 250, prix_median: 400, prix_max: 650, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '232.3', description: 'Prise courant T13 (fourni posé)', unite: 'pce', prix_min: 40, prix_median: 50, prix_max: 60, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '232.31', description: 'Prise courant T23 (fourni posé)', unite: 'pce', prix_min: 50, prix_median: 60, prix_max: 70, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '232.4', description: 'Interrupteur simple', unite: 'pce', prix_min: 30, prix_median: 40, prix_max: 50, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '232.41', description: 'Interrupteur double', unite: 'pce', prix_min: 45, prix_median: 55, prix_max: 65, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '232.5', description: 'Tableau électrique principal', unite: 'pce', prix_min: 3000, prix_median: 5500, prix_max: 8000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '232.51', description: 'Tableau électrique secondaire', unite: 'pce', prix_min: 1500, prix_median: 2250, prix_max: 3000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '232.6', description: 'Câblage cuivre 3x2.5mm²', unite: 'ml', prix_min: 8, prix_median: 11.5, prix_max: 15, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '232.61', description: 'Câblage cuivre 5x2.5mm²', unite: 'ml', prix_min: 12, prix_median: 16, prix_max: 20, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '232.62', description: 'Chemin de câbles', unite: 'ml', prix_min: 25, prix_median: 37.5, prix_max: 50, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '232.63', description: 'Colonne montante électrique', unite: 'ml', prix_min: 80, prix_median: 115, prix_max: 150, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '233.0', description: 'Éclairage LED encastré', unite: 'pce', prix_min: 80, prix_median: 115, prix_max: 150, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '233.1', description: 'Éclairage LED suspendu', unite: 'pce', prix_min: 150, prix_median: 250, prix_max: 350, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '233.2', description: 'Éclairage extérieur', unite: 'pce', prix_min: 200, prix_median: 350, prix_max: 500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '233.3', description: 'Éclairage de secours', unite: 'pce', prix_min: 100, prix_median: 175, prix_max: 250, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '234.0', description: 'Détecteur de mouvement', unite: 'pce', prix_min: 60, prix_median: 90, prix_max: 120, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '234.1', description: 'Détecteur incendie (optique)', unite: 'pce', prix_min: 50, prix_median: 75, prix_max: 100, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '234.2', description: "Système alarme intrusion", unite: 'pce', prix_min: 3000, prix_median: 5500, prix_max: 8000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '234.3', description: 'Système alarme incendie', unite: 'pce', prix_min: 5000, prix_median: 10000, prix_max: 15000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '234.4', description: 'Interphone / vidéophone', unite: 'pce', prix_min: 500, prix_median: 1000, prix_max: 1500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '235.0', description: 'Réseau informatique cat6 (point)', unite: 'pce', prix_min: 150, prix_median: 200, prix_max: 250, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '235.1', description: 'Fibre optique', unite: 'ml', prix_min: 15, prix_median: 22.5, prix_max: 30, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '235.2', description: 'Réseau Wi-Fi professionnel (point d\'accès)', unite: 'pce', prix_min: 300, prix_median: 500, prix_max: 700, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '236.0', description: 'Paratonnerre', unite: 'fft', prix_min: 3000, prix_median: 5500, prix_max: 8000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '236.1', description: 'Mise à terre', unite: 'fft', prix_min: 1500, prix_median: 2250, prix_max: 3000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '236.2', description: 'Protection surtension', unite: 'pce', prix_min: 200, prix_median: 400, prix_max: 600, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '236.3', description: 'Groupe électrogène', unite: 'pce', prix_min: 8000, prix_median: 17500, prix_max: 27000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '236.4', description: 'Onduleur / UPS', unite: 'pce', prix_min: 1500, prix_median: 4000, prix_max: 6500, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 24 — Chauffage, ventilation, climatisation (25 entries)
  // ==========================================================================
  { cfc_code: '241.0', description: 'Chauffage sol (eau chaude, fourni posé)', unite: 'm²', prix_min: 45, prix_median: 60, prix_max: 75, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '241.1', description: 'Radiateur panneau acier', unite: 'pce', prix_min: 300, prix_median: 450, prix_max: 600, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '241.2', description: 'Conduite chauffage cuivre', unite: 'ml', prix_min: 25, prix_median: 35, prix_max: 45, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '241.3', description: 'Conduite chauffage PE-X', unite: 'ml', prix_min: 15, prix_median: 22.5, prix_max: 30, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '241.4', description: 'Vanne thermostatique', unite: 'pce', prix_min: 40, prix_median: 60, prix_max: 80, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '241.5', description: 'Régulation chauffage (système complet)', unite: 'fft', prix_min: 3000, prix_median: 4500, prix_max: 6000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '242.0', description: 'Ventilation double-flux (logement)', unite: 'm² SBP', prix_min: 40, prix_median: 55, prix_max: 70, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '242.1', description: 'Ventilation double-flux (bureau)', unite: 'm² SBP', prix_min: 65, prix_median: 95, prix_max: 130, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '242.2', description: 'Gaine ventilation (galvanisé)', unite: 'ml', prix_min: 20, prix_median: 30, prix_max: 40, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '242.3', description: 'Bouche VMC (extraction/soufflage)', unite: 'pce', prix_min: 50, prix_median: 75, prix_max: 100, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '242.4', description: 'Caisson ventilation (unité)', unite: 'pce', prix_min: 2000, prix_median: 4000, prix_max: 6000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '242.5', description: 'Désenfumage', unite: 'm²', prix_min: 30, prix_median: 45, prix_max: 60, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '243.0', description: 'Climatisation split (mono)', unite: 'pce', prix_min: 3000, prix_median: 4500, prix_max: 6000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '243.1', description: 'Climatisation VRV/VRF', unite: 'kW', prix_min: 600, prix_median: 800, prix_max: 1000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '243.2', description: 'Refroidissement free-cooling', unite: 'm²', prix_min: 25, prix_median: 40, prix_max: 55, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '244.0', description: 'PAC air-eau (fournie posée, 15kW)', unite: 'pce', prix_min: 15000, prix_median: 20000, prix_max: 25000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '244.1', description: 'PAC sol-eau (géothermique)', unite: 'pce', prix_min: 20000, prix_median: 27500, prix_max: 35000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '244.2', description: 'PAC eau-eau', unite: 'pce', prix_min: 25000, prix_median: 32500, prix_max: 40000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '244.3', description: 'Chaudière gaz condensation', unite: 'pce', prix_min: 8000, prix_median: 11500, prix_max: 15000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '244.4', description: 'Chaudière mazout', unite: 'pce', prix_min: 10000, prix_median: 14000, prix_max: 18000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '244.5', description: 'Chaudière pellets', unite: 'pce', prix_min: 18000, prix_median: 24000, prix_max: 30000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '244.6', description: 'Cheminée inox (conduit)', unite: 'ml', prix_min: 150, prix_median: 225, prix_max: 300, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '245.0', description: 'Ballon ECS 300L', unite: 'pce', prix_min: 2000, prix_median: 3000, prix_max: 4000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '245.1', description: 'Panneaux solaires thermiques', unite: 'm²', prix_min: 400, prix_median: 550, prix_max: 700, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '245.2', description: 'Boiler électrique 80L', unite: 'pce', prix_min: 600, prix_median: 800, prix_max: 1000, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 25 — Installations sanitaires (20 entries)
  // ==========================================================================
  { cfc_code: '251.0', description: 'Installation sanitaire (logement standard)', unite: 'm² SBP', prix_min: 55, prix_median: 80, prix_max: 110, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '251.1', description: 'Roughing-in sanitaire (par point)', unite: 'pce', prix_min: 300, prix_median: 400, prix_max: 500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '253.0', description: 'WC suspendu (fourni posé)', unite: 'pce', prix_min: 500, prix_median: 750, prix_max: 1000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '253.01', description: 'WC au sol (fourni posé)', unite: 'pce', prix_min: 300, prix_median: 450, prix_max: 600, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '253.1', description: 'Lavabo (fourni posé, standard)', unite: 'pce', prix_min: 300, prix_median: 500, prix_max: 700, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '253.2', description: 'Douche de plain-pied (fournie posée)', unite: 'pce', prix_min: 1500, prix_median: 2250, prix_max: 3000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '253.3', description: 'Baignoire (fournie posée, standard)', unite: 'pce', prix_min: 800, prix_median: 1400, prix_max: 2000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '253.4', description: 'Robinetterie standard', unite: 'pce', prix_min: 150, prix_median: 250, prix_max: 350, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '253.5', description: 'Robinetterie thermostatique', unite: 'pce', prix_min: 250, prix_median: 375, prix_max: 500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '254.0', description: 'Conduite eau froide (cuivre/PE)', unite: 'ml', prix_min: 20, prix_median: 27.5, prix_max: 35, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '254.1', description: 'Conduite eau chaude (cuivre/PE)', unite: 'ml', prix_min: 25, prix_median: 32.5, prix_max: 40, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '254.2', description: 'Évacuation PVC (DN 110)', unite: 'ml', prix_min: 15, prix_median: 22.5, prix_max: 30, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '254.3', description: 'Isolation tuyaux sanitaires', unite: 'ml', prix_min: 8, prix_median: 11.5, prix_max: 15, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '254.4', description: 'Colonne sanitaire (montante)', unite: 'ml', prix_min: 60, prix_median: 90, prix_max: 120, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '255.0', description: 'Pompe de relevage', unite: 'pce', prix_min: 800, prix_median: 1150, prix_max: 1500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '255.1', description: "Adoucisseur d'eau", unite: 'pce', prix_min: 1500, prix_median: 2250, prix_max: 3000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '255.2', description: 'Séparateur de graisses', unite: 'pce', prix_min: 2000, prix_median: 3500, prix_max: 5000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '255.3', description: "Séparateur d'hydrocarbures", unite: 'pce', prix_min: 3000, prix_median: 5000, prix_max: 7000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '255.4', description: 'Collecteur eaux pluviales', unite: 'pce', prix_min: 2000, prix_median: 3500, prix_max: 5000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '255.5', description: 'Station de relevage eaux usées', unite: 'pce', prix_min: 3000, prix_median: 5000, prix_max: 7000, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 26 — Installations de transport (ascenseurs, monte-charges) (6 entries)
  // ==========================================================================
  { cfc_code: '261.0', description: 'Ascenseur 4 arrêts (hydraulique)', unite: 'pce', prix_min: 40000, prix_median: 60000, prix_max: 80000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '261.1', description: 'Ascenseur 6 arrêts (à câble)', unite: 'pce', prix_min: 55000, prix_median: 82500, prix_max: 110000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '261.2', description: 'Ascenseur panoramique', unite: 'pce', prix_min: 80000, prix_median: 120000, prix_max: 160000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '262.0', description: 'Monte-charge', unite: 'pce', prix_min: 25000, prix_median: 37500, prix_max: 50000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '263.0', description: 'Escalator', unite: 'pce', prix_min: 80000, prix_median: 130000, prix_max: 180000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '264.0', description: 'Plateforme élévatrice (PMR)', unite: 'pce', prix_min: 15000, prix_median: 25000, prix_max: 35000, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 27 — Aménagements intérieurs (30 entries)
  // ==========================================================================

  // Cloisons
  { cfc_code: '271.0', description: 'Chape ciment (60-80mm)', unite: 'm²', prix_min: 25, prix_median: 32.5, prix_max: 40, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '271.1', description: 'Chape anhydrite (50-60mm)', unite: 'm²', prix_min: 30, prix_median: 37.5, prix_max: 45, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '271.2', description: 'Chape fluide autonivelante', unite: 'm²', prix_min: 35, prix_median: 45, prix_max: 55, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '272.0', description: 'Cloison légère plâtre (simple)', unite: 'm²', prix_min: 60, prix_median: 75, prix_max: 90, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '272.1', description: 'Cloison légère plâtre (double, acoustique)', unite: 'm²', prix_min: 80, prix_median: 100, prix_max: 120, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '272.2', description: 'Cloison vitrée bureau', unite: 'm²', prix_min: 250, prix_median: 350, prix_max: 450, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '272.3', description: 'Cloison mobile / amovible', unite: 'm²', prix_min: 300, prix_median: 450, prix_max: 600, region_ref: 'CH moyenne', periode: '2025' },

  // Plafonds
  { cfc_code: '276.0', description: 'Plâtre projeté (murs)', unite: 'm²', prix_min: 22, prix_median: 32, prix_max: 45, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '276.1', description: 'Faux-plafond plaques de plâtre', unite: 'm²', prix_min: 40, prix_median: 50, prix_max: 60, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '276.2', description: 'Faux-plafond acoustique (dalles minérales)', unite: 'm²', prix_min: 45, prix_median: 57.5, prix_max: 70, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '276.3', description: 'Faux-plafond métal (lattes alu)', unite: 'm²', prix_min: 60, prix_median: 80, prix_max: 100, region_ref: 'CH moyenne', periode: '2025' },

  // Revêtements de sol
  { cfc_code: '273.0', description: 'Carrelage sol (standard, 30x60)', unite: 'm²', prix_min: 60, prix_median: 75, prix_max: 90, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '273.01', description: 'Carrelage sol grand format (60x60+)', unite: 'm²', prix_min: 80, prix_median: 100, prix_max: 120, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '273.1', description: 'Carrelage mural (salle de bain)', unite: 'm²', prix_min: 55, prix_median: 70, prix_max: 85, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '273.2', description: 'Pierre naturelle sol (marbre/granit)', unite: 'm²', prix_min: 120, prix_median: 200, prix_max: 280, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '274.0', description: 'Parquet massif chêne (fourni posé)', unite: 'm²', prix_min: 80, prix_median: 110, prix_max: 140, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '274.1', description: 'Parquet contrecollé', unite: 'm²', prix_min: 50, prix_median: 70, prix_max: 90, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '274.2', description: 'Stratifié', unite: 'm²', prix_min: 30, prix_median: 40, prix_max: 50, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '274.3', description: 'Moquette', unite: 'm²', prix_min: 25, prix_median: 37.5, prix_max: 50, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '274.4', description: 'Résine époxy sol (industriel)', unite: 'm²', prix_min: 60, prix_median: 80, prix_max: 100, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '274.5', description: 'Sol PVC / vinyle', unite: 'm²', prix_min: 30, prix_median: 45, prix_max: 60, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '274.6', description: 'Sol en béton ciré', unite: 'm²', prix_min: 80, prix_median: 120, prix_max: 160, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '274.7', description: 'Linoléum', unite: 'm²', prix_min: 35, prix_median: 50, prix_max: 65, region_ref: 'CH moyenne', periode: '2025' },

  // Peinture & Revêtements muraux
  { cfc_code: '275.0', description: 'Peinture intérieure (2 couches, murs)', unite: 'm²', prix_min: 15, prix_median: 20, prix_max: 25, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '275.1', description: 'Peinture extérieure (façade)', unite: 'm²', prix_min: 20, prix_median: 27.5, prix_max: 35, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '275.2', description: 'Papier peint', unite: 'm²', prix_min: 20, prix_median: 30, prix_max: 40, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '275.3', description: 'Crépi intérieur (décoratif)', unite: 'm²', prix_min: 25, prix_median: 32.5, prix_max: 40, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '275.4', description: 'Peinture anti-humidité (sous-sol)', unite: 'm²', prix_min: 25, prix_median: 35, prix_max: 45, region_ref: 'CH moyenne', periode: '2025' },

  // Menuiserie intérieure
  { cfc_code: '281.0', description: 'Porte intérieure (bois, standard)', unite: 'pce', prix_min: 400, prix_median: 600, prix_max: 800, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '281.1', description: 'Porte coupe-feu EI30', unite: 'pce', prix_min: 800, prix_median: 1150, prix_max: 1500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '281.2', description: 'Porte coupe-feu EI60', unite: 'pce', prix_min: 1200, prix_median: 1700, prix_max: 2200, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '281.3', description: 'Porte coulissante intérieure', unite: 'pce', prix_min: 600, prix_median: 900, prix_max: 1200, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '282.0', description: 'Menuiserie intérieure placards (encastrés)', unite: 'ml', prix_min: 300, prix_median: 450, prix_max: 600, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '282.1', description: 'Cuisine équipée (meubles + plan)', unite: 'ml', prix_min: 800, prix_median: 1400, prix_max: 2000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '283.0', description: 'Main courante inox', unite: 'ml', prix_min: 150, prix_median: 225, prix_max: 300, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '283.1', description: 'Garde-corps verre', unite: 'ml', prix_min: 300, prix_median: 450, prix_max: 600, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '283.2', description: 'Garde-corps métallique', unite: 'ml', prix_min: 200, prix_median: 300, prix_max: 400, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '283.3', description: 'Escalier bois intérieur', unite: 'pce', prix_min: 5000, prix_median: 8500, prix_max: 12000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '283.4', description: 'Escalier métal intérieur', unite: 'pce', prix_min: 6000, prix_median: 11000, prix_max: 16000, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 28 — Appareils, équipements de cuisine (6 entries)
  // ==========================================================================
  { cfc_code: '285.0', description: 'Électroménager cuisine (standard)', unite: 'fft', prix_min: 3000, prix_median: 5000, prix_max: 7000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '285.1', description: 'Four encastrable', unite: 'pce', prix_min: 600, prix_median: 1050, prix_max: 1500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '285.2', description: 'Plaque de cuisson induction', unite: 'pce', prix_min: 500, prix_median: 900, prix_max: 1300, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '285.3', description: 'Lave-vaisselle encastrable', unite: 'pce', prix_min: 400, prix_median: 700, prix_max: 1000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '285.4', description: 'Hotte aspirante', unite: 'pce', prix_min: 300, prix_median: 600, prix_max: 900, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '285.5', description: 'Réfrigérateur encastrable', unite: 'pce', prix_min: 500, prix_median: 900, prix_max: 1300, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 3 — Équipements d'exploitation / Systèmes (20 entries)
  // ==========================================================================

  // Énergie solaire & stockage
  { cfc_code: '311', description: 'Panneaux solaires photovoltaïques', unite: 'kWp', prix_min: 1500, prix_median: 2000, prix_max: 2500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '312', description: 'Onduleur solaire', unite: 'pce', prix_min: 1500, prix_median: 2250, prix_max: 3000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '313', description: 'Batterie de stockage', unite: 'kWh', prix_min: 800, prix_median: 1000, prix_max: 1200, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '314', description: 'Borne de recharge EV', unite: 'pce', prix_min: 1500, prix_median: 2250, prix_max: 3000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '315', description: 'Compteur intelligent (smart meter)', unite: 'pce', prix_min: 300, prix_median: 500, prix_max: 700, region_ref: 'CH moyenne', periode: '2025' },

  // Domotique
  { cfc_code: '331', description: 'Domotique câblée (KNX)', unite: 'm²', prix_min: 30, prix_median: 45, prix_max: 60, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '332', description: 'Domotique sans-fil', unite: 'm²', prix_min: 20, prix_median: 30, prix_max: 40, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '333', description: 'Système de gestion technique du bâtiment (GTB)', unite: 'm²', prix_min: 15, prix_median: 27.5, prix_max: 40, region_ref: 'CH moyenne', periode: '2025' },

  // Sécurité
  { cfc_code: '341', description: 'Système contrôle d\'accès', unite: 'pce', prix_min: 5000, prix_median: 10000, prix_max: 15000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '342', description: 'Vidéosurveillance (système complet)', unite: 'pce', prix_min: 3000, prix_median: 6500, prix_max: 10000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '343', description: 'Caméra de surveillance (unité)', unite: 'pce', prix_min: 300, prix_median: 600, prix_max: 900, region_ref: 'CH moyenne', periode: '2025' },

  // Protection incendie
  { cfc_code: '351', description: 'Système sprinkler', unite: 'm²', prix_min: 30, prix_median: 45, prix_max: 60, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '352', description: 'Détection CO / gaz', unite: 'pce', prix_min: 200, prix_median: 350, prix_max: 500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '353', description: 'Extincteur (fourni posé)', unite: 'pce', prix_min: 80, prix_median: 140, prix_max: 200, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '354', description: 'Porte coupe-feu (avec ferme-porte)', unite: 'pce', prix_min: 1000, prix_median: 1500, prix_max: 2000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '355', description: 'Compartimentage coupe-feu (joints, manchettes)', unite: 'ml', prix_min: 30, prix_median: 55, prix_max: 80, region_ref: 'CH moyenne', periode: '2025' },

  // Divers systèmes
  { cfc_code: '361', description: 'Station de traitement d\'eau', unite: 'pce', prix_min: 5000, prix_median: 12500, prix_max: 20000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '371', description: 'Système de récupération d\'eau de pluie', unite: 'pce', prix_min: 3000, prix_median: 6000, prix_max: 9000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '381', description: 'Système d\'arrosage automatique', unite: 'm²', prix_min: 8, prix_median: 14, prix_max: 20, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 4 — Aménagements extérieurs (15 entries)
  // ==========================================================================

  // Revêtements extérieurs
  { cfc_code: '411', description: 'Parking extérieur enrobé (bitume)', unite: 'm²', prix_min: 60, prix_median: 80, prix_max: 100, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '412', description: 'Parking béton', unite: 'm²', prix_min: 80, prix_median: 105, prix_max: 130, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '413', description: 'Pavés autobloquants', unite: 'm²', prix_min: 50, prix_median: 65, prix_max: 80, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '414', description: 'Chemin piéton (gravier stabilisé)', unite: 'm²', prix_min: 25, prix_median: 40, prix_max: 55, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '415', description: 'Bordures béton', unite: 'ml', prix_min: 20, prix_median: 32.5, prix_max: 45, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '416', description: 'Trottoir enrobé', unite: 'm²', prix_min: 45, prix_median: 62.5, prix_max: 80, region_ref: 'CH moyenne', periode: '2025' },

  // Aménagement paysager
  { cfc_code: '421', description: 'Aménagement paysager (terreau + plantation)', unite: 'm²', prix_min: 30, prix_median: 45, prix_max: 60, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '422', description: 'Gazon semé', unite: 'm²', prix_min: 5, prix_median: 8.5, prix_max: 12, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '423', description: 'Gazon roulé', unite: 'm²', prix_min: 12, prix_median: 16, prix_max: 20, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '424', description: 'Plantation arbres (fourni posé)', unite: 'pce', prix_min: 300, prix_median: 550, prix_max: 800, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '425', description: 'Haie vive (plantation)', unite: 'ml', prix_min: 30, prix_median: 50, prix_max: 70, region_ref: 'CH moyenne', periode: '2025' },

  // Clôtures & murs
  { cfc_code: '431', description: 'Clôture métallique', unite: 'ml', prix_min: 80, prix_median: 115, prix_max: 150, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '432', description: 'Mur de clôture (béton/pierre)', unite: 'ml', prix_min: 200, prix_median: 300, prix_max: 400, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '433', description: 'Portail motorisé', unite: 'pce', prix_min: 3000, prix_median: 5500, prix_max: 8000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '434', description: 'Clôture bois', unite: 'ml', prix_min: 60, prix_median: 90, prix_max: 120, region_ref: 'CH moyenne', periode: '2025' },

  // Éclairage & signalétique
  { cfc_code: '441', description: 'Éclairage extérieur LED (borne)', unite: 'pce', prix_min: 300, prix_median: 450, prix_max: 600, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '442', description: 'Éclairage parking', unite: 'pce', prix_min: 500, prix_median: 750, prix_max: 1000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '443', description: 'Mât d\'éclairage extérieur', unite: 'pce', prix_min: 800, prix_median: 1400, prix_max: 2000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '451', description: 'Signalétique extérieure', unite: 'pce', prix_min: 200, prix_median: 350, prix_max: 500, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 5 — Frais secondaires & honoraires (10 entries)
  // ==========================================================================
  { cfc_code: '511', description: 'Échafaudage de façade', unite: 'm²', prix_min: 15, prix_median: 22.5, prix_max: 30, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '512', description: 'Échafaudage intérieur', unite: 'm²', prix_min: 10, prix_median: 17.5, prix_max: 25, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '513', description: 'Grue à tour (location mensuelle)', unite: 'mois', prix_min: 5000, prix_median: 8500, prix_max: 12000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '514', description: 'Installation de chantier (containers, clôture)', unite: 'fft', prix_min: 8000, prix_median: 17500, prix_max: 27000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '515', description: 'Nettoyage de chantier (final)', unite: 'm²', prix_min: 3, prix_median: 5.5, prix_max: 8, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '516', description: 'Protection des ouvrages existants', unite: 'm²', prix_min: 8, prix_median: 16, prix_max: 24, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '517', description: 'Benne à déchets (location + évacuation)', unite: 'pce', prix_min: 400, prix_median: 650, prix_max: 900, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '518', description: 'Raccordements provisoires (eau, électricité)', unite: 'fft', prix_min: 2000, prix_median: 4000, prix_max: 6000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '519', description: 'Contrôle qualité / essais', unite: 'fft', prix_min: 3000, prix_median: 6000, prix_max: 9000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '520', description: 'Plan de sécurité et santé (SPS)', unite: 'fft', prix_min: 2000, prix_median: 4000, prix_max: 6000, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 29 — Divers aménagements (8 entries)
  // ==========================================================================
  { cfc_code: '291.0', description: 'Signalétique intérieure (bureau)', unite: 'pce', prix_min: 100, prix_median: 200, prix_max: 300, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '291.1', description: 'Boîte aux lettres (encastrée)', unite: 'pce', prix_min: 200, prix_median: 400, prix_max: 600, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '292.0', description: 'Miroir (fourni posé)', unite: 'm²', prix_min: 100, prix_median: 175, prix_max: 250, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '293.0', description: 'Stores intérieurs (lames)', unite: 'm²', prix_min: 50, prix_median: 87.5, prix_max: 125, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '293.1', description: 'Rideaux (fourni posé)', unite: 'ml', prix_min: 80, prix_median: 140, prix_max: 200, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '294.0', description: 'Équipements PMR (WC, barres)', unite: 'fft', prix_min: 2000, prix_median: 3500, prix_max: 5000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '295.0', description: 'Seuils et appuis de fenêtre (pierre)', unite: 'ml', prix_min: 60, prix_median: 100, prix_max: 140, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '295.1', description: 'Seuils et appuis de fenêtre (alu)', unite: 'ml', prix_min: 30, prix_median: 50, prix_max: 70, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 2 — Structure métallique / charpente (10 entries)
  // ==========================================================================
  { cfc_code: '214.0', description: 'Charpente bois (lamellé-collé)', unite: 'm³', prix_min: 800, prix_median: 1100, prix_max: 1400, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '214.1', description: 'Charpente bois (massif)', unite: 'm³', prix_min: 600, prix_median: 850, prix_max: 1100, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '214.2', description: 'Charpente métallique (structure)', unite: 'kg', prix_min: 4, prix_median: 5.5, prix_max: 7, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '214.3', description: 'Charpente métallique (plancher collaborant)', unite: 'm²', prix_min: 80, prix_median: 115, prix_max: 150, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '214.4', description: 'Structure bois (ossature)', unite: 'm²', prix_min: 250, prix_median: 375, prix_max: 500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '214.5', description: 'Panneaux CLT (bois lamellé croisé)', unite: 'm²', prix_min: 200, prix_median: 300, prix_max: 400, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '214.6', description: 'Construction modulaire bois', unite: 'm²', prix_min: 350, prix_median: 500, prix_max: 650, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '214.7', description: 'Poutre HEA/HEB (fournie posée)', unite: 'kg', prix_min: 3.5, prix_median: 5, prix_max: 6.5, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '214.8', description: 'Serrurerie métallique (divers)', unite: 'kg', prix_min: 8, prix_median: 12, prix_max: 16, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '214.9', description: 'Traitement anti-corrosion (galvanisation)', unite: 'm²', prix_min: 15, prix_median: 25, prix_max: 35, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 2 — Étanchéité & imperméabilisation (6 entries)
  // ==========================================================================
  { cfc_code: '219.0', description: 'Étanchéité sous-sol (membrane)', unite: 'm²', prix_min: 40, prix_median: 60, prix_max: 80, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '219.1', description: 'Cuvelage sous-sol (chimique)', unite: 'm²', prix_min: 80, prix_median: 125, prix_max: 170, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '219.2', description: 'Injection étanchéité fissures', unite: 'ml', prix_min: 60, prix_median: 100, prix_max: 140, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '219.3', description: 'Joint waterstop (reprise bétonnage)', unite: 'ml', prix_min: 20, prix_median: 35, prix_max: 50, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '219.4', description: 'Protection drainage (natte à plots)', unite: 'm²', prix_min: 10, prix_median: 17.5, prix_max: 25, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '219.5', description: 'Étanchéité terrasse / balcon', unite: 'm²', prix_min: 50, prix_median: 75, prix_max: 100, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC 4 — Terrassements extérieurs / canalisations (8 entries)
  // ==========================================================================
  { cfc_code: '461', description: 'Canalisation eaux usées (DN 200)', unite: 'ml', prix_min: 80, prix_median: 125, prix_max: 170, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '462', description: 'Canalisation eaux pluviales (DN 200)', unite: 'ml', prix_min: 70, prix_median: 110, prix_max: 150, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '463', description: 'Regard de visite (béton)', unite: 'pce', prix_min: 800, prix_median: 1300, prix_max: 1800, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '464', description: 'Grille de sol (caniveau)', unite: 'ml', prix_min: 100, prix_median: 175, prix_max: 250, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '465', description: 'Bassin de rétention', unite: 'm³', prix_min: 150, prix_median: 275, prix_max: 400, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '466', description: 'Raccordement réseau public (eau)', unite: 'fft', prix_min: 3000, prix_median: 5500, prix_max: 8000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '467', description: 'Raccordement réseau public (eaux usées)', unite: 'fft', prix_min: 4000, prix_median: 7000, prix_max: 10000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '468', description: 'Raccordement réseau public (électricité)', unite: 'fft', prix_min: 3000, prix_median: 6500, prix_max: 10000, region_ref: 'CH moyenne', periode: '2025' },

  // ==========================================================================
  // CFC supplémentaires — Rénovation / transformation (10 entries)
  // ==========================================================================
  { cfc_code: '191.0', description: 'Démontage menuiseries existantes', unite: 'pce', prix_min: 50, prix_median: 100, prix_max: 150, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '191.1', description: 'Démontage installations sanitaires', unite: 'pce', prix_min: 100, prix_median: 200, prix_max: 300, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '191.2', description: 'Démontage revêtement de sol', unite: 'm²', prix_min: 8, prix_median: 16, prix_max: 24, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '191.3', description: 'Démontage faux-plafond', unite: 'm²', prix_min: 5, prix_median: 10, prix_max: 15, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '192.0', description: 'Piquage crépi / plâtre', unite: 'm²', prix_min: 10, prix_median: 17.5, prix_max: 25, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '192.1', description: 'Ouverture dans mur porteur (avec renfort)', unite: 'pce', prix_min: 2000, prix_median: 4000, prix_max: 6000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '192.2', description: 'Renforcement structure béton (fibres carbone)', unite: 'm²', prix_min: 200, prix_median: 350, prix_max: 500, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '193.0', description: 'Diagnostic amiante', unite: 'fft', prix_min: 500, prix_median: 1250, prix_max: 2000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '193.1', description: 'Diagnostic plomb', unite: 'fft', prix_min: 300, prix_median: 650, prix_max: 1000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '193.2', description: 'Diagnostic énergétique (CECB)', unite: 'fft', prix_min: 1000, prix_median: 2000, prix_max: 3000, region_ref: 'CH moyenne', periode: '2025' },
];
