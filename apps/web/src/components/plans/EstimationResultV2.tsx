"use client";

import React, { useState } from "react";
// Types inline pour éviter les problèmes de résolution de module
type PriceSource = 'historique_interne' | 'benchmark_cantaia' | 'referentiel_crb' | 'ratio_estimation' | 'estimation_ia' | 'consensus_multi_ia' | 'prix_non_disponible';
type ConfidenceLevel = 'high' | 'medium' | 'low' | 'assumption';

interface PrixUnitaire {
  min: number | null;
  median: number | null;
  max: number | null;
  source: PriceSource;
  detail_source: string;
  date_reference: string;
  ajustements: string[];
}

interface PosteChiffre {
  cfc_code: string;
  cfc_libelle: string;
  description: string;
  quantite: number;
  unite: string;
  prix_unitaire: PrixUnitaire;
  total: { min: number | null; median: number | null; max: number | null };
  confiance_quantite: ConfidenceLevel;
  confiance_prix: 'high' | 'medium' | 'low' | 'estimation';
  confiance_combinee: string;
  note: string | null;
}

interface EstimationPipelineResult {
  plan_id: string;
  project_id: string;
  org_id: string;
  created_at: string;
  passe1: any;
  consensus_metrage: { postes: any[]; modeles_utilises: string[]; modeles_en_erreur: { provider: string; error: string }[]; stats: { total_postes: number; concordance_forte_pct: number; concordance_partielle_pct: number; divergence_pct: number; score_consensus_global: number } };
  passe3: { alertes_coherence: { severite: string; poste_concerne: string; probleme: string; suggestion: string }[]; doublons_potentiels: any[]; elements_probablement_manquants: { cfc_code: string; description: string; raison: string; impact_estimation: string; quantite_estimee: string | null }[]; score_fiabilite_metrage: { score: number } };
  passe4: { parametres_estimation: any; estimation_par_cfc: { cfc_code: string; cfc_libelle: string; postes: PosteChiffre[]; sous_total_cfc: { min: number; median: number; max: number } }[]; recapitulatif: { sous_total_travaux: { min: number; median: number; max: number }; frais_generaux: { pourcentage: number; montant_median: number }; benefice_risques: { pourcentage: number; montant_median: number }; divers_imprevus: { pourcentage: number; montant_median: number }; total_estimation: { min: number; median: number; max: number }; prix_au_m2_sbp: { min: number; median: number; max: number }; plage_reference_m2_sbp: { min: number; max: number; source: string } }; analyse_fiabilite: { score_global: number; repartition_sources: Record<string, number>; postes_a_risque: any[]; recommandation_globale: string; prochaines_etapes: string[] }; comparaison_marche: { prix_m2_estime: number; prix_m2_marche_bas: number; prix_m2_marche_median: number; prix_m2_marche_haut: number; position: string; commentaire: string } };
  pipeline_stats: { total_duration_ms: number; passe1_duration_ms: number; passe2_duration_ms: number; consensus_duration_ms: number; passe3_duration_ms: number; passe4_duration_ms: number; total_tokens: number; total_cost_usd: number; models_used: string[] };
}

// Formatage CHF suisse : 1'234'567
function formatCHF(n: number | null | undefined): string {
  if (n == null) return "—";
  const rounded = Math.round(n);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}

