import { env } from '../env.js';
import { computeActionCenter } from '../action-center/hub.js';
import type { ActionCenterItem } from '../action-center/types.js';
import { loadIngestedInventoryItems } from '../inventory/load-ingested.js';
import { computeTopSponsorCandidates } from '../sponsor-intelligence/top-candidates.js';
import {
  shouldPromoteSponsorCandidate,
  sponsorBriefingLinkFromCandidate,
} from '../sponsor-intelligence/priority.js';
import { listOutreachEmails } from '../sponsor-outreach/outreach.js';

export type OpenTaskForNavigation = {
  id: string;
  title: string;
  subtitle: string | null;
  href: string | null;
  section: string;
  priority: string;
  actionLabels: string[];
};

function mapActionItem(item: ActionCenterItem): OpenTaskForNavigation {
  return {
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    href: item.href ?? item.actions.find((a) => a.href)?.href ?? null,
    section: item.section,
    priority: item.priority,
    actionLabels: item.actions.map((a) => a.label),
  };
}

export async function loadOpenTasksForNavigation(options?: {
  excludeCategories?: string[];
}): Promise<OpenTaskForNavigation[]> {
  const [actionCenter, ingested, outreachRows] = await Promise.all([
    computeActionCenter({ demoMode: env.DEMO_MODE, excludeCategories: options?.excludeCategories }),
    loadIngestedInventoryItems(),
    listOutreachEmails('all'),
  ]);

  const tasks: OpenTaskForNavigation[] = [
    ...actionCenter.doNow.map(mapActionItem),
    ...actionCenter.notifications.overdue.map(mapActionItem),
    ...actionCenter.notifications.dueToday.map(mapActionItem),
  ];

  const seen = new Set<string>();
  const unique = tasks.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  const topSponsors = await computeTopSponsorCandidates(ingested, { limit: 5 });
  for (const rec of topSponsors.items) {
    if (!shouldPromoteSponsorCandidate(rec)) continue;
    const link = sponsorBriefingLinkFromCandidate(rec);
    const hasDraft = outreachRows.some(
      (e) =>
        e.sponsorContactId === rec.sponsorContactId &&
        ['draft', 'needs_approval', 'scheduled'].includes(e.status),
    );
    if (hasDraft) {
      const draft = outreachRows.find((e) => e.sponsorContactId === rec.sponsorContactId);
      const href =
        draft?.status === 'needs_approval'
          ? `/email/approvals?id=${draft.id}`
          : draft
            ? `/outreach/compose?sponsor=${rec.sponsorContactId}`
            : link.href;
      unique.unshift({
        id: `pitch-nav-${rec.sponsorContactId ?? rec.contentItemId}`,
        title: link.label,
        subtitle: hasDraft
          ? `Draft exists — ${draft?.status?.replace(/_/g, ' ') ?? 'open compose'}`
          : rec.recommendedPitchAngle,
        href,
        section: 'sponsor_pitch',
        priority: 'important',
        actionLabels: hasDraft ? ['Continue pitch', 'Approve send'] : ['Start pitch'],
      });
      continue;
    }
    if (!unique.some((t) => t.title === link.label)) {
      unique.unshift({
        id: `pitch-nav-${rec.sponsorContactId ?? rec.contentItemId}`,
        title: link.label,
        subtitle: rec.recommendedPitchAngle,
        href: link.href,
        section: 'sponsor_pitch',
        priority: 'important',
        actionLabels: ['Compose pitch'],
      });
    }
  }

  return unique.slice(0, 12);
}
