"use client";

import React, { useState, useMemo } from "react";
type ModelProvider = 'claude' | 'gpt4o' | 'gemini';

interface PosteChiffre {
  cfc_code: string;
  cfc_libelle: string;
  description: string;
  quantite: number;
  unite: string;
  prix_unitaire: any;
  total: { min: number | null; median: number | null; max: number | null };
  confiance_quantite: string;
  confiance_prix: string;
  confiance_combinee: string;
  note: string | null;
}

interface Props {
  poste: PosteChiffre;
  consensusValeurs?: Array<{ provider: ModelProvider; quantite: number; ecart_vs_median_pct: number }>;
  consensusMethode?: string;
  onSave: (data: { quantite_corrigee: number; raison: string; commentaire?: string }) => Promise<void>;
  onClose: () => void;
}

const RAISONS = [
  { value: 'erreur_lecture', label: 'Erreur de lecture sur le plan' },
  { value: 'mauvaise_echelle', label: 'Mauvaise échelle appliquée' },
  { value: 'double_comptage', label: 'Double comptage détecté' },
  { value: 'element_manque', label: 'Élément manquant (non détecté)' },
  { value: 'element_en_trop', label: 'Élément en trop (n\'existe pas)' },
  { value: 'mauvaise_unite', label: 'Mauvaise unité de mesure' },
  { value: 'autre', label: 'Autre raison' },
];

export default function QuantityCorrectionModal({ poste, consensusValeurs, consensusMethode, onSave, onClose }: Props) {
  const [quantiteCorrigee, setQuantiteCorrigee] = useState<string>(String(poste.quantite));
  const [raison, setRaison] = useState<string>('');
  const [commentaire, setCommentaire] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [saving, setSaving] = useState(false);

  const ecartPct = useMemo(() => {
    const val = parseFloat(quantiteCorrigee);
    if (isNaN(val) || poste.quantite === 0) return 0;
    return Math.round(((val - poste.quantite) / poste.quantite) * 100 * 10) / 10;
  }, [quantiteCorrigee, poste.quantite]);

  const handleSave = async () => {
    const val = parseFloat(quantiteCorrigee);
    if (isNaN(val) || !raison) return;
    setSaving(true);
    try {
      await onSave({ quantite_corrigee: val, raison, commentaire: commentaire || undefined });
      onClose();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-background rounded-xl shadow-2xl max-w-lg w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-[#0A1F30] mb-4">Corriger la quantité</h3>

        <div className="space-y-4">
          {/* Poste info */}
          <div className="bg-[#F5F2EB] rounded-lg p-3">
            <div className="text-xs text-[#8A9CA8]">Poste</div>
            <div className="font-medium text-[#0A1F30]">{poste.cfc_code} — {poste.description}</div>
          </div>

          {/* Valeur estimée */}
          <div>
            <label className="text-sm text-[#8A9CA8]">Valeur estimée (non modifiable)</label>
            <div className="flex items-center gap-2 mt-1">
              <div className="bg-muted rounded px-3 py-2 font-mono text-lg">{poste.quantite}</div>
              <span className="text-sm text-[#8A9CA8]">{poste.unite}</span>
              {consensusMethode && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                  {consensusMethode}
                </span>
              )}
            </div>
          </div>

          {/* Détail par modèle */}
          {consensusValeurs && consensusValeurs.length > 0 && (
            <div>
              <button onClick={() => setShowDetail(!showDetail)} className="text-xs text-[#C4A661] hover:underline">
                {showDetail ? 'Masquer' : 'Voir'} le détail par modèle
              </button>
              {showDetail && (
                <div className="mt-2 space-y-1">
                  {consensusValeurs.map((v) => (
                    <div key={v.provider} className="flex justify-between text-sm bg-muted rounded px-3 py-1">
                      <span className="capitalize">{v.provider}</span>
                      <span className="font-mono">{v.quantite} ({v.ecart_vs_median_pct > 0 ? '+' : ''}{Math.round(v.ecart_vs_median_pct)}%)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quantité corrigée */}
          <div>
            <label className="text-sm text-[#8A9CA8]">Quantité corrigée</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                step="0.01"
                value={quantiteCorrigee}
                onChange={(e) => setQuantiteCorrigee(e.target.value)}
                className="border border-border rounded-lg px-3 py-2 font-mono text-lg w-40 focus:outline-none focus:ring-2 focus:ring-[#C4A661]"
              />
              <span className="text-sm text-[#8A9CA8]">{poste.unite}</span>
              {ecartPct !== 0 && (
                <span className={`text-sm font-medium ${ecartPct > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                  {ecartPct > 0 ? '+' : ''}{ecartPct}%
                </span>
              )}
            </div>
          </div>

          {/* Raison */}
          <div>
            <label className="text-sm text-[#8A9CA8]">Raison de la correction</label>
            <select
              value={raison}
              onChange={(e) => setRaison(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-[#C4A661]"
            >
              <option value="">Sélectionner...</option>
              {RAISONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* Commentaire */}
          <div>
            <label className="text-sm text-[#8A9CA8]">Commentaire (optionnel)</label>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={2}
              className="w-full border border-border rounded-lg px-3 py-2 mt-1 focus:outline-none focus:ring-2 focus:ring-[#C4A661] resize-none"
              placeholder="Précisions sur la correction..."
            />
          </div>

          {/* Message info */}
          <div className="text-xs text-[#8A9CA8] bg-primary/10 rounded p-2">
            Cette correction améliorera les futures estimations sur ce type d'élément.
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !raison || !quantiteCorrigee}
              className="px-4 py-2 bg-[#0A1F30] text-white rounded-lg text-sm hover:bg-[#0A1F30]/90 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer la correction'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
