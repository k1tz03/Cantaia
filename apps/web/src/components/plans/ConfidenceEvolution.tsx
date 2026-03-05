"use client";

import React from "react";

interface Props {
  scoreActuel: number;
  scoreSansCalibration: number;
  gain: number;
  explication: string;
  factors?: {
    base: number;
    qty: number;
    price: number;
    bureau: number;
    cross: number;
  };
}

export default function ConfidenceEvolution({ scoreActuel, scoreSansCalibration, gain, explication, factors }: Props) {
  const color = scoreActuel >= 80 ? "text-green-600" : scoreActuel >= 60 ? "text-blue-600" : scoreActuel >= 40 ? "text-orange-500" : "text-red-500";
  const bgColor = scoreActuel >= 80 ? "bg-green-50" : scoreActuel >= 60 ? "bg-blue-50" : scoreActuel >= 40 ? "bg-orange-50" : "bg-red-50";
  const ringColor = scoreActuel >= 80 ? "border-green-400" : scoreActuel >= 60 ? "border-blue-400" : scoreActuel >= 40 ? "border-orange-400" : "border-red-400";

  // Calcul des barres de décomposition
  const maxScore = 95;
  const factorBars = factors ? [
    { label: 'Base', value: factors.base, color: 'bg-gray-400' },
    { label: 'Qty', value: factors.qty, color: 'bg-emerald-400' },
    { label: 'Prix', value: factors.price, color: 'bg-blue-400' },
    { label: 'Bureau', value: factors.bureau, color: 'bg-purple-400' },
    { label: 'Cross', value: factors.cross, color: 'bg-amber-400' },
  ].filter((f) => f.value > 0) : [];

  return (
    <div className={`${bgColor} rounded-xl p-4`}>
      <div className="flex items-center gap-4">
        {/* Score circulaire */}
        <div className={`w-16 h-16 rounded-full border-4 ${ringColor} flex items-center justify-center flex-shrink-0`} title={`Score sans calibration: ${scoreSansCalibration}`}>
          <span className={`text-2xl font-bold ${color}`}>{scoreActuel}</span>
        </div>

        <div className="flex-1 min-w-0">
          {/* Label */}
          <div className={`text-sm font-semibold ${color}`}>
            {scoreActuel >= 80 ? 'Haute fiabilité' : scoreActuel >= 60 ? 'Estimation fiable' : scoreActuel >= 40 ? 'Estimation indicative' : 'Pré-estimation'}
          </div>

          {/* Barre de décomposition */}
          {factorBars.length > 0 && (
            <div className="mt-2">
              <div className="flex h-2 rounded-full overflow-hidden bg-gray-200">
                {factorBars.map((f) => (
                  <div
                    key={f.label}
                    className={`${f.color}`}
                    style={{ width: `${(f.value / maxScore) * 100}%` }}
                    title={`${f.label}: ${Math.round(f.value * 100)}%`}
                  />
                ))}
              </div>
              <div className="flex gap-2 mt-1 text-xs text-[#8A9CA8]">
                {factorBars.map((f) => (
                  <span key={f.label} className="flex items-center gap-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${f.color}`} />
                    {f.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Message de gain */}
          {gain > 0 ? (
            <div className="text-xs text-[#0A1F30] mt-1">
              Score amélioré de <span className="font-semibold text-green-600">+{gain} points</span> grâce à votre historique
            </div>
          ) : (
            <div className="text-xs text-[#8A9CA8] mt-1">
              {explication}
            </div>
          )}

          {/* Suggestion si score bas */}
          {scoreActuel < 60 && (
            <div className="text-xs text-orange-600 mt-1">
              Corrigez les quantités marquées en orange pour améliorer la fiabilité des prochaines estimations.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
