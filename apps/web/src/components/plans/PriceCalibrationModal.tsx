"use client";

import React, { useState, useMemo } from "react";
type PriceSource = 'historique_interne' | 'donnees_communautaires' | 'benchmark_cantaia' | 'referentiel_crb' | 'ratio_estimation' | 'estimation_ia' | 'consensus_multi_ia' | 'prix_non_disponible';

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
    historique_interne: { label: "Historique", className: "bg-[#10B981]/10 text-[#10B981]" },
    // Agrégat cross-organisations (mv_reference_prices) — pas l'historique
    // de l'utilisateur, cf. B11.
    donnees_communautaires: { label: "Communautaire", className: "bg-[#10B981]/10 text-[#10B981]" },
    benchmark_cantaia: { label: "Benchmark", className: "bg-[#3B82F6]/10 text-[#3B82F6]" },
    referentiel_crb: { label: "CRB", className: "bg-[#F59E0B]/10 text-[#F59E0B]" },
    ratio_estimation: { label: "Ratio", className: "bg-[#F97316]/10 text-[#F97316]" },
    estimation_ia: { label: "IA", className: "bg-[#EF4444]/10 text-[#EF4444]" },
    consensus_multi_ia: { label: "Consensus IA", className: "bg-[#F97316]/10 text-[#F97316]" },
    prix_non_disponible: { label: "Non dispo.", className: "bg-[#27272A] text-[#A1A1AA]" },
  };
  const c = config[source] ?? config.prix_non_disponible;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.className}`}>{c.label}</span>;
}

interface Props {
  poste: PosteChiffre;
  onSave: (data: { prix_reel: number; source: string; fournisseur_nom?: string }) => Promise<void>;
  onClose: () => void;
  /** Erreur d'enregistrement remontée par le parent (cf. B3/B9). */
  error?: string;
}

const SOURCES = [
  { value: 'offre_fournisseur', label: 'Offre fournisseur' },
  { value: 'decompte_final', label: 'Décompte final' },
  { value: 'correction_manuelle', label: 'Correction manuelle' },
];

export default function PriceCalibrationModal({ poste, onSave, onClose, error }: Props) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#18181B] border border-[#27272A] rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-[#FAFAFA] mb-4">Renseigner un prix réel</h3>

        <div className="space-y-4">
          {/* Poste info */}
          <div className="bg-[#0F0F11] border border-[#27272A] rounded-lg p-3">
            <div className="text-xs text-[#A1A1AA]">Poste</div>
            <div className="font-medium text-[#FAFAFA]">{poste.cfc_code} — {poste.description}</div>
          </div>

          {/* Prix estimé */}
          <div>
            <label className="text-sm text-[#A1A1AA]">Prix estimé (fourchette)</label>
            <div className="flex items-center gap-2 mt-1">
              <div className="bg-[#27272A] text-[#FAFAFA] rounded px-3 py-2 font-mono text-sm">
                {formatCHF(poste.prix_unitaire.min)} — <span className="font-semibold">{formatCHF(poste.prix_unitaire.median)}</span> — {formatCHF(poste.prix_unitaire.max)} CHF/{poste.unite}
              </div>
              <SourceBadge source={poste.prix_unitaire.source} />
            </div>
          </div>

          {/* Prix réel */}
          <div>
            <label className="text-sm text-[#A1A1AA]">Prix réel (CHF/{poste.unite})</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                step="0.01"
                value={prixReel}
                onChange={(e) => setPrixReel(e.target.value)}
                className="bg-[#0F0F11] text-[#FAFAFA] border border-[#27272A] rounded-lg px-3 py-2 font-mono text-lg w-40 focus:outline-none focus:ring-2 focus:ring-[#F97316]"
                placeholder="0.00"
              />
              <span className="text-sm text-[#A1A1AA]">CHF/{poste.unite}</span>
              {ecartPct !== null && (
                <span className={`text-sm font-medium ${ecartPct > 0 ? 'text-[#EF4444]' : ecartPct < 0 ? 'text-[#10B981]' : 'text-[#A1A1AA]'}`}>
                  {ecartPct > 0 ? '+' : ''}{ecartPct}%
                </span>
              )}
            </div>
          </div>

          {/* Source */}
          <div>
            <label className="text-sm text-[#A1A1AA]">Source du prix réel</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="w-full bg-[#0F0F11] text-[#FAFAFA] border border-[#27272A] rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-[#F97316]"
            >
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Fournisseur */}
          <div>
            <label className="text-sm text-[#A1A1AA]">Fournisseur (optionnel)</label>
            <input
              type="text"
              value={fournisseur}
              onChange={(e) => setFournisseur(e.target.value)}
              className="w-full bg-[#0F0F11] text-[#FAFAFA] border border-[#27272A] rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-[#F97316]"
              placeholder="Nom du fournisseur"
            />
            <div className="text-xs text-[#A1A1AA] mt-1">
              Le nom sera anonymisé (hash SHA-256) dans les benchmarks agrégés.
            </div>
          </div>

          {/* Info */}
          <div className="text-xs text-[#A1A1AA] bg-[#F97316]/10 rounded p-2">
            Ce prix réel calibrera automatiquement les estimations futures pour ce type de poste.
          </div>

          {error && (
            <div className="rounded border border-[#EF4444]/30 bg-[#EF4444]/10 p-2 text-xs text-[#EF4444]">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-[#A1A1AA] hover:text-[#FAFAFA]">
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !prixReel}
              className="px-4 py-2 bg-[#F97316] text-[#0F0F11] rounded-lg text-sm font-medium hover:bg-[#EA580C] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
