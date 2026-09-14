import type { ResearchStageId, ResearchStageResult, StageStatus } from './types.js';
import { RESEARCH_STAGE_IDS } from './types.js';

export const STAGE_LABELS: Record<ResearchStageId, string> = {
  business_identity: 'Business identity',
  local_location: 'Local location details',
  official_web_social: 'Official website and social accounts',
  local_store_contact: 'Local management or store contact',
  corporate_pr_marketing: 'Corporate PR and marketing contacts',
  pr_agency: 'PR agency or communications firm',
  creator_influencer_programs: 'Creator, ambassador and influencer programs',
  affiliate_programs: 'Affiliate programs',
  media_press_partnership_pages: 'Media, press and partnership pages',
  news_opening_coverage: 'Recent news and opening coverage',
  brand_positioning: 'Brand positioning and target customer',
  kckellie_fit: 'KCKellie audience fit',
  content_opportunities: 'Content opportunities',
  outreach_angles: 'Outreach angles',
  risks_restrictions_gaps: 'Risks, restrictions and missing information',
};

export function emptyStages(): ResearchStageResult[] {
  return RESEARCH_STAGE_IDS.map((id) => ({
    id,
    label: STAGE_LABELS[id],
    status: 'skipped' as StageStatus,
    reason: 'not_started',
    completedAt: null,
  }));
}

export function setStage(
  stages: ResearchStageResult[],
  id: ResearchStageId,
  status: StageStatus,
  reason?: string | null,
): ResearchStageResult[] {
  return stages.map((s) =>
    s.id === id
      ? {
          ...s,
          status,
          reason: reason ?? null,
          completedAt: new Date().toISOString(),
        }
      : s,
  );
}
