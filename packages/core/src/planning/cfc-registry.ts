// ═══════════════════════════════════════════════════════════════
// Cantaia — CFC Registry (SINGLE SOURCE OF TRUTH)
//
// Swiss CFC / BKP classification (SN 506 500 "Code des frais de
// construction"). Every other planning module (productivity ratios,
// dependency rules, submission analysis prompt) MUST key on the codes
// declared here — this file exists to kill the "two incompatible CFC
// vocabularies" problem (audit distortion D2).
//
// Canonical codes follow the real CRB/BKP numbering:
//   214 = construction en BOIS       (NOT charpente métallique)
//   215 = construction en ACIER
//   216 = préfabriqué BÉTON          (NOT maçonnerie — maçonnerie = 211.5)
//   271 = PLÂTRERIE                  (NOT chapes — chapes = 281.1)
//   272 = serrurerie / ouvrages métalliques
//   273 = menuiserie intérieure
//   283 = faux-plafonds
//   285 = peinture intérieure
//   287 = nettoyage du bâtiment
//   261 = ascenseurs
// ═══════════════════════════════════════════════════════════════

// ============================================================================
// Types
// ============================================================================

/** SIA-style construction phase (execution phases only, not study phases). */
export type SiaPhaseKey =
  | 'preparation'
  | 'gros_oeuvre'
  | 'clos_couvert'
  | 'technique'
  | 'finitions'
  | 'exterieurs'
  | 'divers';

/** Weather exposure — drives seasonality and the intemperie buffer. */
export type CfcExposure = 'exterior' | 'sheltered' | 'interior';

export interface CfcEntry {
  /** Canonical CFC code (2-3 digits, optionally one sub-level: "211.3") */
  code: string;
  /** French label (CRB wording) */
  label: string;
  /** Execution phase this trade belongs to */
  phase: SiaPhaseKey;
  /** Canonical material group — used as the generated task name */
  group: string;
  /** Weather exposure */
  exposure: CfcExposure;
  /** Free-text keywords used by resolveCfc() when no numeric code is given */
  keywords: string[];
}

export interface SiaPhaseDefinition {
  key: SiaPhaseKey;
  name: string;
  color: string;
  order: number;
}

export type CfcMatchKind = 'exact' | 'alias' | 'sub' | 'prefix' | 'keyword' | 'unresolved';

export interface CfcResolution {
  /** Canonical code, or null when nothing matched */
  code: string | null;
  entry: CfcEntry | null;
  kind: CfcMatchKind;
  /** Raw input, kept for logging */
  input: string | null;
}

// ============================================================================
// Phases
// ============================================================================

export const SIA_PHASE_DEFS: SiaPhaseDefinition[] = [
  { key: 'preparation', name: 'Preparation du terrain', color: '#8B5CF6', order: 1 },
  { key: 'gros_oeuvre', name: 'Gros oeuvre', color: '#3B82F6', order: 2 },
  { key: 'clos_couvert', name: 'Clos et couvert', color: '#10B981', order: 3 },
  { key: 'technique', name: 'Second oeuvre — techniques', color: '#F59E0B', order: 4 },
  { key: 'finitions', name: 'Finitions', color: '#EF4444', order: 5 },
  { key: 'exterieurs', name: 'Amenagements exterieurs', color: '#06B6D4', order: 6 },
  { key: 'divers', name: 'Divers', color: '#6B7280', order: 7 },
];

export function getPhaseDef(key: SiaPhaseKey): SiaPhaseDefinition {
  return SIA_PHASE_DEFS.find((p) => p.key === key) ?? SIA_PHASE_DEFS[SIA_PHASE_DEFS.length - 1];
}

export function getPhaseOrder(key: SiaPhaseKey): number {
  return getPhaseDef(key).order;
}

// ============================================================================
// Registry
// ============================================================================

