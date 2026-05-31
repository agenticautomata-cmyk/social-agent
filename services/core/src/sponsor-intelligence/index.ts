export {
  computeSponsorIntelligence,
  type SponsorRecommendation,
  type SponsorIntelligenceSection,
  type SponsorIntelligenceSectionId,
  type SponsorIntelligenceResponse,
} from './recommendations.js';
export {
  computeAllScores,
  computeSponsorFitScore,
  computeAudienceFitScore,
  computeRevenuePotentialScore,
  computeConfidenceScore,
  pickTemplateType,
  type SponsorScores,
} from './scoring.js';
export {
  dismissOpportunity,
  addOpportunityToPlanner,
  createDraftOutreachFromOpportunity,
} from './actions.js';
