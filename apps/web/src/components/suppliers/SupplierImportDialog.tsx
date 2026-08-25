"use client";

import { useEffect, useState } from "react";
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
  supplier_type?: string;
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
  "supplier_type",
];

/**
 * RFC 4180-ish CSV parser: honours quoted fields (embedded separators, quotes
 * escaped as "", and newlines inside quotes). A naive split by separator would
 * silently shift every column of a row whose field contains the separator
 * (e.g. an address, or "Dupont, Jean").
 */
function parseCsvRows(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === separator) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // Handled together with the following \n; ignore standalone \r.
    } else {
      field += ch;
    }
  }
  // Trailing field / row (no final newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully-empty rows.
  return rows.filter((r) => r.some((v) => v.trim().length > 0));
}

function parseCSV(csvText: string): { rows: ParsedRow[]; parseErrors: string[] } {
  // Detect separator from the first non-empty physical line.
  const firstLine = csvText.split(/\r?\n/).find((l) => l.trim().length > 0) || "";
  const separator = firstLine.includes(";") ? ";" : ",";

  const raw = parseCsvRows(csvText, separator);

  if (raw.length < 2) {
    return { rows: [], parseErrors: ["Le CSV doit contenir au moins un en-tete et une ligne de donnees."] };
  }

  const headers = raw[0].map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

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

  for (let i = 1; i < raw.length; i++) {
    const values = raw[i].map((v) => v.trim());
    const record: Record<string, any> = {};

    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      const val = values[j] || "";
      if (!key) continue;

      if (key === "specialties" || key === "cfc_codes") {
        record[key] = val
          ? val.split(/[|,]/).map((s: string) => s.trim()).filter((s: string) => s)
          : [];
      } else {
        record[key] = val || undefined;
      }
    }

    if (!record.company_name) {
      parseErrors.push(`Ligne ${i + 1}: company_name manquant, ligne ignoree`);
      continue;
    }

    rows.push(record as ParsedRow);
  }

  return { rows, parseErrors };
}

/**
 * Decode an uploaded CSV. FileReader.readAsText assumes UTF-8, but Swiss Excel
 * exports are often Windows-1252 (accents arrive mangled). Try UTF-8 strictly
 * first, then fall back to windows-1252.
 */