// Badge source coloré
function SourceBadge({ source }: { source: PriceSource }) {
  const config: Record<PriceSource, { label: string; bg: string; text: string }> = {
    historique_interne: { label: "Historique", bg: "bg-green-100", text: "text-green-800" },
    benchmark_cantaia: { label: "Benchmark", bg: "bg-blue-100", text: "text-blue-800" },
    referentiel_crb: { label: "CRB", bg: "bg-yellow-100", text: "text-yellow-800" },
    ratio_estimation: { label: "Ratio", bg: "bg-orange-100", text: "text-orange-800" },
    estimation_ia: { label: "Estimation IA", bg: "bg-red-100", text: "text-red-800" },
    consensus_multi_ia: { label: "Consensus IA", bg: "bg-orange-100", text: "text-orange-800" },
    prix_non_disponible: { label: "Non dispo.", bg: "bg-gray-100", text: "text-gray-600" },
  };
  const c = config[source] ?? config.prix_non_disponible;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

// Score fiabilité en couleur
function ScoreDisplay({ score, large }: { score: number; large?: boolean }) {
  const color = score >= 80 ? "text-green-600" : score >= 60 ? "text-blue-600" : score >= 40 ? "text-orange-500" : "text-red-500";
  const bg = score >= 80 ? "bg-green-50" : score >= 60 ? "bg-blue-50" : score >= 40 ? "bg-orange-50" : "bg-red-50";
  const label = score >= 80 ? "Haute fiabilité" : score >= 60 ? "Fiable" : score >= 40 ? "Indicative" : "Pré-estimation";

  if (large) {
    return (
      <div className={`${bg} rounded-xl p-6 text-center`}>
        <div className={`text-5xl font-bold ${color}`}>{score}</div>
        <div className={`text-sm ${color} mt-1`}>{label}</div>
      </div>
    );
  }

  return <span className={`${color} font-semibold`}>{score}/100</span>;
}

// Barre de répartition des sources
function SourceDistributionBar({ repartition }: { repartition: Record<string, number> }) {
  const segments = [
    { key: "historique_interne_pct", label: "Historique", color: "bg-green-500" },
    { key: "benchmark_cantaia_pct", label: "Benchmark", color: "bg-blue-500" },
    { key: "referentiel_crb_pct", label: "CRB", color: "bg-yellow-500" },
    { key: "ratio_estimation_pct", label: "Ratio", color: "bg-orange-400" },
    { key: "estimation_ia_pct", label: "IA", color: "bg-red-400" },
    { key: "consensus_multi_ia_pct", label: "Consensus IA", color: "bg-orange-500" },
    { key: "prix_non_disponible_pct", label: "Non dispo.", color: "bg-gray-300" },
  ].filter((s) => (repartition[s.key] ?? 0) > 0);

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden">
        {segments.map((s) => (
          <div key={s.key} className={`${s.color}`} style={{ width: `${repartition[s.key]}%` }} title={`${s.label}: ${repartition[s.key]}%`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${s.color}`} />
            {s.label} {repartition[s.key]}%
          </span>
        ))}
      </div>
    </div>
  );
}

interface Props {
  estimation: EstimationPipelineResult;
  onCorrectQuantity?: (poste: PosteChiffre) => void;
  onCalibratePrice?: (poste: PosteChiffre) => void;
  onRelaunch?: () => void;
}

export default function EstimationResultV2({ estimation, onCorrectQuantity, onCalibratePrice, onRelaunch }: Props) {
  const [expandedCfc, setExpandedCfc] = useState<Set<string>>(new Set());
  const [showTransparency, setShowTransparency] = useState(false);

  const { passe4, consensus_metrage, passe3, pipeline_stats } = estimation;
  const { recapitulatif, analyse_fiabilite, comparaison_marche, estimation_par_cfc } = passe4;

  const toggleCfc = (code: string) => {
    setExpandedCfc((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* ─── En-tête ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ScoreDisplay score={analyse_fiabilite.score_global} large />

        <div className="bg-[#F5F2EB] rounded-xl p-6">
          <div className="text-sm text-[#8A9CA8] mb-1">Total estimé (CHF HT)</div>
          <div className="text-lg font-bold text-[#0A1F30]">
            {formatCHF(recapitulatif.total_estimation.min)} — <span className="text-[#C4A661]">{formatCHF(recapitulatif.total_estimation.median)}</span> — {formatCHF(recapitulatif.total_estimation.max)}
          </div>
          <div className="text-sm text-[#8A9CA8] mt-2">
            Prix/m² SBP : {formatCHF(recapitulatif.prix_au_m2_sbp.min)} — {formatCHF(recapitulatif.prix_au_m2_sbp.median)} — {formatCHF(recapitulatif.prix_au_m2_sbp.max)} CHF
          </div>
          <div className="text-xs text-[#8A9CA8] mt-1">
            Réf. marché : {formatCHF(recapitulatif.plage_reference_m2_sbp.min)} — {formatCHF(recapitulatif.plage_reference_m2_sbp.max)} CHF/m² ({recapitulatif.plage_reference_m2_sbp.source})
          </div>
        </div>

        <div className="bg-[#F5F2EB] rounded-xl p-6">
          <div className="text-sm text-[#8A9CA8] mb-2">Répartition des sources</div>
          <SourceDistributionBar repartition={analyse_fiabilite.repartition_sources as any} />
          <div className="text-xs text-[#8A9CA8] mt-3">
            Position marché : <span className={comparaison_marche.position === "dans_marche" ? "text-green-600" : "text-orange-500"}>
              {comparaison_marche.position === "dans_marche" ? "Dans le marché" : comparaison_marche.position === "sous_marche" ? "Sous le marché" : "Au-dessus du marché"}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Tableau par CFC ─── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-[#0A1F30]">Détail par CFC</h3>
          <button onClick={() => setExpandedCfc(new Set(estimation_par_cfc.map((c: { cfc_code: string }) => c.cfc_code)))} className="text-xs text-[#C4A661] hover:underline">
            Tout déplier
          </button>
        </div>

        {estimation_par_cfc.map((cfc: { cfc_code: string; cfc_libelle: string; postes: PosteChiffre[]; sous_total_cfc: { min: number; median: number; max: number } }) => (
          <div key={cfc.cfc_code} className="border-b border-gray-50 last:border-b-0">
            <button
              onClick={() => toggleCfc(cfc.cfc_code)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-[#8A9CA8]">{cfc.cfc_code}</span>
                <span className="font-medium text-[#0A1F30]">{cfc.cfc_libelle}</span>
                <span className="text-xs text-gray-400">({cfc.postes.length} postes)</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">{formatCHF(cfc.sous_total_cfc.min)} — </span>
                <span className="font-semibold text-[#0A1F30]">{formatCHF(cfc.sous_total_cfc.median)}</span>
                <span className="text-sm text-gray-500"> — {formatCHF(cfc.sous_total_cfc.max)}</span>
                <svg className={`w-4 h-4 transition-transform ${expandedCfc.has(cfc.cfc_code) ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {expandedCfc.has(cfc.cfc_code) && (
              <div className="px-4 pb-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-[#8A9CA8] border-b border-gray-100">
                      <th className="text-left py-2 pr-2">Source</th>
                      <th className="text-left py-2 pr-2">Description</th>
                      <th className="text-right py-2 pr-2">Qté</th>
                      <th className="text-left py-2 pr-2">Unité</th>
                      <th className="text-right py-2 pr-2">PU médian</th>
                      <th className="text-right py-2 pr-2">Total min</th>
                      <th className="text-right py-2 pr-2 font-semibold">Total médian</th>
                      <th className="text-right py-2 pr-2">Total max</th>
                      <th className="text-center py-2">Conf.</th>
                      <th className="text-center py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cfc.postes.map((poste: PosteChiffre, idx: number) => {
                      const isRisky = poste.confiance_prix === 'estimation' || poste.confiance_prix === 'low';
                      return (
                        <tr key={idx} className={`border-b border-gray-50 ${isRisky ? "bg-orange-50/50" : ""}`}>
                          <td className="py-2 pr-2"><SourceBadge source={poste.prix_unitaire.source} /></td>
                          <td className="py-2 pr-2 max-w-[200px] truncate" title={poste.description}>{poste.description}</td>
                          <td className="py-2 pr-2 text-right font-mono">{poste.quantite}</td>
                          <td className="py-2 pr-2 text-gray-500">{poste.unite}</td>
                          <td className="py-2 pr-2 text-right font-mono">{formatCHF(poste.prix_unitaire.median)}</td>
                          <td className="py-2 pr-2 text-right text-gray-400 font-mono">{formatCHF(poste.total.min)}</td>
                          <td className="py-2 pr-2 text-right font-semibold font-mono">{formatCHF(poste.total.median)}</td>
                          <td className="py-2 pr-2 text-right text-gray-400 font-mono">{formatCHF(poste.total.max)}</td>
                          <td className="py-2 text-center">
                            <span className="text-xs text-gray-400">{poste.confiance_quantite[0].toUpperCase()}/{poste.confiance_prix[0].toUpperCase()}</span>
                          </td>
                          <td className="py-2 text-center">
                            <div className="flex gap-1 justify-center">
                              {onCorrectQuantity && (
                                <button onClick={() => onCorrectQuantity(poste)} className="text-xs text-[#C4A661] hover:underline" title="Corriger la quantité">
                                  Qté
                                </button>
                              )}
                              {onCalibratePrice && (
                                <button onClick={() => onCalibratePrice(poste)} className="text-xs text-blue-500 hover:underline" title="Renseigner un prix réel">
                                  Prix
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}

        {/* Récapitulatif */}
        <div className="px-4 py-3 bg-[#F5F2EB] rounded-b-xl">
          <div className="flex justify-between text-sm">
            <span className="text-[#8A9CA8]">Sous-total travaux</span>
            <span className="font-mono">{formatCHF(recapitulatif.sous_total_travaux.median)} CHF</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-[#8A9CA8]">Frais généraux ({recapitulatif.frais_generaux.pourcentage}%)</span>
            <span className="font-mono">{formatCHF(recapitulatif.frais_generaux.montant_median)} CHF</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-[#8A9CA8]">Bénéfice & risques ({recapitulatif.benefice_risques.pourcentage}%)</span>
            <span className="font-mono">{formatCHF(recapitulatif.benefice_risques.montant_median)} CHF</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-[#8A9CA8]">Imprévus ({recapitulatif.divers_imprevus.pourcentage}%)</span>
            <span className="font-mono">{formatCHF(recapitulatif.divers_imprevus.montant_median)} CHF</span>
          </div>
          <div className="border-t border-[#C4A661]/30 mt-2 pt-2 flex justify-between">
            <span className="font-semibold text-[#0A1F30]">TOTAL ESTIMATION</span>
            <span className="font-bold text-lg text-[#0A1F30] font-mono">{formatCHF(recapitulatif.total_estimation.median)} CHF</span>
          </div>
        </div>
      </div>

      {/* ─── Alertes ─── */}
      {(passe3.alertes_coherence.length > 0 || passe3.elements_probablement_manquants.length > 0 || analyse_fiabilite.postes_a_risque.length > 0) && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-[#0A1F30] mb-3">Alertes et recommandations</h3>

          {passe3.alertes_coherence.filter((a: { severite: string }) => a.severite === "critique").map((alerte: { poste_concerne: string; probleme: string; suggestion: string }, i: number) => (
            <div key={i} className="flex items-start gap-2 mb-2 p-2 bg-red-50 rounded">
              <span className="text-red-500 text-lg leading-none">!</span>
              <div>
                <div className="text-sm font-medium text-red-800">{alerte.poste_concerne}</div>
                <div className="text-xs text-red-600">{alerte.probleme}</div>
                <div className="text-xs text-red-500 italic">{alerte.suggestion}</div>
              </div>
            </div>
          ))}

          {passe3.elements_probablement_manquants.filter((e: { impact_estimation: string }) => e.impact_estimation !== "faible").map((elem: { cfc_code: string; description: string; raison: string }, i: number) => (
            <div key={i} className="flex items-start gap-2 mb-2 p-2 bg-yellow-50 rounded">
              <span className="text-yellow-500 text-lg leading-none">?</span>
              <div>
                <div className="text-sm font-medium text-yellow-800">{elem.cfc_code} — {elem.description}</div>
                <div className="text-xs text-yellow-600">{elem.raison}</div>
              </div>
            </div>
          ))}

          {analyse_fiabilite.prochaines_etapes.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-medium text-[#8A9CA8] mb-1">Prochaines étapes :</div>
              <ul className="text-sm text-[#0A1F30] space-y-1">
                {analyse_fiabilite.prochaines_etapes.map((step: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-[#C4A661]">&bull;</span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ─── Transparence ─── */}
      <div className="bg-white rounded-xl border border-gray-200">
        <button
          onClick={() => setShowTransparency(!showTransparency)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
        >
          <span className="font-semibold text-[#0A1F30]">Transparence du pipeline</span>
          <svg className={`w-4 h-4 transition-transform ${showTransparency ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showTransparency && (
          <div className="px-4 pb-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-[#8A9CA8]">Durée totale</div>
                <div className="font-mono">{(pipeline_stats.total_duration_ms / 1000).toFixed(1)}s</div>
              </div>
              <div>
                <div className="text-xs text-[#8A9CA8]">Tokens utilisés</div>
                <div className="font-mono">{pipeline_stats.total_tokens.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-[#8A9CA8]">Coût estimé</div>
                <div className="font-mono">${pipeline_stats.total_cost_usd.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-[#8A9CA8]">Modèles</div>
                <div className="font-mono">{pipeline_stats.models_used.join(", ")}</div>
              </div>
            </div>

            <div>
              <div className="text-xs text-[#8A9CA8] mb-1">Consensus multi-modèle</div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="bg-green-50 rounded p-2 text-center">
                  <div className="font-bold text-green-700">{consensus_metrage.stats.concordance_forte_pct}%</div>
                  <div className="text-xs text-green-600">Concordance forte</div>
                </div>
                <div className="bg-yellow-50 rounded p-2 text-center">
                  <div className="font-bold text-yellow-700">{consensus_metrage.stats.concordance_partielle_pct}%</div>
                  <div className="text-xs text-yellow-600">Partielle</div>
                </div>
                <div className="bg-red-50 rounded p-2 text-center">
                  <div className="font-bold text-red-700">{consensus_metrage.stats.divergence_pct}%</div>
                  <div className="text-xs text-red-600">Divergence</div>
                </div>
              </div>
            </div>

            {consensus_metrage.modeles_en_erreur.length > 0 && (
              <div className="text-xs text-red-500">
                Modèles en erreur : {consensus_metrage.modeles_en_erreur.map((e: { provider: string; error: string }) => `${e.provider} (${e.error})`).join(", ")}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Actions ─── */}
      <div className="flex gap-3">
        {onRelaunch && (
          <button onClick={onRelaunch} className="px-4 py-2 bg-[#0A1F30] text-white rounded-lg text-sm hover:bg-[#0A1F30]/90 transition-colors">
            Relancer l'estimation
          </button>
        )}
        <button disabled className="px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm cursor-not-allowed" title="Bientôt disponible">
          Exporter PDF
        </button>
        <button disabled className="px-4 py-2 bg-gray-100 text-gray-400 rounded-lg text-sm cursor-not-allowed" title="Bientôt disponible">
          Exporter DOCX
        </button>
      </div>
    </div>
  );
}
