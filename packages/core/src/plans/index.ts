export {
  detectPlansInEmail,
  isPotentialPlan,
  emailSuggestsPlans,
  buildPlanDetectPrompt,
} from "./plan-detector";

export type {
  Attachment,
  PlanDetectionContext,
  PlanDetectionResult,
} from "./plan-detector";

export {
  checkPlanReferences,
  extractPlanReferences,
  buildPlanReferenceCheckPrompt,
} from "./version-checker";

export type {
  PlanReferenceCheckResult,
  PlanReference,
  ExistingPlan,
} from "./version-checker";

export { savePlanFromAttachment } from "./plan-storage";
export type { SavePlanInput, SavePlanResult } from "./plan-storage";