export const CFC_REGISTRY: CfcEntry[] = [
  // ── CFC 1 — Travaux préparatoires ────────────────────────────────────────
  {
    code: '111', label: 'Deblaiement, defrichement', phase: 'preparation',
    group: 'Terrassement', exposure: 'exterior',
    keywords: ['deblaiement', 'defrichement', 'abattage', 'raclage', 'decapage'],
  },
  {
    code: '112', label: 'Demolition, deconstruction', phase: 'preparation',
    group: 'Demolition', exposure: 'exterior',
    keywords: ['demolition', 'deconstruction', 'abbruch', 'curage', 'depose'],
  },
  {
    code: '113', label: 'Installations de chantier', phase: 'preparation',
    group: 'Installations de chantier', exposure: 'exterior',
    keywords: ['installation de chantier', 'installations de chantier', 'baustelleneinrichtung', 'cloture chantier', 'baraque'],
  },
  {
    code: '116', label: 'Evacuation de materiaux, decharge', phase: 'preparation',
    group: 'Terrassement', exposure: 'exterior',
    keywords: ['evacuation', 'decharge', 'transport materiaux', 'mise en decharge'],
  },
  {
    code: '117', label: 'Travaux speciaux (blindage, palplanches, ancrages)', phase: 'preparation',
    group: 'Terrassement', exposure: 'exterior',
    keywords: ['blindage', 'palplanche', 'paroi berlinoise', 'ancrage', 'travaux speciaux', 'spezialtiefbau', 'fouille en tranchee'],
  },
  {
    code: '151', label: 'Canalisations, drainage, raccordements', phase: 'preparation',
    group: 'Canalisations', exposure: 'exterior',
    keywords: ['canalisation', 'drainage', 'raccordement', 'regard', 'collecteur', 'kanalisation'],
  },
  {
    code: '201', label: 'Excavation, terrassement du batiment', phase: 'preparation',
    group: 'Terrassement', exposure: 'exterior',
    keywords: ['excavation', 'terrassement', 'aushub', 'fouille', 'remblai', 'remblayage', 'compactage'],
  },

  // ── CFC 21 — Gros œuvre 1 ────────────────────────────────────────────────
  {
    code: '211', label: "Travaux de l'entreprise de maconnerie (gros oeuvre)", phase: 'gros_oeuvre',
    group: 'Beton arme', exposure: 'exterior',
    keywords: ['gros oeuvre', 'entreprise de maconnerie', 'baumeisterarbeiten', 'ouvrage beton'],
  },
  {
    code: '211.1', label: 'Coffrage', phase: 'gros_oeuvre',
    group: 'Coffrage', exposure: 'exterior',
    keywords: ['coffrage', 'schalung', 'banche', 'decoffrage', 'table coffrante'],
  },
  {
    code: '211.2', label: 'Ferraillage, armature', phase: 'gros_oeuvre',
    group: 'Ferraillage', exposure: 'exterior',
    keywords: ['ferraillage', 'armature', 'acier d armature', 'bewehrung', 'treillis'],
  },
  {
    code: '211.3', label: 'Beton et beton arme (fourniture et coulage)', phase: 'gros_oeuvre',
    group: 'Beton arme', exposure: 'exterior',
    keywords: ['beton arme', 'beton', 'coulage', 'dalle beton', 'radier', 'voile beton', 'fondation'],
  },
  {
    code: '211.5', label: 'Maconnerie (briques, blocs)', phase: 'gros_oeuvre',
    group: 'Maconnerie', exposure: 'exterior',
    keywords: ['maconnerie', 'brique', 'bloc ciment', 'mauerwerk', 'parpaing', 'agglo'],
  },
  {
    code: '211.6', label: 'Echafaudages', phase: 'gros_oeuvre',
    group: 'Echafaudages', exposure: 'exterior',
    keywords: ['echafaudage', 'geruest', 'gerust'],
  },
  {
    code: '213', label: 'Ouvrages en pierre naturelle', phase: 'gros_oeuvre',
    group: 'Pierre naturelle', exposure: 'exterior',
    keywords: ['pierre naturelle', 'naturstein', 'taille de pierre'],
  },
  {
    code: '214', label: 'Construction en bois (charpente, ossature)', phase: 'gros_oeuvre',
    group: 'Charpente bois', exposure: 'exterior',
    keywords: ['charpente bois', 'charpente', 'ossature bois', 'holzbau', 'montagebau in holz', 'lamelle colle'],
  },
  {
    code: '215', label: 'Construction en acier (charpente metallique)', phase: 'gros_oeuvre',
    group: 'Construction metallique', exposure: 'exterior',
    keywords: ['charpente metallique', 'construction metallique', 'stahlbau', 'profile acier', 'poutre acier'],
  },
  {
    code: '216', label: 'Elements prefabriques en beton', phase: 'gros_oeuvre',
    group: 'Prefabrique beton', exposure: 'exterior',
    keywords: ['prefabrique', 'prefabrication', 'element prefabrique', 'vorfabriziert', 'predalle'],
  },

  // ── CFC 22 — Gros œuvre 2 (clos et couvert) ──────────────────────────────
  {
    code: '221', label: 'Fenetres, portes exterieures', phase: 'clos_couvert',
    group: 'Fenetres/Portes ext.', exposure: 'sheltered',
    keywords: ['fenetre', 'porte exterieure', 'porte d entree', 'porte de garage', 'fenster', 'vitrage'],
  },
  {
    code: '222', label: 'Ferblanterie, zinguerie', phase: 'clos_couvert',
    group: 'Ferblanterie', exposure: 'exterior',
    keywords: ['ferblanterie', 'zinguerie', 'spengler', 'chenaux', 'gouttiere', 'descente eaux pluviales'],
  },
  {
    code: '223', label: 'Protection contre la foudre', phase: 'clos_couvert',
    group: 'Paratonnerre', exposure: 'exterior',
    keywords: ['paratonnerre', 'protection foudre', 'blitzschutz'],
  },
  {
    code: '224', label: 'Couverture, toiture', phase: 'clos_couvert',
    group: 'Toiture', exposure: 'exterior',
    keywords: ['couverture', 'toiture', 'tuile', 'bedachung', 'sous-toiture'],
  },
  {
    code: '225', label: 'Etancheite et isolations speciales', phase: 'clos_couvert',
    group: 'Etancheite', exposure: 'exterior',
    keywords: ['etancheite', 'abdichtung', 'toiture plate', 'membrane', 'impermeabilisation', 'barriere vapeur'],
  },
  {
    code: '226', label: 'Crepissage de facade', phase: 'clos_couvert',
    group: 'Facades', exposure: 'exterior',
    keywords: ['crepi', 'crepissage', 'enduit de facade', 'fassadenputz'],
  },
  {
    code: '227', label: 'Revetement de facade, isolation peripherique (ITE)', phase: 'clos_couvert',
    group: 'Facades', exposure: 'exterior',
    keywords: ['facade', 'revetement de facade', 'isolation exterieure', 'ite', 'isolation periphique', 'isolation peripherique', 'facade ventilee', 'bardage', 'isolation thermique'],
  },
  {
    code: '228', label: 'Stores, protections solaires', phase: 'clos_couvert',
    group: 'Stores', exposure: 'sheltered',
    keywords: ['store', 'volet roulant', 'protection solaire', 'sonnenschutz', 'brise-soleil'],
  },

  // ── CFC 23 — Installations électriques ───────────────────────────────────
  {
    code: '231', label: 'Appareillage a courant fort', phase: 'technique',
    group: 'Electricite', exposure: 'interior',
    keywords: ['tableau electrique', 'courant fort', 'appareillage electrique', 'disjoncteur', 'coffret'],
  },
  {
    code: '232', label: 'Installations a courant fort (encastrements, cablage)', phase: 'technique',
    group: 'Electricite', exposure: 'interior',
    keywords: ['electricite', 'installation electrique', 'cablage', 'encastrement', 'tubage', 'prise', 'interrupteur', 'elektro'],
  },
  {
    code: '233', label: 'Lustrerie, luminaires', phase: 'finitions',
    group: 'Electricite', exposure: 'interior',
    keywords: ['luminaire', 'lustrerie', 'eclairage', 'leuchten', 'spot'],
  },
  {
    code: '235', label: 'Installations a courant faible (communication, multimedia)', phase: 'technique',
    group: 'Electricite', exposure: 'interior',
    keywords: ['courant faible', 'telephone', 'reseau informatique', 'multimedia', 'schwachstrom', 'rj45'],
  },
  {
    code: '236', label: 'Installations de securite (detection, alarme)', phase: 'technique',
    group: 'Electricite', exposure: 'interior',
    keywords: ['detection incendie', 'alarme', 'securite', 'sicherheitsanlage', 'controle d acces'],
  },

  // ── CFC 24 — Chauffage, ventilation, climatisation ───────────────────────
  {
    code: '241', label: 'Production de chaleur (PAC, chaudiere)', phase: 'technique',
    group: 'Chauffage', exposure: 'interior',
    keywords: ['pompe a chaleur', 'pac', 'chaudiere', 'production de chaleur', 'chaufferie', 'waermeerzeugung', 'sonde geothermique'],
  },
  {
    code: '242', label: 'Distribution de chaleur (chauffage au sol, radiateurs)', phase: 'technique',
    group: 'Chauffage', exposure: 'interior',
    keywords: ['chauffage au sol', 'radiateur', 'distribution de chaleur', 'collecteur chauffage', 'heizung', 'chauffage'],
  },
  {
    code: '243', label: 'Installations de ventilation', phase: 'technique',
    group: 'Ventilation', exposure: 'interior',
    keywords: ['ventilation', 'gaine', 'monobloc', 'lueftung', 'luftung', 'vmc', 'bouche de ventilation'],
  },
  {
    code: '244', label: 'Installations de climatisation', phase: 'technique',
    group: 'Ventilation', exposure: 'interior',
    keywords: ['climatisation', 'clim', 'klimaanlage'],
  },
  {
    code: '245', label: 'Installations frigorifiques', phase: 'technique',
    group: 'Ventilation', exposure: 'interior',
    keywords: ['froid', 'frigorifique', 'kaelteanlage', 'chambre froide'],
  },

  // ── CFC 25 — Installations sanitaires ────────────────────────────────────
  {
    code: '251', label: 'Appareils sanitaires', phase: 'finitions',
    group: 'Sanitaire', exposure: 'interior',
    keywords: ['appareil sanitaire', 'lavabo', 'wc', 'douche', 'baignoire', 'sanitaerapparate', 'robinetterie'],
  },
  {
    code: '253', label: 'Conduites sanitaires (alimentation et evacuation)', phase: 'technique',
    group: 'Sanitaire', exposure: 'interior',
    keywords: ['sanitaire', 'plomberie', 'tuyauterie', 'conduite eau', 'evacuation', 'colonne de chute', 'sanitaerleitung'],
  },
  {
    code: '258', label: 'Agencement de cuisine', phase: 'finitions',
    group: 'Cuisine', exposure: 'interior',
    keywords: ['cuisine', 'agencement de cuisine', 'kucheneinrichtung', 'kuecheneinrichtung', 'plan de travail'],
  },

  // ── CFC 26 — Installations de transport ──────────────────────────────────
  {
    code: '261', label: 'Ascenseurs, monte-charges', phase: 'technique',
    group: 'Ascenseurs', exposure: 'interior',
    keywords: ['ascenseur', 'monte-charge', 'aufzug', 'elevateur'],
  },

  // ── CFC 27 — Aménagements intérieurs 1 ───────────────────────────────────
  {
    code: '271', label: 'Platrerie, cloisons seches', phase: 'finitions',
    group: 'Platrerie', exposure: 'interior',
    keywords: ['platrerie', 'platre', 'cloison', 'placo', 'plaque de platre', 'gipser', 'enduit interieur', 'joint'],
  },
  {
    code: '272', label: 'Ouvrages metalliques, serrurerie', phase: 'finitions',
    group: 'Serrurerie', exposure: 'interior',
    keywords: ['serrurerie', 'garde-corps', 'ouvrage metallique', 'metallbau', 'main courante', 'balustrade'],
  },
  {
    code: '273', label: 'Menuiserie interieure (portes, agencements)', phase: 'finitions',
    group: 'Menuiserie interieure', exposure: 'interior',
    keywords: ['menuiserie', 'porte interieure', 'agencement', 'schreiner', 'armoire', 'huisserie', 'placard'],
  },
  {
    code: '275', label: 'Systemes de verrouillage', phase: 'finitions',
    group: 'Serrurerie', exposure: 'interior',
    keywords: ['verrouillage', 'cylindre', 'serrure', 'schliessanlage', 'organigramme de fermeture'],
  },
  {
    code: '277', label: 'Cloisons en elements (systemes)', phase: 'finitions',
    group: 'Platrerie', exposure: 'interior',
    keywords: ['cloison systeme', 'cloison amovible', 'trennwand', 'cloison vitree'],
  },

  // ── CFC 28 — Aménagements intérieurs 2 ───────────────────────────────────
  {
    code: '281', label: 'Revetements de sol', phase: 'finitions',
    group: 'Revetements sols', exposure: 'interior',
    keywords: ['revetement de sol', 'bodenbelag', 'sol'],
  },
  {
    code: '281.1', label: 'Chapes (ciment, anhydrite)', phase: 'finitions',
    group: 'Chapes', exposure: 'interior',
    keywords: ['chape', 'unterlagsboden', 'anhydrite', 'chape ciment', 'chape flottante', 'ragreage'],
  },
  {
    code: '281.2', label: 'Carrelage de sol', phase: 'finitions',
    group: 'Revetements sols', exposure: 'interior',
    keywords: ['carrelage', 'carreleur', 'plattenbelag', 'gres cerame'],
  },
  {
    code: '281.3', label: 'Parquets et sols souples', phase: 'finitions',
    group: 'Revetements sols', exposure: 'interior',
    keywords: ['parquet', 'sol souple', 'lino', 'linoleum', 'moquette', 'vinyle', 'stratifie'],
  },
  {
    code: '282', label: 'Revetements de paroi (faience, panneaux)', phase: 'finitions',
    group: 'Revetements parois', exposure: 'interior',
    keywords: ['revetement de paroi', 'faience', 'carrelage mural', 'wandbelag', 'lambris'],
  },
  {
    code: '283', label: 'Revetements de plafond, faux-plafonds', phase: 'finitions',
    group: 'Faux plafonds', exposure: 'interior',
    keywords: ['faux plafond', 'plafond suspendu', 'deckenbekleidung', 'dalle de plafond'],
  },
  {
    code: '285', label: 'Traitement de surfaces interieures (peinture)', phase: 'finitions',
    group: 'Peinture', exposure: 'interior',
    keywords: ['peinture', 'mise en peinture', 'tapisserie', 'papier peint', 'malerarbeiten', 'lasure'],
  },
  {
    code: '287', label: 'Nettoyage du batiment', phase: 'finitions',
    group: 'Nettoyage', exposure: 'interior',
    keywords: ['nettoyage', 'baureinigung', 'nettoyage final', 'remise en etat'],
  },

  // ── CFC 4 — Aménagements extérieurs ──────────────────────────────────────
  {
    code: '411', label: 'Amenagements exterieurs (revetements, acces)', phase: 'exterieurs',
    group: 'Amenagements exterieurs', exposure: 'exterior',
    keywords: ['amenagement exterieur', 'place', 'acces', 'bordure', 'pave', 'enrobe', 'umgebung'],
  },
  {
    code: '421', label: 'Jardinage, plantations', phase: 'exterieurs',
    group: 'Amenagements exterieurs', exposure: 'exterior',
    keywords: ['jardinage', 'plantation', 'engazonnement', 'gaertnerarbeiten', 'espace vert', 'paysagisme'],
  },
];

