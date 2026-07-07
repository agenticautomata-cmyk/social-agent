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
export {
  computeTopSponsorCandidates,
  type TopSponsorCandidatesResponse,
} from './top-candidates.js';
export {
  shouldPromoteSponsorCandidate,
  sponsorBriefingLinkFromCandidate,
  type SponsorBriefingLink,
} from './priority.js';
export {
  computeVideoBusinessIntelligence,
  getVideoBusinessDetail,
  businessSlug,
  isNationalChain,
  NATIONAL_CHAIN_NAMES,
  type VideoBusinessAggregate,
  type VideoBusinessDetailResponse,
  type VideoBusinessIntelligenceResponse,
  type VideoBusinessMention,
  type RecentBusinessMention,
  type BusinessType,
} from './video-businesses.js';
