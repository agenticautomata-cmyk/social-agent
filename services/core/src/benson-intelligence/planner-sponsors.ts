import type { PlannerCard } from '../content-planner/hub.js';
import { getLinkedOpportunitiesForContent } from './context.js';
import { getBensonContext } from './enrich.js';
import type { LinkedPipelineOpportunity, PlannedContentLink } from './types.js';

export type PlannerCardWithSponsors = PlannerCard & {
  linkedPipelineOpportunities: LinkedPipelineOpportunity[];
};

export async function enrichPlannerCards(
  cards: PlannerCard[],
): Promise<PlannerCardWithSponsors[]> {
  const context = await getBensonContext();
  return cards.map((card) => ({
    ...card,
    linkedPipelineOpportunities: getLinkedOpportunitiesForContent(
      card.id,
      context,
      [card.planner.listName],
    ),
  }));
}

export async function getPlannedContentForSponsor(
  sponsorContactId: string,
  titleByContentId?: Map<string, string>,
): Promise<PlannedContentLink[]> {
  const context = await getBensonContext();
  const sourceId = context.sourceOpportunityByContactId.get(sponsorContactId);

  const links: PlannedContentLink[] = [];
  const seen = new Set<string>();

  const pushRecord = (contentItemId: string, record: { listName: string; plannedDate: string | null; status: string }) => {
    const key = `${contentItemId}:${record.listName}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({
      contentItemId,
      title: titleByContentId?.get(contentItemId) ?? 'Planned content',
      listName: record.listName,
      plannedDate: record.plannedDate,
      status: record.status,
    });
  };

  if (sourceId) {
    for (const record of context.plannerByContentId.get(sourceId) ?? []) {
      pushRecord(record.contentItemId, record);
    }
  }

  const opps = context.bySponsorContactId.get(sponsorContactId) ?? [];
  for (const opp of opps) {
    if (!opp.plannerListName) continue;
    for (const [contentItemId, records] of context.plannerByContentId) {
      for (const record of records) {
        if (record.listName !== opp.plannerListName) continue;
        pushRecord(contentItemId, record);
      }
    }
  }

  return links;
}