const REGISTRY_BY_CODE: Map<string, CfcEntry> = new Map(
  CFC_REGISTRY.map((e) => [e.code, e]),
);

/**
 * Legacy → canonical code aliases.
 *
 * ONLY non-colliding legacy codes are aliased. Codes whose legacy meaning
 * collides with a canonical entry (e.g. legacy 214 = "maçonnerie" vs canonical
 * 214 = "construction bois") are deliberately NOT aliased: the canonical
 * meaning wins and the mismatch is surfaced by resolveCfc()'s logging.
 */
export const CFC_ALIASES: Record<string, string> = {
  '110': '111',
  '114': '201',   // remblayage / compactage → excavation
  '200': '201',
  '210': '211',
  '212': '216',   // legacy "éléments préfabriqués" numbering
  '220': '221',
  '229': '227',
  '230': '232',
  '234': '261',   // legacy prompt numbering for ascenseurs
  '240': '241',
  '246': '243',
  '250': '253',
  '252': '251',
  '254': '253',
  '255': '253',
  '260': '261',
  '270': '271',
  '274': '273',
  '280': '281',
  '286': '285',   // legacy prompt numbering for peinture
  '291': '273',   // legacy prompt numbering for menuiserie intérieure
  '311': '411',   // legacy productivity-ratio numbering for aménagements ext.
  '312': '261',
  '313': '258',
  '401': '411',
  '423': '421',
};

