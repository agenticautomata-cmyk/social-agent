export type { GreenScreenPackageRecord } from './package.js';
export {
  loadGreenScreenPackage,
  prepareGreenScreenPackage,
  saveGreenScreenPackage,
  markGreenScreenStatus,
} from './package.js';
export {
  extractOpportunityFacts,
  validateOpportunityFacts,
  type FactValidation,
  type OpportunityFacts,
} from './validate-facts.js';
export { findDuplicateOpportunity, findDuplicateBySubjectTitle } from './duplicates.js';
export { buildFallbackGreenScreenPackage } from './fallback-package.js';
export { buildGreenScreenPlannerPatch } from './planner-patch.js';
