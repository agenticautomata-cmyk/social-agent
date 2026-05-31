import { db } from '../db.js';
import { sponsorContacts } from '../schema.js';
import { loadAllPlannerItems, type PlannerItemRecord } from '../content-planner/items.js';
import {
  enrichOpportunities,
  listSponsorOpportunities,
  type SponsorOpportunityWithContact,
} from '../sponsor-pipeline/opportunities.js';
import { PIPELINE_STATUS_LABELS } from '../sponsor-pipeline/constants.js';
import { listOutreachEmails, type OutreachEmailRecord } from '../sponsor-outreach/outreach.js';
import { loadCategoryAnalyticsIndex, type CategoryAnalyticsRow } from './analytics-similar.js';
import type { LinkedPipelineOpportunity } from './types.js';

export type BensonIntelligenceContext = {
  pipelineOpportunities: SponsorOpportunityWithContact[];
  outreachNeedsApproval: OutreachEmailRecord[];
  categoryAnalytics: Map<string, CategoryAnalyticsRow>;
  byContentItemId: Map<string, LinkedPipelineOpportunity[]>;
  byPlannerListName: Map<string, LinkedPipelineOpportunity[]>;
  bySponsorContactId: Map<string, LinkedPipelineOpportunity[]>;
  plannerByContentId: Map<string, PlannerItemRecord[]>;
  sourceOpportunityByContactId: Map<string, string>;
};

function toLinked(opp: SponsorOpportunityWithContact): LinkedPipelineOpportunity {
  return {
    id: opp.id,
    title: opp.title,
    status: opp.status,
    statusLabel: PIPELINE_STATUS_LABELS[opp.status],
    estimatedValue: opp.estimatedValue,
    sponsorBusinessName: opp.sponsorBusinessName,
    plannerListName: opp.plannerListName,
  };
}

export async function buildBensonContext(): Promise<BensonIntelligenceContext> {
  const [pipelineOpportunities, outreachRows, categoryAnalytics, plannerMap, contacts] =
    await Promise.all([
      enrichOpportunities(await listSponsorOpportunities({ openOnly: true })),
      listOutreachEmails('queue'),
      loadCategoryAnalyticsIndex(),
      loadAllPlannerItems(),
      db.select().from(sponsorContacts),
    ]);

  const wonDeals = await enrichOpportunities(
    (await listSponsorOpportunities()).filter((o) => o.status === 'won'),
  );

  const allOpps = [...pipelineOpportunities, ...wonDeals];
  const contactSourceMap = new Map(
    contacts
      .filter((c) => c.sourceOpportunityId)
      .map((c) => [c.id, c.sourceOpportunityId!]),
  );

  const byContentItemId = new Map<string, LinkedPipelineOpportunity[]>();
  const byPlannerListName = new Map<string, LinkedPipelineOpportunity[]>();
  const bySponsorContactId = new Map<string, LinkedPipelineOpportunity[]>();

  for (const opp of allOpps) {
    const linked = toLinked(opp);
    const contactList = bySponsorContactId.get(opp.sponsorContactId) ?? [];
    contactList.push(linked);
    bySponsorContactId.set(opp.sponsorContactId, contactList);

    const sourceId = contactSourceMap.get(opp.sponsorContactId);
    if (sourceId) {
      const contentList = byContentItemId.get(sourceId) ?? [];
      if (!contentList.some((l) => l.id === linked.id)) contentList.push(linked);
      byContentItemId.set(sourceId, contentList);
    }

    if (opp.plannerListName) {
      const list = byPlannerListName.get(opp.plannerListName) ?? [];
      if (!list.some((l) => l.id === linked.id)) list.push(linked);
      byPlannerListName.set(opp.plannerListName, list);
    }
  }

  const plannerByContentId = new Map<string, PlannerItemRecord[]>();
  for (const record of plannerMap.values()) {
    const list = plannerByContentId.get(record.contentItemId) ?? [];
    list.push(record);
    plannerByContentId.set(record.contentItemId, list);

    const listLinks = byPlannerListName.get(record.listName) ?? [];
    for (const linked of listLinks) {
      const contentList = byContentItemId.get(record.contentItemId) ?? [];
      if (!contentList.some((l) => l.id === linked.id)) contentList.push(linked);
      byContentItemId.set(record.contentItemId, contentList);
    }
  }

  const outreachNeedsApproval = outreachRows.filter((e) => e.status === 'needs_approval');

  return {
    pipelineOpportunities,
    outreachNeedsApproval,
    categoryAnalytics,
    byContentItemId,
    byPlannerListName,
    bySponsorContactId,
    plannerByContentId,
    sourceOpportunityByContactId: new Map(
      contacts
        .filter((c) => c.sourceOpportunityId)
        .map((c) => [c.id, c.sourceOpportunityId!]),
    ),
  };
}

export function getLinkedOpportunitiesForContent(
  contentItemId: string,
  context: BensonIntelligenceContext,
  plannerListNames: string[] = [],
): LinkedPipelineOpportunity[] {
  const seen = new Set<string>();
  const out: LinkedPipelineOpportunity[] = [];

  const add = (list: LinkedPipelineOpportunity[]) => {
    for (const opp of list) {
      if (seen.has(opp.id)) continue;
      seen.add(opp.id);
      out.push(opp);
    }
  };

  add(context.byContentItemId.get(contentItemId) ?? []);
  for (const name of plannerListNames) {
    add(context.byPlannerListName.get(name) ?? []);
  }

  return out;
}
