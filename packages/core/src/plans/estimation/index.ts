// Point d'entrée du module d'estimation
// Exporte tous les composants du pipeline

export { runEstimationPipeline } from './pipeline';
export type { PipelineParams } from './pipeline';

export { buildConsensus } from './consensus-engine';
export { resolvePrice, resolvePricesBatch } from './price-resolver';
export { calculateGlobalScore, calculateSourceDistribution, getScoreLabel, getScoreColor, combinedConfidenceLabel } from './confidence-calculator';
export { calculateDynamicConfidence } from './dynamic-confidence';

export { getQuantityCalibration, getPriceCalibration, getModelErrorProfile, getBureauProfile } from './calibration-engine';
export { verifyCrossPlan, getCrossPlanBonus } from './cross-plan-verification';
export { autoCalibrate } from './auto-calibration';

export { callClaudeVision, callClaudeText, callGPT4oVision, callGeminiVision } from './ai-clients';

export { CFC_REFERENCE_PRICES, SIA_PHASE_FACTORS } from './reference-data/cfc-prices';
export type { CFCReferencePrice } from './reference-data/cfc-prices';
export { REGIONAL_COEFFICIENTS, RATIOS_M2_SBP } from './reference-data/regional-coefficients';

export type * from './types';
