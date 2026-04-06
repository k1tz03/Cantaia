"use client";

import { useState } from "react";
import {
  X,
  Loader2,
  Sparkles,
  Plus,
  CheckCircle2,
  MapPin,
  Globe,
  Phone,
  Mail,
  AlertCircle,
  Search,
} from "lucide-react";
import {
  SUPPLIER_SPECIALTIES,
  SPECIALTY_LABELS,
  GEO_ZONES,
  type SupplierSpecialty,
} from "@cantaia/core/suppliers";

interface AISuggestion {
  company_name: string;
  contact_info?: {
    email?: string;
    phone?: string;
    website?: string;
    address?: string;
    city?: string;
    postal_code?: string;
  };
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  specialties?: string[];
  cfc_codes?: string[];
  geo_zone?: string;
  reason?: string;
  reasoning?: string;
  confidence?: number;
}

interface AISearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSupplierAdded: () => void;
}

export function AISearchDialog({
  open,
  onOpenChange,
  onSupplierAdded,
}: AISearchDialogProps) {
  const [cfcCodesInput, setCfcCodesInput] = useState("");
  const [keywords, setKeywords] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [geoZone, setGeoZone] = useState("");
  const [projectDescription, setProjectDescription] = useState("");

  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [importingIdx, setImportingIdx] = useState<number | null>(null);
  const [importedIdxs, setImportedIdxs] = useState<Set<number>>(new Set());
  const [importError, setImportError] = useState("");

  if (!open) return null;

  function getSpecialtyLabel(key: string): string {
    const labels = SPECIALTY_LABELS[key as SupplierSpecialty];
    return labels?.fr || key;
  }

  function parseCfcCodes(input: string): string[] {
    return input
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async function handleSearch() {
    const codes = parseCfcCodes(cfcCodesInput);
    const hasKeywords = keywords.trim().length > 0;
    if (codes.length === 0 && !hasKeywords) return;
    if (!geoZone) return;

    setSearching(true);
    setSearchError("");
    setSuggestions([]);
    setHasSearched(false);
    setImportedIdxs(new Set());

    try {
      const res = await fetch("/api/suppliers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cfc_codes: codes.length > 0 ? codes : undefined,
          keywords: hasKeywords ? keywords.trim() : undefined,
          specialty: specialty || undefined,
          geo_zone: geoZone,
          project_description: projectDescription || undefined,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let msg = `Erreur serveur (${res.status})`;
        try {
          const parsed = JSON.parse(text);
          if (parsed.error) msg = parsed.error;
        } catch {
          /* non-JSON */
        }
        setSearchError(msg);
        setSearching(false);
        setHasSearched(true);
        return;
      }

      const data = await res.json();
      setSuggestions(data.suggestions || []);
      setSearching(false);
      setHasSearched(true);
    } catch (err) {
      console.error("[AISearchDialog] Search error:", err);
      setSearchError("Erreur reseau, veuillez reessayer");
      setSearching(false);
      setHasSearched(true);
    }
  }

  /** Extract contact field from nested contact_info or flat fallback */
  function getContact(s: AISuggestion, field: keyof NonNullable<AISuggestion["contact_info"]>): string | undefined {
    return s.contact_info?.[field] || (s as any)[field] || undefined;
  }

  function getFullAddress(s: AISuggestion): string | undefined {
    const parts = [getContact(s, "address"), getContact(s, "postal_code"), getContact(s, "city")].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : undefined;
  }

  async function handleImportSuggestion(suggestion: AISuggestion, idx: number) {
    setImportingIdx(idx);
    setImportError("");

    try {
      const payload: Record<string, any> = {
        company_name: suggestion.company_name,
        email: getContact(suggestion, "email") || null,
        phone: getContact(suggestion, "phone") || null,
        website: getContact(suggestion, "website") || null,
        city: getContact(suggestion, "city") || null,
        address: getContact(suggestion, "address") || null,
        specialties: suggestion.specialties || [],
        cfc_codes: suggestion.cfc_codes || [],
        geo_zone: suggestion.geo_zone || geoZone || null,
        status: "new",
        notes: (suggestion.reasoning || suggestion.reason)
          ? `Source: Recherche IA. ${suggestion.reasoning || suggestion.reason}`
          : "Source: Recherche IA",
      };

      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        let msg = `Erreur (${res.status})`;
        try {
          const parsed = JSON.parse(text);
          if (parsed.error) msg = parsed.error;
        } catch {
          /* non-JSON */
        }
        setImportError(msg);
        setImportingIdx(null);
        return;
      }

      setImportedIdxs((prev) => new Set(prev).add(idx));
      setImportingIdx(null);
      onSupplierAdded();
    } catch (err) {
      console.error("[AISearchDialog] Import error:", err);
      setImportError("Erreur reseau");
      setImportingIdx(null);
    }
  }

  function handleClose() {
    setCfcCodesInput("");
    setKeywords("");
    setSpecialty("");
    setGeoZone("");
    setProjectDescription("");
    setSuggestions([]);
    setHasSearched(false);
    setSearchError("");
    setImportError("");
    setImportedIdxs(new Set());
    setImportingIdx(null);
    setSearching(false);
    onOpenChange(false);
  }

  const canSearch =
    (parseCfcCodes(cfcCodesInput).length > 0 || keywords.trim().length > 0) && geoZone;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-[#0F0F11] shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#27272A] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-semibold text-[#FAFAFA]">
              Recherche IA de fournisseurs
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1 text-[#71717A] hover:bg-[#27272A] hover:text-[#71717A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Search form */}
          <div className="space-y-4 mb-6">
            {/* Keywords — free text search */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[#FAFAFA]">
                <Search className="inline h-3 w-3 mr-1" />
                Recherche par mots-cles
              </label>
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] placeholder-gray-400 focus:border-[#F97316] focus:outline-none"
                placeholder="Ex: grilles cunette, bordures beton, stores exterieurs..."
              />
              <p className="mt-0.5 text-[10px] text-[#52525B]">
                Recherche libre par nom de produit, materiau ou type de fournisseur
              </p>
            </div>

            {/* CFC Codes */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[#A1A1AA]">
                Codes CFC (optionnel)
              </label>
              <input
                type="text"
                value={cfcCodesInput}
                onChange={(e) => setCfcCodesInput(e.target.value)}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                placeholder="211, 271, 281 (separes par des virgules)"
              />
              {cfcCodesInput && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {parseCfcCodes(cfcCodesInput).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-0.5 rounded bg-[#27272A] text-[#FAFAFA] text-xs font-mono"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Specialty + Geo zone */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#A1A1AA]">
                  Specialite (optionnel)
                </label>
                <select
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- Toutes --</option>
                  {SUPPLIER_SPECIALTIES.map((sp) => (
                    <option key={sp} value={sp}>
                      {getSpecialtyLabel(sp)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#FAFAFA]">
                  Zone geographique *
                </label>
                <select
                  value={geoZone}
                  onChange={(e) => setGeoZone(e.target.value)}
                  className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none"
                >
                  <option value="">-- Selectionner --</option>
                  {GEO_ZONES.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Optional project description */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[#A1A1AA]">
                Description du projet (optionnel)
              </label>
              <textarea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                placeholder="Ex: Construction d'un immeuble de bureaux, 5 etages, Lausanne centre"
              />
            </div>

            {/* Search button */}
            <button
              type="button"
              onClick={handleSearch}
              disabled={!canSearch || searching}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-white hover:bg-[#EA580C] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {searching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {searching ? "Recherche en cours..." : "Rechercher"}
            </button>
          </div>

          {/* Error */}
          {searchError && (
            <div className="mb-4 flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {searchError}
            </div>
          )}

          {importError && (
            <div className="mb-4 flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400 ring-1 ring-inset ring-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {importError}
            </div>
          )}

          {/* Results */}
          {hasSearched && !searching && (
            <div>
              <p className="text-xs font-medium text-[#71717A] uppercase mb-3">
                {suggestions.length > 0
                  ? `${suggestions.length} suggestion(s) trouvee(s)`
                  : "Aucune suggestion trouvee"}
              </p>

              <div className="space-y-3">
                {suggestions.map((s, idx) => {
                  const isImported = importedIdxs.has(idx);
                  const isImporting = importingIdx === idx;

                  return (
                    <div
                      key={idx}
                      className={`rounded-lg border p-4 ${
                        isImported
                          ? "border-green-200 bg-green-500/10"
                          : "border-[#27272A] bg-[#0F0F11]"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-[#FAFAFA]">
                              {s.company_name}
                            </h3>
                            {s.confidence != null && (
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                s.confidence >= 0.8
                                  ? "bg-green-500/10 text-green-400"
                                  : s.confidence >= 0.6
                                    ? "bg-amber-500/10 text-amber-400"
                                    : "bg-[#27272A] text-[#71717A]"
                              }`}>
                                {Math.round(s.confidence * 100)}%
                              </span>
                            )}
                          </div>

                          {/* Address line */}
                          {getFullAddress(s) && (
                            <div className="mt-1 flex items-center gap-1 text-xs text-[#A1A1AA]">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {getFullAddress(s)}
                            </div>
                          )}

                          {/* Contact info line */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-[#71717A]">
                            {getContact(s, "phone") && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {getContact(s, "phone")}
                              </span>
                            )}
                            {getContact(s, "email") && (
                              <a
                                href={`mailto:${getContact(s, "email")}`}
                                className="flex items-center gap-1 text-[#3B82F6] hover:underline"
                              >
                                <Mail className="h-3 w-3" />
                                {getContact(s, "email")}
                              </a>
                            )}
                            {getContact(s, "website") && (
                              <a
                                href={getContact(s, "website")}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-[#F97316] hover:underline"
                              >
                                <Globe className="h-3 w-3" />
                                Site web
                              </a>
                            )}
                          </div>

                          {/* Specialties + CFC codes */}
                          {((s.specialties && s.specialties.length > 0) || (s.cfc_codes && s.cfc_codes.length > 0)) && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {s.cfc_codes?.map((code) => (
                                <span
                                  key={code}
                                  className="inline-flex items-center px-2 py-0.5 rounded bg-[#3B82F6]/10 text-[#3B82F6] text-[11px] font-mono font-medium"
                                >
                                  CFC {code}
                                </span>
                              ))}
                              {s.specialties?.map((sp) => (
                                <span
                                  key={sp}
                                  className="inline-flex items-center px-2 py-0.5 rounded bg-[#F97316]/10 text-[#F97316] text-[11px] font-medium"
                                >
                                  {getSpecialtyLabel(sp)}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Reasoning */}
                          {(s.reasoning || s.reason) && (
                            <p className="mt-2 text-xs text-[#71717A] italic">
                              {s.reasoning || s.reason}
                            </p>
                          )}
                        </div>

                        {/* Import button */}
                        <div className="ml-4 shrink-0">
                          {isImported ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                              <CheckCircle2 className="h-4 w-4" />
                              Importe
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleImportSuggestion(s, idx)}
                              disabled={isImporting}
                              className="inline-flex items-center gap-1 rounded-md bg-gold px-3 py-1.5 text-xs font-medium text-white hover:bg-gold-dark disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isImporting ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Plus className="h-3.5 w-3.5" />
                              )}
                              Importer
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Loading state */}
          {searching && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-brand mb-3" />
              <p className="text-sm text-[#71717A]">
                L&apos;IA recherche des fournisseurs correspondants...
              </p>
              <p className="text-xs text-[#71717A] mt-1">
                Cela peut prendre quelques secondes
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#27272A] px-5 py-3.5">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-[#71717A] hover:bg-[#27272A]"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
