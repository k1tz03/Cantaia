// ═══════════════════════════════════════════════════════════════
// Cantaia — Productivity ratios for Swiss construction
// Source: CRB 2025 reference values, adjusted for CH average.
//
// RE-KEYED onto the canonical CFC registry (cfc-registry.ts).
// The ratios themselves are unchanged field values; what was wrong was
// the code they hung on — maçonnerie was priced with the steel-frame
// ratio (370 m² of masonry = 1 day!), plâtrerie with the screed ratio,
// and six trades had no entry at all and fell back to a generic guess
// (audit distortion D2).
//
// Canonical mapping highlights:
//   214 = construction BOIS      (was: charpente métallique)
//   215 = construction ACIER     (was: charpente bois)
//   211.5 = maçonnerie           (was: 216)
//   216 = préfabriqué béton      (was: 211.4)
//   224 = couverture             (was: 225)
//   225 = étanchéité             (was: 224 generic)
//   226/227 = crépi / façade ITE (was: 224.3 / 224.1-2)
//   271 = plâtrerie              (was: chapes)
//   281.1 = chapes               (was: 271.x)
//   283 = faux-plafonds          (was: 272)
//   285 = peinture               (unchanged)
// ═══════════════════════════════════════════════════════════════

import { getCfcEntry, cfcFamily } from './cfc-registry';

