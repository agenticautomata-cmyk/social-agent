/**
 * Home Top Pick actionability — display/CTA shaping only.
 * Does not change scoring, preference filters, or Home showroom gating.
 */
import type { TopOpportunity } from '../opportunity-scoring/index.js';

export type HomeTopPickActionKey = 'add_to_today' | 'review' | 'open_program' | 'open_plan';

export type HomeTopPickAction = {
  key: HomeTopPickActionKey;
  label: string;
};

export type HomeTopPick = TopOpportunity & {
  primaryAction: HomeTopPickAction;
};

export function isUsableTopPickSourceUrl(url: string | null | undefined): boolean {
  const raw = (url ?? '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function categoryBlob(category: string | null | undefined, title: string): string {
  return `${category ?? ''} ${title}`.toLowerCase();
}

export function homeTopPickPrimaryAction(input: {
  title: string;
  category: string | null;
  eventDate: string | null;
  plannerListName?: string | null;
}): HomeTopPickAction {
  const planner = (input.plannerListName ?? '').toLowerCase();
  if (planner && /today|saved|weekend|this week/.test(planner)) {
    return { key: 'open_plan', label: 'Open plan' };
  }

  const blob = categoryBlob(input.category, input.title);
  if (/\b(creator_partnership|creator program|affiliate|brand ambassador|ugc program)\b/.test(blob)) {
    return { key: 'open_program', label: 'Open program' };
  }
  if (/\b(sponsor|sponsorship)\b/.test(blob) && !input.eventDate) {
    return { key: 'review', label: 'Review opportunity' };
  }
  if (/\b(filming|film this|b-roll)\b/.test(blob)) {
    return { key: 'add_to_today', label: 'Add to filming' };
  }
  if (
    input.eventDate ||
    /\b(event|festival|parade|expo|opening|concert|nightlife|music|circus|things to do|market)\b/.test(blob)
  ) {
    return { key: 'add_to_today', label: 'Add to Things To Do' };
  }
  return { key: 'review', label: 'Review details' };
}

export function shapeHomeTopPicks(
  opportunities: TopOpportunity[],
  plannerById: Map<string, { listName?: string | null }>,
  limit: number,
): HomeTopPick[] {
  const out: HomeTopPick[] = [];
  for (const opp of opportunities) {
    if (out.length >= limit) break;
    if (!isUsableTopPickSourceUrl(opp.sourceUrl)) continue;
    out.push({
      ...opp,
      primaryAction: homeTopPickPrimaryAction({
        title: opp.title,
        category: opp.category,
        eventDate: opp.eventDate,
        plannerListName: plannerById.get(opp.id)?.listName ?? null,
      }),
    });
  }
  return out;
}
