// ============================================================
// Cantaia — Submission Parser
// Parse construction specifications (PDF, Excel, Word, text)
// using Claude AI to extract structured lot/chapter/item data.
// ============================================================

export interface ParsedProjectInfo {
  name: string;
  client: string;
  architect: string;
  location: string;
  deadline: string;
}

export interface ParsedItem {
  code: string;
  description: string;
  unit: string;
  quantity: number | null;
  remarks: string;
  confidence: "high" | "medium" | "low";
}

export interface ParsedChapter {
  code: string;
  name: string;
  items: ParsedItem[];
}

export interface ParsedLot {
  cfc_code: string;
  name: string;
  chapters: ParsedChapter[];
}

export interface ParsedSubmission {
  project_info: ParsedProjectInfo;
  lots: ParsedLot[];
  total_items: number;
  overall_confidence: number;
}

/**
 * Build the Claude prompt for parsing a construction submission document
 */
export function buildSubmissionParsePrompt(documentContent: string): string {
  return `Tu es un expert en analyse de documents de construction suisse (soumissions, DPGF, CFC, devis quantitatifs).

Analyse le document suivant et extrais une structure JSON :
{
  "project_info": { "name": "", "client": "", "architect": "", "location": "", "deadline": "" },
  "lots": [{
    "cfc_code": "211",
    "name": "Gros-œuvre",
    "chapters": [{
      "code": "1.1",
      "name": "Terrassements",
      "items": [{
        "code": "1.1.1",
        "description": "Excavation terre végétale",
        "unit": "m³",
        "quantity": 450,
        "remarks": "",
        "confidence": "high"
      }]
    }]
  }]
}

Règles :
- Identifie la numérotation CFC suisse si présente
- Normalise les unités : m², m³, ml, pce, kg, t, h, forfait, global
- Si quantité ambiguë → confidence: "low"
- Préserve les descriptions complètes
- Identifie les variantes et options séparément

Document :
${documentContent}`;
}

/**
 * Mock parser for development - returns realistic parsed data
 */
export function mockParseSubmission(filename: string): ParsedSubmission {
  const isCVC = filename.toLowerCase().includes("cvc") || filename.toLowerCase().includes("ventilation");

  if (isCVC) {
    return {
      project_info: {
        name: "Installation CVC",
        client: "Maître d'ouvrage",
        architect: "Bureau d'architectes",
        location: "Suisse romande",
        deadline: "",
      },
      lots: [
        {
          cfc_code: "244",
          name: "Ventilation",
          chapters: [
            {
              code: "1.1",
              name: "Gaines de ventilation",
              items: [
                { code: "1.1.1", description: "Gaine rectangulaire galvanisée ép. 0.8mm", unit: "m²", quantity: 1200, remarks: "", confidence: "high" },
                { code: "1.1.2", description: "Gaine circulaire spiralée Ø100-315mm", unit: "ml", quantity: 450, remarks: "", confidence: "high" },
                { code: "1.1.3", description: "Clapets coupe-feu EI90", unit: "pce", quantity: 24, remarks: "Avec fusible thermique", confidence: "medium" },
              ],
            },
            {
              code: "1.2",
              name: "Équipements",
              items: [
                { code: "1.2.1", description: "Groupe de ventilation double flux", unit: "pce", quantity: 4, remarks: "Rendement min. 85%, classe A", confidence: "high" },
                { code: "1.2.2", description: "Caisson de mélange", unit: "pce", quantity: 4, remarks: "", confidence: "medium" },
              ],
            },
          ],
        },
        {
          cfc_code: "242",
          name: "Chauffage",
          chapters: [
            {
              code: "2.1",
              name: "Distribution",
              items: [
                { code: "2.1.1", description: "Tube acier noir DN20-DN100", unit: "ml", quantity: 680, remarks: "Soudé", confidence: "high" },
                { code: "2.1.2", description: "Isolation thermique laine minérale", unit: "ml", quantity: 680, remarks: "Ép. selon diamètre", confidence: "medium" },
              ],
            },
          ],
        },
      ],
      total_items: 7,
      overall_confidence: 0.82,
    };
  }

  // Default: gros-œuvre
  return {
    project_info: {
      name: "Travaux de gros-œuvre",
      client: "Maître d'ouvrage",
      architect: "Bureau d'architectes SA",
      location: "Lausanne, VD",
      deadline: "",
    },
    lots: [
      {
        cfc_code: "211",
        name: "Béton armé",
        chapters: [
          {
            code: "1.1",
            name: "Béton",
            items: [
              { code: "1.1.1", description: "Béton C30/37 XC3 pour fondations", unit: "m³", quantity: 360, remarks: "", confidence: "high" },
              { code: "1.1.2", description: "Béton C25/30 XC2 pour voiles", unit: "m³", quantity: 520, remarks: "", confidence: "high" },
              { code: "1.1.3", description: "Béton C20/25 pour remplissages", unit: "m³", quantity: 180, remarks: "", confidence: "medium" },
            ],
          },
          {
            code: "1.2",
            name: "Coffrage",
            items: [
              { code: "1.2.1", description: "Coffrage traditionnel pour voiles", unit: "m²", quantity: 2800, remarks: "", confidence: "high" },
              { code: "1.2.2", description: "Coffrage traditionnel pour dalles", unit: "m²", quantity: 3200, remarks: "", confidence: "high" },
            ],
          },
          {
            code: "1.3",
            name: "Armature",
            items: [
              { code: "1.3.1", description: "Acier d'armature B500B", unit: "kg", quantity: 45000, remarks: "Livrée coupée et façonnée", confidence: "high" },
              { code: "1.3.2", description: "Treillis soudé", unit: "m²", quantity: 1500, remarks: "", confidence: "medium" },
            ],
          },
        ],
      },
      {
        cfc_code: "113",
        name: "Terrassement",
        chapters: [
          {
            code: "2.1",
            name: "Excavation",
            items: [
              { code: "2.1.1", description: "Excavation terre végétale", unit: "m³", quantity: 450, remarks: "", confidence: "high" },
              { code: "2.1.2", description: "Excavation terrain meuble", unit: "m³", quantity: 2200, remarks: "", confidence: "high" },
              { code: "2.1.3", description: "Évacuation et mise en décharge", unit: "m³", quantity: 2650, remarks: "Transport inclus", confidence: "high" },
            ],
          },
        ],
      },
    ],
    total_items: 10,
    overall_confidence: 0.88,
  };
}

/**
 * Calculate confidence stats for a parsed submission
 */
export function getConfidenceStats(parsed: ParsedSubmission): {
  high: number;
  medium: number;
  low: number;
} {
  let high = 0, medium = 0, low = 0;
  for (const lot of parsed.lots) {
    for (const chapter of lot.chapters) {
      for (const item of chapter.items) {
        if (item.confidence === "high") high++;
        else if (item.confidence === "medium") medium++;
        else low++;
      }
    }
  }
  return { high, medium, low };
}