async function decodeCsvFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder("windows-1252").decode(buffer);
    } catch {
      return new TextDecoder("utf-8").decode(buffer);
    }
  }
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

  // Escape to close (parity with the shared Dialog behaviour).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !importing) handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, importing]);

  if (!open) return null;

  function handleParse() {
    const { rows, parseErrors: errors } = parseCSV(csvText);
    setParsedRows(rows);
    setParseErrors(errors);
    setIsParsed(true);
    setResult(null);
    setApiError("");
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await decodeCsvFile(file);
    setCsvText(text);
    const { rows, parseErrors: errors } = parseCSV(text);
    setParsedRows(rows);
    setParseErrors(errors);
    setIsParsed(true);
    setResult(null);
    setApiError("");
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Importer des fournisseurs"
        className="w-full max-w-3xl rounded-lg bg-[#0F0F11] shadow-xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#27272A] px-5 py-3.5">
          <h2 className="text-sm font-semibold text-[#FAFAFA]">
            Importer des fournisseurs (CSV)
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Result banner */}
          {result && (
            <div className="mb-4 rounded-md bg-[#10B981]/10 px-4 py-3 ring-1 ring-inset ring-[#10B981]/20">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-[#34D399]" />
                <span className="text-sm font-medium text-[#34D399]">Import termine</span>
              </div>
              <p className="text-sm text-[#A1A1AA]">
                {result.imported} importe(s), {result.skipped} ignore(s)
              </p>
              {result.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-[#F87171]">
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {apiError && (
            <div className="mb-4 flex items-center gap-2 rounded-md bg-[#EF4444]/10 px-3 py-2 text-sm text-[#F87171] ring-1 ring-inset ring-[#EF4444]/20">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {apiError}
            </div>
          )}

          {!result && (
            <>
              {/* File input */}
              <div className="mb-4">
                <label className="flex items-center gap-2 text-xs font-medium text-[#FAFAFA] mb-2">
                  <FileText className="h-4 w-4" />
                  Fichier CSV
                </label>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-[#A1A1AA] file:mr-3 file:rounded-md file:border-0 file:bg-[#F97316] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#0F0F11] hover:file:bg-[#EA580C] file:cursor-pointer"
                />
              </div>

              {/* Or paste CSV */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-[#FAFAFA] mb-1">
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
                  className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] font-mono placeholder-[#71717A] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]"
                  placeholder={`company_name;contact_name;email;phone;city;specialties;geo_zone;supplier_type\nBati-Group SA;Jean Dupont;contact@bati.ch;+41 21 123 45 67;Lausanne;gros_oeuvre|electricite;VD;fournisseur`}
                />
              </div>

              {/* Parse button */}
              {!isParsed && csvText.trim() && (
                <button
                  type="button"
                  onClick={handleParse}
                  className="mb-4 inline-flex items-center gap-1.5 rounded-md bg-[#27272A] px-3 py-1.5 text-sm font-medium text-[#FAFAFA] hover:bg-[#3F3F46]"
                >
                  Analyser le CSV
                </button>
              )}

              {/* Parse errors */}
              {parseErrors.length > 0 && (
                <div className="mb-4 space-y-1">
                  {parseErrors.map((err, i) => (
                    <p key={i} className="text-xs text-[#FBBF24]">
                      {err}
                    </p>
                  ))}
                </div>
              )}

              {/* Preview table */}
              {isParsed && parsedRows.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-[#FAFAFA] mb-2">
                    Apercu : {parsedRows.length} fournisseur(s) detecte(s)
                  </p>
                  <div className="overflow-auto max-h-[240px] border border-[#27272A] rounded-lg">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#27272A] border-b border-[#27272A]">
                          <th className="text-left px-3 py-2 font-medium text-[#A1A1AA]">#</th>
                          <th className="text-left px-3 py-2 font-medium text-[#A1A1AA]">Entreprise</th>
                          <th className="text-left px-3 py-2 font-medium text-[#A1A1AA]">Contact</th>
                          <th className="text-left px-3 py-2 font-medium text-[#A1A1AA]">Email</th>
                          <th className="text-left px-3 py-2 font-medium text-[#A1A1AA]">Ville</th>
                          <th className="text-left px-3 py-2 font-medium text-[#A1A1AA]">Zone</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#27272A]">
                        {parsedRows.map((row, i) => (
                          <tr key={i} className="hover:bg-[#27272A]">
                            <td className="px-3 py-1.5 text-[#A1A1AA]">{i + 1}</td>
                            <td className="px-3 py-1.5 text-[#FAFAFA] font-medium">{row.company_name}</td>
                            <td className="px-3 py-1.5 text-[#A1A1AA]">{row.contact_name || "—"}</td>
                            <td className="px-3 py-1.5 text-[#A1A1AA]">{row.email || "—"}</td>
                            <td className="px-3 py-1.5 text-[#A1A1AA]">{row.city || "—"}</td>
                            <td className="px-3 py-1.5 text-[#A1A1AA]">{row.geo_zone || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {isParsed && parsedRows.length === 0 && (
                <p className="text-sm text-[#A1A1AA] mb-4">
                  Aucun fournisseur valide detecte dans le CSV.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#27272A] px-5 py-3.5">
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-[#A1A1AA] hover:bg-[#27272A]"
            >
              {result ? "Fermer" : "Annuler"}
            </button>
            {!result && isParsed && parsedRows.length > 0 && (
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-[#0F0F11] hover:bg-[#EA580C] disabled:opacity-50 disabled:cursor-not-allowed"
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
