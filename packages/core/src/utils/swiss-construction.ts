// ============================================================
// Swiss Construction Standards — CFC Codes & SIA Norms
// ============================================================

/**
 * CFC (Classification des Frais de Construction) — Common codes
 * Based on the Swiss CFC 2 classification system
 */
export const CFC_CODES: Record<string, { fr: string; de: string; en: string }> = {
  "211": { fr: "Terrassements", de: "Erdarbeiten", en: "Earthworks" },
  "214": { fr: "Canalisations", de: "Kanalisationen", en: "Sewerage" },
  "221": { fr: "Gros œuvre", de: "Rohbau 1", en: "Structural work" },
  "222": { fr: "Gros œuvre 2", de: "Rohbau 2", en: "Structural work 2" },
  "225": { fr: "Béton armé", de: "Stahlbeton", en: "Reinforced concrete" },
  "271": { fr: "Chapes", de: "Unterlagsböden", en: "Screeds" },
  "273": { fr: "Revêtements de sols", de: "Bodenbeläge", en: "Floor coverings" },
  "281": { fr: "Fenêtres", de: "Fenster", en: "Windows" },
  "283": { fr: "Stores", de: "Storen", en: "Blinds" },
  "342": { fr: "Peinture", de: "Malerarbeiten", en: "Painting" },
  "232": { fr: "Installations sanitaires", de: "Sanitärinstallationen", en: "Plumbing" },
  "234": { fr: "Installations de chauffage", de: "Heizungsinstallationen", en: "Heating" },
  "236": { fr: "Installations de ventilation", de: "Lüftungsinstallationen", en: "Ventilation" },
  "241": { fr: "Installations électriques", de: "Elektroinstallationen", en: "Electrical" },
};

/**
 * Get CFC code label by locale
 */
export function getCFCLabel(
  code: string,
  locale: "fr" | "de" | "en" = "fr"
): string {
  return CFC_CODES[code]?.[locale] ?? `CFC ${code}`;
}

/**
 * SIA norms commonly referenced in Swiss construction
 */
export const SIA_NORMS = {
  "SIA 102": "Ordonnance concernant les prestations et les honoraires des architectes",
  "SIA 103": "Ordonnance concernant les prestations et les honoraires des ingénieurs civils",
  "SIA 108": "Ordonnance concernant les prestations et les honoraires des ingénieurs en installations",
  "SIA 118": "Conditions générales pour l'exécution des travaux de construction",
  "SIA 180": "Isolation thermique et protection contre l'humidité dans les bâtiments",
  "SIA 260": "Bases pour l'élaboration des projets de structures porteuses",
  "SIA 380/1": "L'énergie thermique dans le bâtiment",
} as const;

/**
 * Swiss cantons relevant for construction permits
 */
export const SWISS_CANTONS = [
  "VD", "GE", "VS", "FR", "NE", "JU", // Romandie
  "BE", "ZH", "AG", "LU", "SG", "TG", "SO", "BL", "BS", // German-speaking
  "TI", // Italian-speaking
] as const;
