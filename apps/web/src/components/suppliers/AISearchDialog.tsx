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
  AlertCircle,
} from "lucide-react";
import {
  SUPPLIER_SPECIALTIES,
  SPECIALTY_LABELS,
  GEO_ZONES,
  type SupplierSpecialty,
} from "@cantaia/core/suppliers";

interface AISuggestion {
  company_name: string;
  contact_info?: string;
  email?: string;
  phone?: string;
  website?: string;
  city?: string;
  specialties?: string[];
  cfc_codes?: string[];
  geo_zone?: string;
  reason?: string;
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
    if (codes.length === 0 || !specialty || !geoZone) return;

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
          cfc_codes: codes,
          specialty,
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

  async function handleImportSuggestion(suggestion: AISuggestion, idx: number) {
    setImportingIdx(idx);
    setImportError("");

    try {
      const payload: Record<string, any> = {
        company_name: suggestion.company_name,
        email: suggestion.email || null,
        phone: suggestion.phone || null,
        website: suggestion.website || null,
        city: suggestion.city || null,
        specialties: suggestion.specialties || [],
        cfc_codes: suggestion.cfc_codes || [],
        geo_zone: suggestion.geo_zone || geoZone || null,
        status: "new",
        notes: suggestion.reason
          ? `Source: Recherche IA. ${suggestion.reason}`
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
    parseCfcCodes(cfcCodesInput).length > 0 && specialty && geoZone;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-semibold text-gray-900">
              Recherche IA de fournisseurs
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Search form */}
          <div className="space-y-4 mb-6">
            {/* CFC Codes */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Codes CFC *
              </label>
              <input
                type="text"
                value={cfcCodesInput}
                onChange={(e) => setCfcCodesInput(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                placeholder="211, 271, 281 (separes par des virgules)"
              />
              {cfcCodesInput && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {parseCfcCodes(cfcCodesInput).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs font-mono"
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
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Specialite *
                </label>
                <select
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">-- Selectionner --</option>
                  {SUPPLIER_SPECIALTIES.map((sp) => (
                    <option key={sp} value={sp}>
                      {getSpecialtyLabel(sp)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Zone geographique *
                </label>
                <select
                  value={geoZone}
                  onChange={(e) => setGeoZone(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
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
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Description du projet (optionnel)
              </label>
              <textarea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                placeholder="Ex: Construction d'un immeuble de bureaux, 5 etages, Lausanne centre"
              />
            </div>

            {/* Search button */}
            <button
              type="button"
              onClick={handleSearch}
              disabled={!canSearch || searching}
              className="inline-flex items-center gap-1.5 rounded-md bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-dark disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="mb-4 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {searchError}
            </div>
          )}

          {importError && (
            <div className="mb-4 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {importError}
            </div>
          )}

          {/* Results */}
          {hasSearched && !searching && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-3">
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
                          ? "border-green-200 bg-green-50"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-gray-900">
                            {s.company_name}
                          </h3>

                          {/* Contact info line */}
                          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                            {s.city && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {s.city}
                              </span>
                            )}
                            {s.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {s.phone}
                              </span>
                            )}
                            {s.website && (
                              <a
                                href={s.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-blue-600 hover:underline"
                              >
                                <Globe className="h-3 w-3" />
                                Site web
                              </a>
                            )}
                          </div>

                          {/* Specialties */}
                          {s.specialties && s.specialties.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {s.specialties.map((sp) => (
                                <span
                                  key={sp}
                                  className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-medium"
                                >
                                  {getSpecialtyLabel(sp)}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Reason */}
                          {s.reason && (
                            <p className="mt-2 text-xs text-gray-500 italic">
                              {s.reason}
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
              <p className="text-sm text-gray-500">
                L&apos;IA recherche des fournisseurs correspondants...
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Cela peut prendre quelques secondes
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-5 py-3.5">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
