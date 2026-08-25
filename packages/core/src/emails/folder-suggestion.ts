// ============================================================
// Folder suggestion gating — normalisation et seuil de confiance
// ============================================================
//
// AUDIT 08/2026 — /api/email/suggest-folder renvoyait TOUJOURS le meilleur
// candidat, même à 25 % de confiance : le bouton "Déplacer vers X" du mail
// était renommé sur la foi d'une règle contredite 3 fois sur 4. Ce module
// centralise la normalisation des scores et applique un seuil dur : sous
// FOLDER_SUGGESTION_MIN_CONFIDENCE, PAS de suggestion.
//
// La normalisation est PAR TIER : un match de règle sender_email plafonne à
// 100 points, un match projet à 200, etc. Normaliser tout par 200 (l'ancien
// comportement) rendait le seuil inatteignable pour les règles apprises
// parfaitement fiables (100/200 = 0.5).

/** Sous ce score normalisé (0–1), aucune suggestion n'est montrée. */
export const FOLDER_SUGGESTION_MIN_CONFIDENCE = 0.6;

export interface FolderSuggestionCandidate {
  folder_id: string;
  folder_name: string;
  /** Score brut du tier (confiance de règle et boosts déjà appliqués). */
  score: number;
  /** Score maximal atteignable par ce tier (200 projet, 100 sender_email, …). */
  tier_max: number;
  /** 'project_match' | 'sender_email' | 'sender_domain' | 'subject_keyword' | 'body_keyword' */
  decision_source: string;
  reason: string;
}

export interface GatedFolderSuggestion {
  folder_id: string;
  folder_name: string;
  /** Score normalisé 0–0.99, comparable entre tiers. */
  confidence: number;
  decision_source: string;
  reason: string;
}

function normalizedScore(c: FolderSuggestionCandidate): number {
  if (c.tier_max <= 0) return 0;
  // Un boost (ex. règle pointant vers le dossier du projet) peut dépasser le
  // plafond du tier — on borne à 0.99 comme l'ancienne implémentation.
  return Math.min(0.99, c.score / c.tier_max);
}

/**
 * Déduplique par dossier (meilleur score normalisé conservé), choisit le
 * meilleur candidat, et applique le seuil. Retourne null si rien ne passe.
 * Pur — testable sans DB ni route.
 */
export function gateFolderSuggestion(
  candidates: FolderSuggestionCandidate[],
  minConfidence: number = FOLDER_SUGGESTION_MIN_CONFIDENCE
): GatedFolderSuggestion | null {
  if (candidates.length === 0) return null;

  const bestByFolder = new Map<string, { candidate: FolderSuggestionCandidate; confidence: number }>();
  for (const c of candidates) {
    const conf = normalizedScore(c);
    const existing = bestByFolder.get(c.folder_id);
    if (!existing || conf > existing.confidence) {
      bestByFolder.set(c.folder_id, { candidate: c, confidence: conf });
    }
  }

  let best: { candidate: FolderSuggestionCandidate; confidence: number } | null = null;
  for (const entry of bestByFolder.values()) {
    if (!best || entry.confidence > best.confidence) best = entry;
  }

  if (!best || best.confidence < minConfidence) return null;

  return {
    folder_id: best.candidate.folder_id,
    folder_name: best.candidate.folder_name,
    confidence: Math.round(best.confidence * 100) / 100,
    decision_source: best.candidate.decision_source,
    reason: best.candidate.reason,
  };
}