// ============================================================================
// Resolution
// ============================================================================

export interface ResolveOptions {
  /** Optional description / free text used when the code alone does not match */
  text?: string | null;
  /** Sink for unresolved / degraded matches (defaults to console.warn) */
  log?: (message: string) => void;
}

/** Count of unresolved lookups since process start — surfaced in generation logs. */
let unresolvedCount = 0;

export function getUnresolvedCfcCount(): number {
  return unresolvedCount;
}

export function resetUnresolvedCfcCount(): void {
  unresolvedCount = 0;
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract a numeric CFC token ("CFC 211.3 béton" → "211.3") */
function extractCode(raw: string): string | null {
  const m = raw.match(/(\d{2,3}(?:\.\d{1,2})?)/);
  return m ? m[1] : null;
}

/**
 * Resolve any CFC code or free-text trade description to a canonical registry
 * entry.
 *
 * Resolution order: exact → alias → sub-code parent → 3-digit prefix →
 * keyword match on the text → unresolved (logged).
 */
export function resolveCfc(
  codeOrText: string | null | undefined,
  options: ResolveOptions = {},
): CfcResolution {
  const log = options.log ?? ((m: string) => console.warn(m));
  const raw = (codeOrText ?? '').toString().trim();
  const text = options.text ?? null;

  if (!raw && !text) {
    unresolvedCount++;
    return { code: null, entry: null, kind: 'unresolved', input: null };
  }

  const numeric = raw ? extractCode(raw) : null;

  if (numeric) {
    // 1. Exact canonical code
    const exact = REGISTRY_BY_CODE.get(numeric);
    if (exact) return { code: exact.code, entry: exact, kind: 'exact', input: raw };

    // 2. Alias
    const aliased = CFC_ALIASES[numeric];
    if (aliased) {
      const entry = REGISTRY_BY_CODE.get(aliased);
      if (entry) {
        return { code: entry.code, entry, kind: 'alias', input: raw };
      }
    }

    // 3. Sub-code → parent ("211.3.2" → "211.3" → "211")
    const parts = numeric.split('.');
    for (let i = parts.length - 1; i >= 1; i--) {
      const prefix = parts.slice(0, i).join('.');
      const entry = REGISTRY_BY_CODE.get(prefix) ?? REGISTRY_BY_CODE.get(CFC_ALIASES[prefix] ?? '');
      if (entry) {
        return { code: entry.code, entry, kind: 'sub', input: raw };
      }
    }

    // 4. Same 2-digit family (e.g. "239" → first 23x entry)
    const family = parts[0].slice(0, 2);
    const familyEntry = CFC_REGISTRY.find((e) => e.code.replace(/\..*/, '').slice(0, 2) === family);
    if (familyEntry) {
      log(`[cfc-registry] Code "${raw}" unknown — falling back to family ${familyEntry.code} (${familyEntry.label})`);
      return { code: familyEntry.code, entry: familyEntry, kind: 'prefix', input: raw };
    }
  }

  // 5. Keyword match on the free text (or on the raw input when non-numeric)
  const haystack = normalizeText([text ?? '', raw].filter(Boolean).join(' '));
  if (haystack) {
    let best: { entry: CfcEntry; score: number } | null = null;
    for (const entry of CFC_REGISTRY) {
      for (const kw of entry.keywords) {
        const nk = normalizeText(kw);
        if (nk && haystack.includes(nk)) {
          // Longer keywords are more discriminant
          const score = nk.length;
          if (!best || score > best.score) best = { entry, score };
        }
      }
    }
    if (best) {
      return { code: best.entry.code, entry: best.entry, kind: 'keyword', input: raw || text };
    }
  }

  unresolvedCount++;
  log(`[cfc-registry] UNRESOLVED cfc="${raw}" text="${(text ?? '').slice(0, 60)}"`);
  return { code: null, entry: null, kind: 'unresolved', input: raw || text };
}

/** Convenience: canonical code only (null when unresolved). */
export function canonicalCfc(codeOrText: string | null | undefined, text?: string | null): string | null {
  return resolveCfc(codeOrText, { text, log: () => {} }).code;
}

/** Registry lookup by canonical code (no resolution). */
export function getCfcEntry(code: string): CfcEntry | null {
  return REGISTRY_BY_CODE.get(code) ?? null;
}

/** The 3-digit family of a canonical code ("211.3" → "211"). */
export function cfcFamily(code: string): string {
  return code.replace(/\..*/, '');
}

/**
 * True when `code` is `parent` or one of its sub-codes.
 * "211.3" is under "211"; "211" is NOT under "211.3".
 */
export function isUnderCfc(code: string, parent: string): boolean {
  return code === parent || code.startsWith(parent + '.');
}

// ============================================================================
// Prompt helper — keeps the submission-analysis prompt in sync
// ============================================================================

/**
 * Markdown table of the registry, injected verbatim into the submission
 * analysis prompt so the extraction vocabulary can never drift again.
 */
export function buildCfcPromptTable(): string {
  const rows = CFC_REGISTRY.map((e) => `| ${e.code.padEnd(5)} | ${e.label} |`);
  return ['| CFC   | Description |', '|-------|-------------|', ...rows].join('\n');
}

/** Distinct canonical material groups (used as the prompt's allowed list). */
export function listMaterialGroups(): string[] {
  return Array.from(new Set(CFC_REGISTRY.map((e) => e.group))).concat('Divers');
}
