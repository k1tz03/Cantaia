"use client";

import { useState } from "react";
import { X, Loader2, Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react";

interface ParsedRow {
  company_name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  website?: string;
  specialties?: string[];
  cfc_codes?: string[];
  geo_zone?: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

interface SupplierImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

const EXPECTED_HEADERS = [
  "company_name",
  "contact_name",
  "email",
  "phone",
  "address",
  "city",
  "postal_code",
  "website",
  "specialties",
  "cfc_codes",
  "geo_zone",
];

function parseCSV(csvText: string): { rows: ParsedRow[]; parseErrors: string[] } {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { rows: [], parseErrors: ["Le CSV doit contenir au moins un en-tete et une ligne de donnees."] };
  }

  // Detect separator: semicolon or comma
  const headerLine = lines[0];
  const separator = headerLine.includes(";") ? ";" : ",";

  const headers = headerLine.split(separator).map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

  const companyNameIdx = headers.indexOf("company_name");
  if (companyNameIdx === -1) {
    // Try with French column name
    const altIdx = headers.findIndex(
      (h) => h === "entreprise" || h === "nom" || h === "societe" || h === "raison_sociale"
    );
    if (altIdx === -1) {
      return {
        rows: [],
        parseErrors: [
          'Colonne "company_name" introuvable. Colonnes attendues: ' +
            EXPECTED_HEADERS.join(", "),
        ],
      };
    }
    headers[altIdx] = "company_name";
  }

  const rows: ParsedRow[] = [];
  const parseErrors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(separator).map((v) => v.trim().replace(/^["']|["']$/g, ""));
    const row: Record<string, any> = {};

    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      const val = values[j] || "";
      if (!key) continue;

      if (key === "specialties" || key === "cfc_codes") {
        row[key] = val
          ? val.split(/[|,]/).map((s: string) => s.trim()).filter((s: string) => s)
          : [];
      } else {
        row[key] = val || undefined;
      }
    }

    if (!row.company_name) {
      parseErrors.push(`Ligne ${i + 1}: company_name manquant, ligne ignoree`);
      continue;
    }

    rows.push(row as ParsedRow);
  }

  return { rows, parseErrors };
}

export function SupplierImportDialog({
  open,
  onOpenChange,
  onImported,
}: SupplierImportDialogProps) {
  const [csvText, setCsvText] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isParsed, setIsParsed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [apiError, setApiError] = useState("");

  if (!open) return null;

  function handleParse() {
    const { rows, parseErrors: errors } = parseCSV(csvText);
    setParsedRows(rows);
    setParseErrors(errors);
    setIsParsed(true);
    setResult(null);
    setApiError("");
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      // Auto-parse after file load
      const { rows, parseErrors: errors } = parseCSV(text);
      setParsedRows(rows);
      setParseErrors(errors);
      setIsParsed(true);
      setResult(null);
      setApiError("");
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (parsedRows.length === 0) return;
    setImporting(true);
    setApiError("");

    try {
      const res = await fetch("/api/suppliers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsedRows }),
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
        setApiError(msg);
        setImporting(false);
        return;
      }

      const data: ImportResult = await res.json();
      setResult(data);
      setImporting(false);

      if (data.imported > 0) {
        onImported();
      }
    } catch (err) {
      console.error("[SupplierImportDialog] Import error:", err);
      setApiError("Erreur reseau, veuillez reessayer");
      setImporting(false);
    }
  }

  function handleClose() {
    setCsvText("");
    setParsedRows([]);
    setParseErrors([]);
    setIsParsed(false);
    setResult(null);
    setApiError("");
    setImporting(false);
    onOpenChange(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-gray-900">
            Importer des fournisseurs (CSV)
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Result banner */}
          {result && (
            <div className="mb-4 rounded-md bg-green-50 px-4 py-3 ring-1 ring-inset ring-green-200">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">Import termine</span>
              </div>
              <p className="text-sm text-green-700">
                {result.imported} importe(s), {result.skipped} ignore(s)
              </p>
              {result.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-red-600">
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {apiError && (
            <div className="mb-4 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {apiError}
            </div>
          )}

          {!result && (
            <>
              {/* File input */}
              <div className="mb-4">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                  <FileText className="h-4 w-4" />
                  Fichier CSV
                </label>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-gold file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-gold-dark file:cursor-pointer"
                />
              </div>

              {/* Or paste CSV */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Ou collez vos donnees CSV
                </label>
                <textarea
                  value={csvText}
                  onChange={(e) => {
                    setCsvText(e.target.value);
                    setIsParsed(false);
                    setResult(null);
                  }}
                  rows={6}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 font-mono placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={`company_name;contact_name;email;phone;city;specialties;geo_zone\nBati-Group SA;Jean Dupont;contact@bati.ch;+41 21 123 45 67;Lausanne;gros_oeuvre|electricite;VD`}
                />
              </div>

              {/* Parse button */}
              {!isParsed && csvText.trim() && (
                <button
                  type="button"
                  onClick={handleParse}
                  className="mb-4 inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  Analyser le CSV
                </button>
              )}

              {/* Parse errors */}
              {parseErrors.length > 0 && (
                <div className="mb-4 space-y-1">
                  {parseErrors.map((err, i) => (
                    <p key={i} className="text-xs text-amber-600">
                      {err}
                    </p>
                  ))}
                </div>
              )}

              {/* Preview table */}
              {isParsed && parsedRows.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-700 mb-2">
                    Apercu : {parsedRows.length} fournisseur(s) detecte(s)
                  </p>
                  <div className="overflow-auto max-h-[240px] border border-gray-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-3 py-2 font-medium text-gray-500">#</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Entreprise</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Contact</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Email</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Ville</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Zone</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {parsedRows.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                            <td className="px-3 py-1.5 text-gray-900 font-medium">{row.company_name}</td>
                            <td className="px-3 py-1.5 text-gray-600">{row.contact_name || "—"}</td>
                            <td className="px-3 py-1.5 text-gray-600">{row.email || "—"}</td>
                            <td className="px-3 py-1.5 text-gray-600">{row.city || "—"}</td>
                            <td className="px-3 py-1.5 text-gray-600">{row.geo_zone || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {isParsed && parsedRows.length === 0 && (
                <p className="text-sm text-gray-500 mb-4">
                  Aucun fournisseur valide detecte dans le CSV.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-5 py-3.5">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              {result ? "Fermer" : "Annuler"}
            </button>
            {!result && isParsed && parsedRows.length > 0 && (
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="inline-flex items-center gap-1.5 rounded-md bg-gold px-4 py-2 text-sm font-medium text-white hover:bg-gold-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Importer {parsedRows.length} fournisseur(s)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