export interface ProductivityRatio {
  /** Canonical CFC code — MUST exist in CFC_REGISTRY */
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
// CFC 1 / 201 — Travaux préparatoires, terrassement
// ============================================================================

const CFC_1_PREPARATION: ProductivityRatio[] = [
  {
    cfc_code: '111',
    description: 'Deblaiement, defrichement, decapage de la terre vegetale',
    unit: 'm²',
    productivity_per_day: 400,
    team_size_default: 2,
    seasonal_factors: { winter: 0.55, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '112',
    description: 'Demolition / deconstruction — volume bati',
    unit: 'm³',
    productivity_per_day: 25,
    team_size_default: 3,
    seasonal_factors: { winter: 0.70, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '112',
    description: 'Demolition — depose de revetements et cloisons',
    unit: 'm²',
    productivity_per_day: 40,
    team_size_default: 3,
    seasonal_factors: { winter: 0.85, spring: 0.95, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '113',
    description: 'Installations de chantier — montage / demontage',
    unit: 'f',
    productivity_per_day: 0.2,
    team_size_default: 2,
    seasonal_factors: { winter: 0.75, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '116',
    description: 'Evacuation de materiaux — chargement et transport',
    unit: 'm³',
    productivity_per_day: 100,
    team_size_default: 2,
    seasonal_factors: { winter: 0.70, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '117',
    description: 'Travaux speciaux — blindage, palplanches, parois',
    unit: 'm²',
    productivity_per_day: 15,
    team_size_default: 3,
    seasonal_factors: { winter: 0.50, spring: 0.85, summer: 1.00, autumn: 0.80 },
  },
  {
    cfc_code: '117',
    description: 'Fouille en tranchee / travaux speciaux (volume)',
    unit: 'm³',
    productivity_per_day: 45,
    team_size_default: 2,
    seasonal_factors: { winter: 0.55, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '151',
    description: 'Canalisations et drainage — pose de tuyaux',
    unit: 'ml',
    productivity_per_day: 20,
    team_size_default: 3,
    seasonal_factors: { winter: 0.55, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '151',
    description: 'Canalisations et drainage — regards et raccords',
    unit: 'pce',
    productivity_per_day: 3,
    team_size_default: 2,
    seasonal_factors: { winter: 0.55, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '201',
    description: 'Excavation en terrain meuble (pelle mecanique)',
    unit: 'm³',
    productivity_per_day: 120,
    team_size_default: 3,
    seasonal_factors: { winter: 0.60, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '201',
    description: 'Remblayage et compactage par couches',
    unit: 'm²',
    productivity_per_day: 200,
    team_size_default: 2,
    seasonal_factors: { winter: 0.55, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
];

// ============================================================================
// CFC 21 — Gros œuvre 1
// ============================================================================

const CFC_21_GROS_OEUVRE: ProductivityRatio[] = [
  {
    cfc_code: '211.1',
    description: 'Coffrage murs (traditionnel bois / banches)',
    unit: 'm²',
    productivity_per_day: 12,
    team_size_default: 2,
    seasonal_factors: { winter: 0.75, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '211.1',
    description: 'Coffrage dalles (tables coffrantes)',
    unit: 'm³',
    productivity_per_day: 25,
    team_size_default: 3,
    seasonal_factors: { winter: 0.75, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '211.1',
    description: 'Coffrage — escaliers et formes complexes',
    unit: 'pce',
    productivity_per_day: 0.5,
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
    unit: 'm²',
    productivity_per_day: 30,
    team_size_default: 2,
    seasonal_factors: { winter: 0.80, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '211.3',
    description: 'Beton arme — coulage standard (pompe)',
    unit: 'm³',
    productivity_per_day: 30,
    team_size_default: 4,
    seasonal_factors: { winter: 0.60, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '211.3',
    description: 'Beton arme — dalles et voiles (surface developpee)',
    unit: 'm²',
    productivity_per_day: 60,
    team_size_default: 4,
    seasonal_factors: { winter: 0.60, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '211.5',
    description: 'Maconnerie briques / blocs porteurs',
    unit: 'm²',
    productivity_per_day: 8,
    team_size_default: 2,
    seasonal_factors: { winter: 0.65, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '211.5',
    description: 'Maconnerie — briques legeres (cloisons)',
    unit: 'm³',
    productivity_per_day: 3,
    team_size_default: 2,
    seasonal_factors: { winter: 0.85, spring: 0.95, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '211.6',
    description: 'Echafaudage de facade — montage et demontage',
    unit: 'm²',
    productivity_per_day: 120,
    team_size_default: 3,
    seasonal_factors: { winter: 0.70, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '213',
    description: 'Ouvrages en pierre naturelle — pose',
    unit: 'm²',
    productivity_per_day: 4,
    team_size_default: 2,
    seasonal_factors: { winter: 0.60, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '214',
    description: 'Charpente bois — montage toiture / ossature',
    unit: 'm²',
    productivity_per_day: 15,
    team_size_default: 3,
    seasonal_factors: { winter: 0.65, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '214',
    description: 'Charpente bois — poutraison (metre lineaire)',
    unit: 'ml',
    productivity_per_day: 30,
    team_size_default: 3,
    seasonal_factors: { winter: 0.65, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '214',
    description: 'Construction bois — elements prefabriques (pose)',
    unit: 'm³',
    productivity_per_day: 6,
    team_size_default: 3,
    seasonal_factors: { winter: 0.65, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '215',
    description: 'Charpente metallique — montage structure',
    unit: 'kg',
    productivity_per_day: 500,
    team_size_default: 4,
    seasonal_factors: { winter: 0.70, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '215',
    description: 'Construction metallique — poutraison montee',
    unit: 'ml',
    productivity_per_day: 20,
    team_size_default: 4,
    seasonal_factors: { winter: 0.70, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '216',
    description: 'Elements prefabriques en beton — pose',
    unit: 'pce',
    productivity_per_day: 8,
    team_size_default: 3,
    seasonal_factors: { winter: 0.70, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '216',
    description: 'Elements prefabriques en beton — surface posee',
    unit: 'm²',
    productivity_per_day: 80,
    team_size_default: 3,
    seasonal_factors: { winter: 0.70, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
];

// ============================================================================
// CFC 22 — Gros œuvre 2 (clos et couvert)
// ============================================================================

const CFC_22_CLOS_COUVERT: ProductivityRatio[] = [
  {
    cfc_code: '221',
    description: 'Fenetres PVC / alu — pose standard',
    unit: 'pce',
    productivity_per_day: 6,
    team_size_default: 2,
    seasonal_factors: { winter: 0.80, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '221',
    description: 'Fenetres — surface de baie posee',
    unit: 'm²',
    productivity_per_day: 12,
    team_size_default: 2,
    seasonal_factors: { winter: 0.75, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '221',
    description: 'Portes exterieures / portes de garage',
    unit: 'ml',
    productivity_per_day: 8,
    team_size_default: 2,
    seasonal_factors: { winter: 0.80, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '222',
    description: 'Ferblanterie — chenaux, descentes, solins',
    unit: 'ml',
    productivity_per_day: 25,
    team_size_default: 2,
    seasonal_factors: { winter: 0.50, spring: 0.90, summer: 1.00, autumn: 0.80 },
  },
  {
    cfc_code: '223',
    description: 'Protection contre la foudre — conducteurs et prises de terre',
    unit: 'ml',
    productivity_per_day: 30,
    team_size_default: 2,
    seasonal_factors: { winter: 0.60, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '224',
    description: 'Couverture tuiles terre cuite / beton',
    unit: 'm²',
    productivity_per_day: 20,
    team_size_default: 2,
    seasonal_factors: { winter: 0.50, spring: 0.90, summer: 1.00, autumn: 0.80 },
  },
  {
    cfc_code: '224',
    description: 'Couverture — faitage et rives',
    unit: 'ml',
    productivity_per_day: 25,
    team_size_default: 2,
    seasonal_factors: { winter: 0.50, spring: 0.90, summer: 1.00, autumn: 0.80 },
  },
  {
    cfc_code: '225',
    description: 'Etancheite toiture plate (multicouche / synthetique)',
    unit: 'm²',
    productivity_per_day: 30,
    team_size_default: 2,
    seasonal_factors: { winter: 0.35, spring: 0.85, summer: 1.00, autumn: 0.75 },
  },
  {
    cfc_code: '225',
    description: 'Etancheite enterree / isolation perimetrique',
    unit: 'ml',
    productivity_per_day: 20,
    team_size_default: 2,
    seasonal_factors: { winter: 0.45, spring: 0.85, summer: 1.00, autumn: 0.75 },
  },
  {
    cfc_code: '226',
    description: 'Crepi de facade (sur isolation ou maconnerie)',
    unit: 'm²',
    productivity_per_day: 25,
    team_size_default: 2,
    seasonal_factors: { winter: 0.30, spring: 0.80, summer: 1.00, autumn: 0.70 },
  },
  {
    cfc_code: '227',
    description: 'Isolation peripherique EPS / laine minerale (ITE)',
    unit: 'm²',
    productivity_per_day: 15,
    team_size_default: 2,
    seasonal_factors: { winter: 0.40, spring: 0.85, summer: 1.00, autumn: 0.75 },
  },
  {
    cfc_code: '227',
    description: 'Facade ventilee — sous-construction et panneaux',
    unit: 'm³',
    productivity_per_day: 8,
    team_size_default: 3,
    seasonal_factors: { winter: 0.60, spring: 0.90, summer: 1.00, autumn: 0.80 },
  },
  {
    cfc_code: '228',
    description: 'Stores / volets roulants — pose',
    unit: 'pce',
    productivity_per_day: 8,
    team_size_default: 2,
    seasonal_factors: { winter: 0.80, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
];

// ============================================================================
// CFC 23 — Installations électriques
// ============================================================================

const CFC_23_ELECTRICITE: ProductivityRatio[] = [
  {
    cfc_code: '231',
    description: 'Tableaux electriques — montage et cablage',
    unit: 'pce',
    productivity_per_day: 0.5,
    team_size_default: 2,
    seasonal_factors: { winter: 0.95, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '232',
    description: 'Cablage courant fort — tirage de cables',
    unit: 'ml',
    productivity_per_day: 80,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '232',
    description: 'Prises, interrupteurs, boitiers d encastrement',
    unit: 'pce',
    productivity_per_day: 15,
    team_size_default: 1,
    seasonal_factors: { winter: 0.95, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '232',
    description: 'Installations electriques — travaux generaux',
    unit: 'm²',
    productivity_per_day: 5,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '233',
    description: 'Luminaires — pose et raccordement',
    unit: 'pce',
    productivity_per_day: 10,
    team_size_default: 1,
    seasonal_factors: { winter: 0.95, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '235',
    description: 'Courant faible — reseau informatique / telephone',
    unit: 'pce',
    productivity_per_day: 8,
    team_size_default: 1,
    seasonal_factors: { winter: 0.95, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '236',
    description: 'Installations de securite — detection, alarme',
    unit: 'pce',
    productivity_per_day: 6,
    team_size_default: 1,
    seasonal_factors: { winter: 0.95, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
];

// ============================================================================
// CFC 24 — Chauffage, ventilation, climatisation
// ============================================================================

const CFC_24_CVC: ProductivityRatio[] = [
  {
    cfc_code: '241',
    description: 'Production de chaleur — PAC / chaudiere (installation)',
    unit: 'pce',
    productivity_per_day: 0.2,
    team_size_default: 3,
    seasonal_factors: { winter: 0.85, spring: 0.95, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '242',
    description: 'Chauffage au sol — pose tubes et collecteurs',
    unit: 'm²',
    productivity_per_day: 25,
    team_size_default: 2,
    seasonal_factors: { winter: 0.85, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '242',
    description: 'Radiateurs — pose et raccordement',
    unit: 'pce',
    productivity_per_day: 6,
    team_size_default: 2,
    seasonal_factors: { winter: 0.85, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '242',
    description: 'Distribution de chaleur — tuyauterie',
    unit: 'ml',
    productivity_per_day: 30,
    team_size_default: 2,
    seasonal_factors: { winter: 0.85, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '243',
    description: 'Ventilation — gaines et bouches',
    unit: 'ml',
    productivity_per_day: 15,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '243',
    description: 'Ventilation — monobloc / centrale double flux',
    unit: 'pce',
    productivity_per_day: 0.3,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '243',
    description: 'Ventilation — travaux generaux (surface traitee)',
    unit: 'm²',
    productivity_per_day: 20,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '244',
    description: 'Climatisation — splits et raccordements',
    unit: 'pce',
    productivity_per_day: 1,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '245',
    description: 'Installations frigorifiques — groupes et reseaux',
    unit: 'pce',
    productivity_per_day: 0.5,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
];

// ============================================================================
// CFC 25 / 26 — Sanitaire, cuisine, transport
// ============================================================================

const CFC_25_SANITAIRE: ProductivityRatio[] = [
  {
    cfc_code: '251',
    description: 'Appareils sanitaires — pose (lavabo, WC, douche)',
    unit: 'pce',
    productivity_per_day: 3,
    team_size_default: 1,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '253',
    description: 'Tuyauterie eau froide / chaude (cuivre, multicouche)',
    unit: 'ml',
    productivity_per_day: 20,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '253',
    description: 'Conduites sanitaires — travaux generaux (surface)',
    unit: 'm²',
    productivity_per_day: 12,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '253',
    description: 'Canalisations d evacuation EU / EV',
    unit: 'pce',
    productivity_per_day: 4,
    team_size_default: 2,
    seasonal_factors: { winter: 0.85, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '258',
    description: 'Agencement de cuisine — pose complete',
    unit: 'pce',
    productivity_per_day: 0.25,
    team_size_default: 3,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '258',
    description: 'Agencement de cuisine — lineaire pose',
    unit: 'ml',
    productivity_per_day: 2,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '261',
    description: 'Ascenseur — installation complete',
    unit: 'pce',
    productivity_per_day: 0.05,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
];

// ============================================================================
// CFC 27 — Aménagements intérieurs 1
// ============================================================================

const CFC_27_AMENAGEMENTS_1: ProductivityRatio[] = [
  {
    cfc_code: '271',
    description: 'Cloisons placo — ossature + plaques (double face)',
    unit: 'm²',
    productivity_per_day: 12,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '271',
    description: 'Platrerie — enduits interieurs et rebouchage',
    unit: 'ml',
    productivity_per_day: 45,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '272',
    description: 'Serrurerie — garde-corps, mains courantes, escaliers',
    unit: 'ml',
    productivity_per_day: 6,
    team_size_default: 2,
    seasonal_factors: { winter: 0.80, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '272',
    description: 'Serrurerie — elements ponctuels',
    unit: 'pce',
    productivity_per_day: 4,
    team_size_default: 2,
    seasonal_factors: { winter: 0.80, spring: 0.95, summer: 1.00, autumn: 0.90 },
  },
  {
    cfc_code: '273',
    description: 'Portes interieures — pose avec huisseries',
    unit: 'pce',
    productivity_per_day: 5,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '273',
    description: 'Menuiserie interieure — agencements sur mesure',
    unit: 'ml',
    productivity_per_day: 4,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '273',
    description: 'Menuiserie interieure — habillages (surface)',
    unit: 'm²',
    productivity_per_day: 10,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '275',
    description: 'Systeme de verrouillage — cylindres et organigramme',
    unit: 'pce',
    productivity_per_day: 12,
    team_size_default: 1,
    seasonal_factors: { winter: 1.00, spring: 1.00, summer: 1.00, autumn: 1.00 },
  },
  {
    cfc_code: '277',
    description: 'Cloisons systemes / amovibles — montage',
    unit: 'm²',
    productivity_per_day: 18,
    team_size_default: 2,
    seasonal_factors: { winter: 0.95, spring: 1.00, summer: 1.00, autumn: 1.00 },
  },
];

// ============================================================================
// CFC 28 — Aménagements intérieurs 2
// ============================================================================

const CFC_28_AMENAGEMENTS_2: ProductivityRatio[] = [
  {
    cfc_code: '281.1',
    description: 'Chape ciment flottante (epaisseur 6-8 cm)',
    unit: 'm²',
    productivity_per_day: 60,
    team_size_default: 3,
    seasonal_factors: { winter: 0.70, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '281.1',
    description: 'Chape anhydrite / fluide (volume)',
    unit: 'm³',
    productivity_per_day: 8,
    team_size_default: 3,
    seasonal_factors: { winter: 0.65, spring: 0.90, summer: 1.00, autumn: 0.85 },
  },
  {
    cfc_code: '281.2',
    description: 'Carrelage de sol — pose standard (30x60 cm)',
    unit: 'm²',
    productivity_per_day: 10,
    team_size_default: 1,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '281.2',
    description: 'Carrelage — plinthes et finitions',
    unit: 'ml',
    productivity_per_day: 40,
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
    cfc_code: '281.3',
    description: 'Sols souples — lino, moquette (surface)',
    unit: 'm³',
    productivity_per_day: 15,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '282',
    description: 'Carrelage mural / faience salle de bain',
    unit: 'm²',
    productivity_per_day: 8,
    team_size_default: 1,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '283',
    description: 'Faux-plafonds — plaques de platre sur ossature',
    unit: 'm²',
    productivity_per_day: 15,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '285',
    description: 'Peinture interieure — murs (2 couches)',
    unit: 'm²',
    productivity_per_day: 50,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '285',
    description: 'Peinture interieure — lineaire (boiseries, cadres)',
    unit: 'ml',
    productivity_per_day: 60,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '285',
    description: 'Peinture — elements ponctuels',
    unit: 'pce',
    productivity_per_day: 12,
    team_size_default: 2,
    seasonal_factors: { winter: 0.90, spring: 1.00, summer: 1.00, autumn: 0.95 },
  },
  {
    cfc_code: '287',
    description: 'Nettoyage du batiment — nettoyage final',
    unit: 'm²',
    productivity_per_day: 200,
    team_size_default: 2,
    seasonal_factors: { winter: 1.00, spring: 1.00, summer: 1.00, autumn: 1.00 },
  },
];

// ============================================================================
// CFC 4 — Aménagements extérieurs
// ============================================================================

const CFC_4_EXTERIEURS: ProductivityRatio[] = [
  {
    cfc_code: '411',
    description: 'Amenagements exterieurs — revetements, places, acces',
    unit: 'm²',
    productivity_per_day: 30,
    team_size_default: 3,
    seasonal_factors: { winter: 0.50, spring: 0.90, summer: 1.00, autumn: 0.80 },
  },
  {
    cfc_code: '411',
    description: 'Amenagements exterieurs — bordures, clotures, murets',
    unit: 'ml',
    productivity_per_day: 15,
    team_size_default: 2,
    seasonal_factors: { winter: 0.50, spring: 0.90, summer: 1.00, autumn: 0.80 },
  },
  {
    cfc_code: '411',
    description: 'Amenagements exterieurs — elements ponctuels (mobilier)',
    unit: 'pce',
    productivity_per_day: 4,
    team_size_default: 2,
    seasonal_factors: { winter: 0.50, spring: 0.90, summer: 1.00, autumn: 0.80 },
  },
  {
    cfc_code: '421',
    description: 'Jardinage — engazonnement et plantations',
    unit: 'm²',
    productivity_per_day: 120,
    team_size_default: 2,
    seasonal_factors: { winter: 0.30, spring: 1.00, summer: 0.85, autumn: 1.00 },
  },
  {
    cfc_code: '421',
    description: 'Jardinage — arbres et arbustes',
    unit: 'pce',
    productivity_per_day: 10,
    team_size_default: 2,
    seasonal_factors: { winter: 0.30, spring: 1.00, summer: 0.85, autumn: 1.00 },
  },
];

// ============================================================================
// COMBINED REGISTRY
// ============================================================================

export const PRODUCTIVITY_RATIOS: ProductivityRatio[] = [
  ...CFC_1_PREPARATION,
  ...CFC_21_GROS_OEUVRE,
  ...CFC_22_CLOS_COUVERT,
  ...CFC_23_ELECTRICITE,
  ...CFC_24_CVC,
  ...CFC_25_SANITAIRE,
  ...CFC_27_AMENAGEMENTS_1,
  ...CFC_28_AMENAGEMENTS_2,
  ...CFC_4_EXTERIEURS,
];

// ============================================================================
// LOOKUP HELPERS
// ============================================================================

/** Normalize unit strings for comparison (m² / m2 / M2 → "m2") */
function normalizeUnit(u: string): string {
  return u
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Find the best matching productivity ratio for a canonical CFC code and unit.
 * Exact code + unit → exact code → parent code → CFC family.
 */
export function findProductivityRatio(
  cfc_code: string,
  unit?: string,
  _description?: string,
): ProductivityRatio | null {
  if (!cfc_code) return null;

  // 1. Exact CFC code + exact unit
  if (unit) {
    const exactMatch = PRODUCTIVITY_RATIOS.find(
      (r) => r.cfc_code === cfc_code && normalizeUnit(r.unit) === normalizeUnit(unit),
    );
    if (exactMatch) return exactMatch;
  }

  // 2. Exact CFC code (any unit)
  const codeMatches = PRODUCTIVITY_RATIOS.filter((r) => r.cfc_code === cfc_code);
  if (codeMatches.length > 0) return codeMatches[0];

  // 3. Parent code ("211.3.1" → "211.3" → "211")
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

  // 4. CFC family ("211" matches any 211.x)
  const family = cfcFamily(cfc_code);
  const groupMatches = PRODUCTIVITY_RATIOS.filter((r) => cfcFamily(r.cfc_code) === family);
  if (groupMatches.length > 0) {
    if (unit) {
      const unitMatch = groupMatches.find((r) => normalizeUnit(r.unit) === normalizeUnit(unit));
      if (unitMatch) return unitMatch;
    }
    return groupMatches[0];
  }

  return null;
}

/** Season bucket of a 0-indexed month. */
export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

export function seasonOfMonth(month: number): Season {
  if (month >= 11 || month <= 1) return 'winter';   // Dec, Jan, Feb
  if (month >= 2 && month <= 4) return 'spring';    // Mar, Apr, May
  if (month >= 5 && month <= 7) return 'summer';    // Jun, Jul, Aug
  return 'autumn';                                   // Sep, Oct, Nov
}

/** Seasonal factor of a specific ratio for a 0-indexed month. */
export function getSeasonalFactor(ratio: ProductivityRatio, month: number): number {
  return ratio.seasonal_factors[seasonOfMonth(month)];
}

/**
 * Seasonal factor for ANY canonical CFC code — including trades that have no
 * CRB ratio and used to escape seasonality entirely (audit distortion D4).
 * Falls back to the registry's exposure class.
 */
export function getSeasonalFactorForCfc(cfc_code: string | null, month: number): number {
  const season = seasonOfMonth(month);

  if (cfc_code) {
    const ratio = findProductivityRatio(cfc_code);
    if (ratio) return ratio.seasonal_factors[season];

    const entry = getCfcEntry(cfc_code);
    if (entry) return EXPOSURE_SEASONAL_DEFAULTS[entry.exposure][season];
  }

  return EXPOSURE_SEASONAL_DEFAULTS.sheltered[season];
}

/** Seasonal defaults by weather exposure — used when no CRB ratio exists. */
export const EXPOSURE_SEASONAL_DEFAULTS: Record<
  'exterior' | 'sheltered' | 'interior',
  Record<Season, number>
> = {
  exterior: { winter: 0.55, spring: 0.90, summer: 1.00, autumn: 0.82 },
  sheltered: { winter: 0.80, spring: 0.95, summer: 1.00, autumn: 0.92 },
  interior: { winter: 0.92, spring: 1.00, summer: 1.00, autumn: 0.97 },
};
