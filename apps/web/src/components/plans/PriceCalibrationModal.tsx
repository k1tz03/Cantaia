"use client";

import React, { useState, useMemo } from "react";
type PriceSource = 'historique_interne' | 'benchmark_cantaia' | 'referentiel_crb' | 'ratio_estimation' | 'estimation_ia' | 'consensus_multi_ia' | 'prix_non_disponible';

interface PosteChiffre {
  cfc_code: string;
  description: string;
  quantite: number;
  unite: string;
  prix_unitaire: { min: number | null; median: number | null; max: number | null; source: PriceSource; detail_source: string };
  total: { min: number | null; median: number | null; max: number | null };
  confiance_quantite: string;
  confiance_prix: string;
  note: string | null;
}

function formatCHF(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

function SourceBadge({ source }: { source: PriceSource }) {
  const config: Record<string, { label: string; className: string }> = {
    historique_interne: { label: "Historique", className: "bg-green-100 text-green-800 dark:text-green-300" },
    benchmark_cantaia: { label: "Benchmark", className: "bg-blue-100 text-blue-800 dark:text-blue-300" },
    referentiel_crb: { label: "CRB", className: "bg-yellow-100 text-yellow-800 dark:text-yellow-300" },
    ratio_estimation: { label: "Ratio", className: "bg-orange-100 text-orange-800 dark:text-orange-300" },
    estimation_ia: { label: "IA", className: "bg-red-100 text-red-800 dark:text-red-300" },
    consensus_multi_ia: { label: "Consensus IA", className: "bg-orange-100 text-orange-800 dark:text-orange-300" },
    prix_non_disponible: { label: "Non dispo.", className: "bg-[#27272A] text-[#71717A]" },
  };
  const c = config[source] ?? config.prix_non_disponible;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.className}`}>{c.label}</span>;
}

interface Props {
  poste: PosteChiffre;
  onSave: (data: { prix_reel: number; source: string; fournisseur_nom?: string }) => Promise<void>;
  onClose: () => void;
}

const SOURCES = [
  { value: 'offre_fournisseur', label: 'Offre fournisseur' },
  { value: 'decompte_final', label: 'Décompte final' },
  { value: 'correction_manuelle', label: 'Correction manuelle' },
];

export default function PriceCalibrationModal({ poste, onSave, onClose }: Props) {
  const [prixReel, setPrixReel] = useState<string>('');
  const [source, setSource] = useState<string>('offre_fournisseur');
  const [fournisseur, setFournisseur] = useState('');
  const [saving, setSaving] = useState(false);

  const ecartPct = useMemo(() => {
    const val = parseFloat(prixReel);
    if (isNaN(val) || !poste.prix_unitaire.median) return null;
    return Math.round(((val - poste.prix_unitaire.median) / poste.prix_unitaire.median) * 100 * 10) / 10;
  }, [prixReel, poste.prix_unitaire.median]);

  const handleSave = async () => {
    const val = parseFloat(prixReel);
    if (isNaN(val) || !source) return;
    setSaving(true);
    try {
      await onSave({ prix_reel: val, source, fournisseur_nom: fournisseur || undefined });
      onClose();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-[#0F0F11] rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-[#0A1F30] mb-4">Renseigner un prix réel</h3>

        <div className="space-y-4">
          {/* Poste info */}
          <div className="bg-[#F5F2EB] rounded-lg p-3">
            <div className="text-xs text-[#8A9CA8]">Poste</div>
            <div className="font-medium text-[#0A1F30]">{poste.cfc_code} — {poste.description}</div>
          </div>

          {/* Prix estimé */}
          <div>
            <label className="text-sm text-[#8A9CA8]">Prix estimé (fourchette)</label>
            <div className="flex items-center gap-2 mt-1">
              <div className="bg-[#27272A] rounded px-3 py-2 font-mono text-sm">
                {formatCHF(poste.prix_unitaire.min)} — <span className="font-semibold">{formatCHF(poste.prix_unitaire.median)}</span> — {formatCHF(poste.prix_unitaire.max)} CHF/{poste.unite}
              </div>
              <SourceBadge source={poste.prix_unitaire.source} />
            </div>
          </div>

          {/* Prix réel */}
          <div>
            <label className="text-sm text-[#8A9CA8]">Prix réel (CHF/{poste.unite})</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                step="0.01"
                value={prixReel}
                onChange={(e) => setPrixReel(e.target.value)}
                className="border border-[#27272A] rounded-lg px-3 py-2 font-mono text-lg w-40 focus:outline-none focus:ring-2 focus:ring-[#C4A661]"
                placeholder="0.00"
              />
              <span className="text-sm text-[#8A9CA8]">CHF/{poste.unite}</span>
              {ecartPct !== null && (
                <span className={`text-sm font-medium ${ecartPct > 0 ? 'text-red-500' : ecartPct < 0 ? 'text-green-500' : 'text-[#71717A]'}`}>
                  {ecartPct > 0 ? '+' : ''}{ecartPct}%
                </span>
              )}
            </div>
          </div>

          {/* Source */}
          <div>
            <label className="text-sm text-[#8A9CA8]">Source du prix réel</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full border border-[#27272A] rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-[#C4A661]"
            >
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Fournisseur */}
          <div>
            <label className="text-sm text-[#8A9CA8]">Fournisseur (optionnel)</label>
            <input
              type="text"
              value={fournisseur}
              onChange={(e) => setFournisseur(e.target.value)}
              className="w-full border border-[#27272A] rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-[#C4A661]"
              placeholder="Nom du fournisseur"
            />
            <div className="text-xs text-[#8A9CA8] mt-1">
              Le nom sera anonymisé (hash SHA-256) dans les benchmarks agrégés.
            </div>
          </div>

          {/* Info */}
          <div className="text-xs text-[#8A9CA8] bg-[#F97316]/10 rounded p-2">
            Ce prix réel calibrera automatiquement les estimations futures pour ce type de poste.
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-[#71717A] hover:text-[#FAFAFA]">
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !prixReel}
              className="px-4 py-2 bg-[#0A1F30] text-white rounded-lg text-sm hover:bg-[#0A1F30]/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
