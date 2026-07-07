import type { InventoryItem } from '../inventory/normalize.js';
import type { CommandCenterResponse } from '../inventory/command-center.js';
import { PIPELINE_STATUS_LABELS } from '../sponsor-pipeline/constants.js';
import type { BensonIntelligenceContext } from './context.js';
import type { BensonBriefingPriority } from './types.js';
import type { SponsorRecommendation } from '../sponsor-intelligence/recommendations.js';
import {
  shouldPromoteSponsorCandidate,
  sponsorBriefingLinkFromCandidate,
} from '../sponsor-intelligence/priority.js';

const FOLLOW_UP_STATUSES = new Set(['proposal_sent', 'negotiating', 'meeting_scheduled']);

export function computeBriefingPriorities(
  briefing: CommandCenterResponse,
  context: BensonIntelligenceContext,
  items: InventoryItem[],
  topSponsor?: SponsorRecommendation | null,
): BensonBriefingPriority[] {
  const priorities: BensonBriefingPriority[] = [];
  let rank = 1;

  if (topSponsor && shouldPromoteSponsorCandidate(topSponsor)) {
    const link = sponsorBriefingLinkFromCandidate(topSponsor);
    priorities.push({
      rank: rank++,
      label: link.label,
      href: link.href,
      kind: 'outreach',
    });
  }

  const discovered = briefing.sections.discoveredToday.items[0];
  if (discovered && priorities.length < 4) {
    priorities.push({
      rank: rank++,
      label: `Review new today: ${discovered.title}.`,
      href: `/review/inventory?id=${discovered.id}`,
      kind: 'content',
    });
  }

  const followUpDeals = context.pipelineOpportunities
    .filter((o) => FOLLOW_UP_STATUSES.has(o.status))
    .sort((a, b) => {
      const order = ['negotiating', 'proposal_sent', 'meeting_scheduled'];
      return order.indexOf(a.status) - order.indexOf(b.status);
    });

  for (const deal of followUpDeals.slice(0, 2)) {
    priorities.push({
      rank: rank++,
      label: `Follow up with ${deal.sponsorBusinessName} (${PIPELINE_STATUS_LABELS[deal.status]}).`,
      href: `/pipeline`,
      kind: 'pipeline',
    });
  }

  const postToday = briefing.sections.postToday.items[0];
  if (postToday) {
    priorities.push({
      rank: rank++,
      label: `Post ${postToday.title}.`,
      href: `/review/inventory?id=${postToday.id}`,
      kind: 'content',
    });
  }

  const approval = context.outreachNeedsApproval[0];
  if (approval) {
    priorities.push({
      rank: rank++,
      label: `Approve outreach email${context.outreachNeedsApproval.length > 1 ? ` (${context.outreachNeedsApproval.length} waiting)` : ''}.`,
      href: '/outreach/queue',
      kind: 'outreach',
    });
  }

  const weekendCount = briefing.sections.postWeekend.items.length;
  if (weekendCount > 0) {
    priorities.push({
      rank: rank++,
      label: `Review weekend content plan (${weekendCount} pick${weekendCount === 1 ? '' : 's'}).`,
      href: '/planner/week',
      kind: 'planner',
    });
  } else {
    const plannedThisWeek = [...context.plannerByContentId.values()].filter(
      (records) => records.some((r) => r.status === 'planned' || r.status === 'considering'),
    ).length;
    if (plannedThisWeek > 0) {
      priorities.push({
        rank: rank++,
        label: `Review content plan (${plannedThisWeek} item${plannedThisWeek === 1 ? '' : 's'} on the board).`,
        href: '/planner',
        kind: 'planner',
      });
    }
  }

  if (priorities.length < 4 && context.categoryAnalytics.size > 0) {
    const topCat = [...context.categoryAnalytics.values()].sort(
      (a, b) => b.performanceIndex - a.performanceIndex,
    )[0];
    if (topCat && topCat.performanceIndex >= 1.2) {
      priorities.push({
        rank: rank++,
        label: `Double down on ${topCat.category.replace(/_/g, ' ')} content (${topCat.performanceIndex}× baseline).`,
        href: '/analytics',
        kind: 'analytics',
      });
    }
  }

  if (priorities.length === 0 && items.length > 0) {
    priorities.push({
      rank: 1,
      label: 'Review today\'s editorial briefing.',
      href: '/editor',
      kind: 'content',
    });
  }

  return priorities.slice(0, 4).map((p, i) => ({ ...p, rank: i + 1 }));
}
