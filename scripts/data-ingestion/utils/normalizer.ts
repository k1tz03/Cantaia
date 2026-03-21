import crypto from 'crypto';

// Normalise un code CFC (supprime espaces, uniformise les séparateurs)
export function normalizeCFC(raw: string): string {
  return raw
    .replace(/\s+/g, '')
    .replace(/[,;]/g, '.')
    .replace(/^0+/, '')
    .trim();
}

// Normalise une unité
export function normalizeUnit(raw: string): string {
  const mapping: Record<string, string> = {
    'm2': 'm²', 'M2': 'm²', 'm²': 'm²', 'mq': 'm²',
    'm3': 'm³', 'M3': 'm³', 'm³': 'm³', 'mc': 'm³',
    'ml': 'ml', 'ML': 'ml', "m'": 'ml', 'm1': 'ml',
    'kg': 'kg', 'KG': 'kg', 'Kg': 'kg',
    't': 't', 'T': 't', 'to': 't', 'tonne': 't',
    'pce': 'pce', 'pièce': 'pce', 'Stk': 'pce', 'St': 'pce',
    'fft': 'fft', 'gl': 'fft', 'global': 'fft', 'forfait': 'fft',
    'h': 'h', 'heure': 'h', 'Std': 'h',
    'j': 'j', 'jour': 'j', 'Tag': 'j',
  };
  return mapping[raw.trim()] || raw.trim().toLowerCase();
}

// Hash un nom de fournisseur pour anonymisation
export function hashSupplierName(name: string): string {
  return crypto
    .createHash('sha256')
    .update(name.toLowerCase().trim() + 'cantaia_salt_2026')
    .digest('hex')
    .substring(0, 16); // Raccourci pour lisibilité
}

// Extrait la région depuis un chemin ou un nom de projet
export function detectRegion(text: string): string {
  const regions: Record<string, string[]> = {
    'vaud': ['lausanne', 'vaud', 'morges', 'nyon', 'yverdon', 'montreux', 'vevey', 'renens', 'pully', 'prilly'],
    'geneve': ['genève', 'geneve', 'carouge', 'lancy', 'meyrin', 'vernier'],
    'fribourg': ['fribourg', 'bulle', 'morat'],
    'valais': ['sion', 'sierre', 'martigny', 'monthey', 'valais'],
    'neuchatel': ['neuchâtel', 'neuchatel', 'la chaux-de-fonds'],
    'berne': ['bern', 'berne', 'biel', 'bienne', 'thun', 'thoune'],
    'zurich': ['zürich', 'zurich', 'winterthur', 'uster'],
    'bale': ['basel', 'bâle'],
  };

  const lower = text.toLowerCase();
  for (const [region, keywords] of Object.entries(regions)) {
    if (keywords.some((k) => lower.includes(k))) {
      return region;
    }
  }
  return 'vaud'; // Défaut
}

// Détecte le trimestre depuis une date
export function dateToQuarter(date: Date): string {
  const q = Math.ceil((date.getMonth() + 1) / 3);
  return `${date.getFullYear()}-Q${q}`;
}
