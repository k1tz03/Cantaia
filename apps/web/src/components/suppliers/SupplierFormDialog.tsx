"use client";

import { useState, useEffect } from "react";
import { X, Loader2, AlertCircle, Star } from "lucide-react";
import {
  SUPPLIER_SPECIALTIES,
  SPECIALTY_LABELS,
  GEO_ZONES,
  type SupplierSpecialty,
} from "@cantaia/core/suppliers";
import type { Supplier, SupplierStatus, SupplierType } from "@cantaia/database";

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
  onSaved: () => void;
}

export function SupplierFormDialog({
  open,
  onOpenChange,
  supplier,
  onSaved,
}: SupplierFormDialogProps) {
  const isEdit = !!supplier;

  // Form state
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("Suisse");
  const [website, setWebsite] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [cfcCodesInput, setCfcCodesInput] = useState("");
  const [geoZone, setGeoZone] = useState("");
  const [certificationsInput, setCertificationsInput] = useState("");
  const [manualRating, setManualRating] = useState(0);
  const [supplierType, setSupplierType] = useState<SupplierType>("fournisseur");
  const [status, setStatus] = useState<SupplierStatus>("new");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setCompanyName(supplier?.company_name ?? "");
      setContactName(supplier?.contact_name ?? "");
      setEmail(supplier?.email ?? "");
      setPhone(supplier?.phone ?? "");
      setAddress(supplier?.address ?? "");
      setCity(supplier?.city ?? "");
      setPostalCode(supplier?.postal_code ?? "");
      setCountry(supplier?.country ?? "Suisse");
      setWebsite(supplier?.website ?? "");
      setSpecialties(supplier?.specialties ?? []);
      setCfcCodesInput(supplier?.cfc_codes?.join(", ") ?? "");
      setGeoZone(supplier?.geo_zone ?? "");
      setCertificationsInput(supplier?.certifications?.join(", ") ?? "");
      setManualRating(supplier?.manual_rating ?? 0);
      setSupplierType(supplier?.supplier_type ?? "fournisseur");
      setStatus(supplier?.status ?? "new");
      setNotes(supplier?.notes ?? "");
      setSaving(false);
      setError("");
      setSubmitted(false);
    }
  }, [open, supplier]);

  if (!open) return null;

  function toggleSpecialty(sp: string) {
    setSpecialties((prev) =>
      prev.includes(sp) ? prev.filter((s) => s !== sp) : [...prev, sp]
    );
  }

  function parseTags(input: string): string[] {
    return input
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  function getSpecialtyLabel(key: string): string {
    const labels = SPECIALTY_LABELS[key as SupplierSpecialty];
    return labels?.fr || key;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setError("");

    if (!companyName.trim()) return;

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        company_name: companyName.trim(),
        contact_name: contactName || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        city: city || null,
        postal_code: postalCode || null,
        country: country || "Suisse",
        website: website || null,
        specialties,
        cfc_codes: parseTags(cfcCodesInput),
        geo_zone: geoZone || null,
        certifications: parseTags(certificationsInput),
        manual_rating: manualRating,
        supplier_type: supplierType,
        status,
        notes: notes || null,
      };

      const url = isEdit ? `/api/suppliers/${supplier!.id}` : "/api/suppliers";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        let msg = `Erreur serveur (${res.status})`;
        try {
          const parsed = JSON.parse(text);
          if (parsed.error) msg = parsed.error;
        } catch {
          /* non-JSON response */
        }
        setError(msg);
        setSaving(false);
        return;
      }

      setSaving(false);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error("[SupplierFormDialog] Save error:", err);
      setError("Erreur reseau, veuillez reessayer");
      setSaving(false);
    }
  }

  const fieldErrorClass = "border-red-400 ring-1 ring-red-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-gray-900">
            {isEdit ? "Modifier le fournisseur" : "Ajouter un fournisseur"}
          </h2>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable form body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5">
            <div className="space-y-4">
              {/* Error banner */}
              {error && (
                <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Company name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Nom de l&apos;entreprise *
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className={`w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                    submitted && !companyName.trim() ? fieldErrorClass : "border-gray-300"
                  }`}
                  placeholder="Ex: Bati-Group SA"
                />
                {submitted && !companyName.trim() && (
                  <p className="mt-1 text-xs text-red-600">Champ obligatoire</p>
                )}
              </div>

              {/* Supplier type */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Type
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="supplier_type"
                      value="fournisseur"
                      checked={supplierType === "fournisseur"}
                      onChange={() => setSupplierType("fournisseur")}
                      className="h-3.5 w-3.5 border-gray-300 text-brand focus:ring-brand"
                    />
                    <span className="text-sm text-gray-700">Fournisseur (materiaux)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="supplier_type"
                      value="prestataire"
                      checked={supplierType === "prestataire"}
                      onChange={() => setSupplierType("prestataire")}
                      className="h-3.5 w-3.5 border-gray-300 text-brand focus:ring-brand"
                    />
                    <span className="text-sm text-gray-700">Prestataire (services)</span>
                  </label>
                </div>
              </div>

              {/* Contact name + Email */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Personne de contact
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                    placeholder="Jean Dupont"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                    placeholder="contact@example.ch"
                  />
                </div>
              </div>

              {/* Phone + Website */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Telephone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                    placeholder="+41 21 123 45 67"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Site web
                  </label>
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                    placeholder="https://www.example.ch"
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Adresse
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                  placeholder="Rue de l'Industrie 12"
                />
              </div>

              {/* City + Postal Code + Country */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    NPA
                  </label>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                    placeholder="1000"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Ville
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                    placeholder="Lausanne"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Pays
                  </label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                    placeholder="Suisse"
                  />
                </div>
              </div>

              {/* Specialties (multi-select checkboxes) */}
              <div>
                <label className="mb-2 block text-xs font-medium text-gray-700">
                  Specialites
                </label>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
                  {SUPPLIER_SPECIALTIES.map((sp) => (
                    <label
                      key={sp}
                      className="flex items-center gap-1.5 text-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={specialties.includes(sp)}
                        onChange={() => toggleSpecialty(sp)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-brand focus:ring-brand"
                      />
                      <span className="text-gray-700 text-xs">
                        {getSpecialtyLabel(sp)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* CFC Codes (tag input) */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Codes CFC
                </label>
                <input
                  type="text"
                  value={cfcCodesInput}
                  onChange={(e) => setCfcCodesInput(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                  placeholder="211, 271, 281 (separes par des virgules)"
                />
                {cfcCodesInput && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {parseTags(cfcCodesInput).map((tag) => (
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

              {/* Geo Zone */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Zone geographique
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

              {/* Certifications (tag input) */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Certifications
                </label>
                <input
                  type="text"
                  value={certificationsInput}
                  onChange={(e) => setCertificationsInput(e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                  placeholder="ISO 9001, Minergie, SIA (separes par des virgules)"
                />
                {certificationsInput && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {parseTags(certificationsInput).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-50 text-green-700 text-xs font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Manual Rating (stars) */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Note manuelle
                </label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setManualRating(i === manualRating ? 0 : i)}
                      className="p-0.5 hover:scale-110 transition-transform"
                    >
                      <Star
                        className={`h-5 w-5 ${
                          i <= manualRating
                            ? "fill-amber-400 text-amber-400"
                            : "text-gray-300"
                        }`}
                      />
                    </button>
                  ))}
                  {manualRating > 0 && (
                    <span className="ml-2 text-xs text-gray-500 self-center">
                      {manualRating}/5
                    </span>
                  )}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Statut
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as SupplierStatus)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none"
                >
                  <option value="new">Nouveau</option>
                  <option value="active">Actif</option>
                  <option value="preferred">Prefere</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Notes internes sur ce fournisseur..."
                />
              </div>
            </div>
          </div>

          {/* Fixed footer */}
          <div className="border-t border-gray-200 px-5 py-3.5">
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isEdit ? "Enregistrer" : "Ajouter"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
