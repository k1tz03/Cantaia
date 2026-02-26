// ============================================================
// Cantaia — Supplier Service
// CRUD + Scoring automatique
// ============================================================

import type { Supplier, SupplierStatus } from "@cantaia/database";

// ---------- Interfaces ----------

export interface SupplierFilters {
  specialty?: string;
  geo_zone?: string;
  status?: SupplierStatus;
  min_score?: number;
  search?: string;
  cfc_code?: string;
}

export interface SupplierScoreInput {
  total_requests_sent: number;
  total_offers_received: number;
  avg_response_days: number;
  price_competitiveness: number; // 1-100, higher = more competitive
  reliability_score: number; // 0-100
  manual_rating: number; // 0-5
}

// ---------- Scoring ----------

/**
 * Calculate supplier overall score (0-100)
 * Weighted: response_rate × 0.25 + competitiveness × 0.35 + reliability × 0.25 + manual_rating × 0.15
 */
export function calculateSupplierScore(input: SupplierScoreInput): {
  response_rate: number;
  overall_score: number;
} {
  const response_rate =
    input.total_requests_sent > 0
      ? (input.total_offers_received / input.total_requests_sent) * 100
      : 0;

  // Normalize manual_rating from 0-5 to 0-100
  const manualNormalized = (input.manual_rating / 5) * 100;

  const overall_score =
    response_rate * 0.25 +
    input.price_competitiveness * 0.35 +
    input.reliability_score * 0.25 +
    manualNormalized * 0.15;

  return {
    response_rate: Math.round(response_rate * 100) / 100,
    overall_score: Math.round(overall_score * 100) / 100,
  };
}

// ---------- Filtering ----------

export function filterSuppliers(
  suppliers: Supplier[],
  filters: SupplierFilters
): Supplier[] {
  return suppliers.filter((s) => {
    if (filters.specialty && !s.specialties.includes(filters.specialty)) {
      return false;
    }
    if (filters.geo_zone && s.geo_zone !== filters.geo_zone) {
      return false;
    }
    if (filters.status && s.status !== filters.status) {
      return false;
    }
    if (filters.min_score && s.overall_score < filters.min_score) {
      return false;
    }
    if (filters.cfc_code && !s.cfc_codes.includes(filters.cfc_code)) {
      return false;
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const matchesName = s.company_name.toLowerCase().includes(q);
      const matchesEmail = s.email?.toLowerCase().includes(q) || false;
      const matchesContact = s.contact_name?.toLowerCase().includes(q) || false;
      const matchesCity = s.city?.toLowerCase().includes(q) || false;
      if (!matchesName && !matchesEmail && !matchesContact && !matchesCity) {
        return false;
      }
    }
    return true;
  });
}

// ---------- Specialties ----------

export const SUPPLIER_SPECIALTIES = [
  "gros_oeuvre",
  "electricite",
  "cvc",
  "sanitaire",
  "peinture",
  "menuiserie",
  "etancheite",
  "facades",
  "serrurerie",
  "carrelage",
  "platrerie",
  "charpente",
  "couverture",
  "ascenseur",
  "amenagement_exterieur",
  "demolition",
  "terrassement",
  "echafaudage",
] as const;

export type SupplierSpecialty = (typeof SUPPLIER_SPECIALTIES)[number];

export const SPECIALTY_LABELS: Record<SupplierSpecialty, { fr: string; en: string; de: string }> = {
  gros_oeuvre: { fr: "Gros-œuvre", en: "Structural work", de: "Rohbau" },
  electricite: { fr: "Électricité", en: "Electrical", de: "Elektrik" },
  cvc: { fr: "CVC", en: "HVAC", de: "HLK" },
  sanitaire: { fr: "Sanitaire", en: "Plumbing", de: "Sanitär" },
  peinture: { fr: "Peinture", en: "Painting", de: "Malerei" },
  menuiserie: { fr: "Menuiserie", en: "Carpentry", de: "Schreinerei" },
  etancheite: { fr: "Étanchéité", en: "Waterproofing", de: "Abdichtung" },
  facades: { fr: "Façades", en: "Facades", de: "Fassaden" },
  serrurerie: { fr: "Serrurerie", en: "Metalwork", de: "Schlosserei" },
  carrelage: { fr: "Carrelage", en: "Tiling", de: "Plattenleger" },
  platrerie: { fr: "Plâtrerie", en: "Plastering", de: "Gipserei" },
  charpente: { fr: "Charpente", en: "Timber framing", de: "Zimmerei" },
  couverture: { fr: "Couverture", en: "Roofing", de: "Dachdecker" },
  ascenseur: { fr: "Ascenseur", en: "Elevator", de: "Aufzug" },
  amenagement_exterieur: { fr: "Aménagement ext.", en: "Landscaping", de: "Aussenanlagen" },
  demolition: { fr: "Démolition", en: "Demolition", de: "Abbruch" },
  terrassement: { fr: "Terrassement", en: "Earthworks", de: "Erdbau" },
  echafaudage: { fr: "Échafaudage", en: "Scaffolding", de: "Gerüstbau" },
};

// ---------- Swiss geo zones ----------

export const GEO_ZONES = [
  "VD", "GE", "FR", "VS", "NE", "JU", "BE", "ZH", "BS", "BL",
  "AG", "SO", "LU", "SG", "TG", "SZ", "ZG", "TI", "GR",
  "national", "international",
] as const;
