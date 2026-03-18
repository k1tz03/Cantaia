// ═══════════════════════════════════════════════════════════════
// Cantaia Gantt — Standard CFC Dependency Rules
// Models the typical construction sequence for Swiss projects.
// ═══════════════════════════════════════════════════════════════

export interface DependencyRule {
  /** CFC code (or prefix) of the predecessor activity */
  from_cfc: string;
  /** CFC code (or prefix) of the successor activity */
  to_cfc: string;
  /** Dependency type: FS=Finish-to-Start, SS=Start-to-Start, FF=Finish-to-Finish, SF=Start-to-Finish */
  type: 'FS' | 'SS' | 'FF' | 'SF';
  /** Lag in calendar days (positive = delay, negative = overlap) */
  lag_days: number;
  /** Human-readable description of the dependency logic */
  description: string;
}

/**
 * Standard construction dependency rules following the CFC classification.
 * The sequence represents a typical Swiss new-build project.
 * Renovation/extension projects may override some of these rules.
 */
export const DEPENDENCY_RULES: DependencyRule[] = [
  // ── Phase 1 → 2: Terrassement → Gros œuvre ──
  {
    from_cfc: '113',
    to_cfc: '211',
    type: 'FS',
    lag_days: 0,
    description: 'Fondations démarrent après terrassement terminé',
  },

  // ── Gros œuvre interne ──
  {
    from_cfc: '211',
    to_cfc: '214',
    type: 'FS',
    lag_days: 0,
    description: 'Charpente métallique après structure béton',
  },
  {
    from_cfc: '211',
    to_cfc: '215',
    type: 'FS',
    lag_days: 0,
    description: 'Charpente bois après structure béton porteur',
  },
  {
    from_cfc: '211',
    to_cfc: '216',
    type: 'SS',
    lag_days: 5,
    description: 'Maçonnerie peut démarrer 5 jours après début structure béton (étages inférieurs)',
  },

  // ── Gros œuvre → Enveloppe ──
  {
    from_cfc: '215',
    to_cfc: '225',
    type: 'FS',
    lag_days: 0,
    description: 'Couverture toiture après montage charpente',
  },
  {
    from_cfc: '211',
    to_cfc: '224',
    type: 'FS',
    lag_days: 5,
    description: 'Façade/isolation après structure gros œuvre (avec petit décalage)',
  },
  {
    from_cfc: '224',
    to_cfc: '221',
    type: 'SS',
    lag_days: 3,
    description: 'Fenêtres posées en parallèle avec façade (décalage 3j)',
  },

  // ── Enveloppe → Techniques (hors d\'eau / hors d\'air) ──
  {
    from_cfc: '221',
    to_cfc: '232',
    type: 'SS',
    lag_days: 5,
    description: 'Électricité (encastrements) démarre après début pose fenêtres',
  },
  {
    from_cfc: '221',
    to_cfc: '242',
    type: 'SS',
    lag_days: 5,
    description: 'CVC (gaines, tuyaux) démarre après début pose fenêtres',
  },
  {
    from_cfc: '221',
    to_cfc: '251',
    type: 'SS',
    lag_days: 5,
    description: 'Sanitaire (canalisations) démarre après début pose fenêtres',
  },

  // ── Techniques internes (en parallèle avec décalages) ──
  {
    from_cfc: '242',
    to_cfc: '271',
    type: 'FS',
    lag_days: 3,
    description: 'Chapes après fin chauffage au sol (temps de séchage tuyaux)',
  },
  {
    from_cfc: '232',
    to_cfc: '271',
    type: 'FS',
    lag_days: 0,
    description: 'Chapes après fin encastrements électriques',
  },
  {
    from_cfc: '251',
    to_cfc: '271',
    type: 'FS',
    lag_days: 0,
    description: 'Chapes après fin canalisations sanitaires encastrées',
  },

  // ── Chapes → Revêtements (avec séchage) ──
  {
    from_cfc: '271',
    to_cfc: '281',
    type: 'FS',
    lag_days: 21,
    description: 'Revêtements sols après séchage chapes (3 semaines min.)',
  },
  {
    from_cfc: '271',
    to_cfc: '272',
    type: 'FS',
    lag_days: 7,
    description: 'Faux-plafonds après chapes (1 semaine)',
  },
  {
    from_cfc: '271',
    to_cfc: '273',
    type: 'FS',
    lag_days: 7,
    description: 'Cloisons placo après chapes (1 semaine)',
  },

  // ── Finitions ──
  {
    from_cfc: '273',
    to_cfc: '285',
    type: 'FS',
    lag_days: 3,
    description: 'Peinture après fin cloisons placo (temps séchage joints)',
  },
  {
    from_cfc: '281',
    to_cfc: '285',
    type: 'SS',
    lag_days: 5,
    description: 'Peinture peut démarrer en parallèle avec sols (pièces différentes)',
  },

  // ── Finitions → Appareillage final ──
  {
    from_cfc: '285',
    to_cfc: '232',
    type: 'FF',
    lag_days: -3,
    description: 'Appareillage électrique final (prises, luminaires) finit avec la peinture',
  },
  {
    from_cfc: '285',
    to_cfc: '251',
    type: 'FF',
    lag_days: -3,
    description: 'Pose appareils sanitaires finit avec la peinture',
  },

  // ── Systèmes (ascenseur) ──
  {
    from_cfc: '211',
    to_cfc: '311',
    type: 'SS',
    lag_days: 20,
    description: 'Installation ascenseur après gaine béton (20j décalage)',
  },
];

// ============================================================================
// LOOKUP HELPERS
// ============================================================================

/**
 * Find all dependency rules where `from_cfc` matches the given CFC code.
 * Uses prefix matching: "211.3" matches rules with from_cfc "211".
 */
export function findDependenciesFrom(cfc_code: string): DependencyRule[] {
  return DEPENDENCY_RULES.filter(
    (r) => cfc_code === r.from_cfc || cfc_code.startsWith(r.from_cfc + '.'),
  );
}

/**
 * Find all dependency rules where `to_cfc` matches the given CFC code.
 * Uses prefix matching.
 */
export function findDependenciesTo(cfc_code: string): DependencyRule[] {
  return DEPENDENCY_RULES.filter(
    (r) => cfc_code === r.to_cfc || cfc_code.startsWith(r.to_cfc + '.'),
  );
}

/**
 * Check if there is a dependency rule between two CFC codes.
 * Returns the rule if found, null otherwise.
 */
export function findDependencyBetween(
  from_cfc: string,
  to_cfc: string,
): DependencyRule | null {
  return DEPENDENCY_RULES.find(
    (r) =>
      (from_cfc === r.from_cfc || from_cfc.startsWith(r.from_cfc + '.')) &&
      (to_cfc === r.to_cfc || to_cfc.startsWith(r.to_cfc + '.')),
  ) ?? null;
}

/**
 * Get the major CFC group code from a detailed code.
 * e.g. "211.3.1" → "211", "232.2" → "232"
 */
export function getMajorCfcGroup(cfc_code: string): string {
  // Return the first numeric group (up to 3 digits)
  const match = cfc_code.match(/^(\d{1,3})/);
  return match ? match[1] : cfc_code;
}
