/**
 * Worth a Look — up to 3 valuable non-urgent discoveries for Home.
 */

import type { InventoryItem } from '../inventory/normalize.js';
import { evaluateHomeShowroomGate, classifyContentLanes } from './home-showroom-lanes.js';
import {
  evaluateHomeCategoryGuard,
  normalizeHomeWhatItIs,
  safeHomeReason,
} from './home-category-guard.js';
import { canonicalHomeEntityKey } from './home-placement.js';

export type WorthALookCard = {
  id: string;
  title: string;
  whatItIs: string;
  whenWhere: string | null;
  reason: string;
  bestUse: 'film' | 'share' | 'research' | 'contact';
  verificationGap: string | null;
  sourceUrl: string | null;
  contentItemId: string;
  href: string;
};

function bestUseFor(item: InventoryItem): WorthALookCard['bestUse'] {
  const lanes = classifyContentLanes(item);
  if (lanes.includes('film_this')) return 'film';
  if (item.flags.sponsorFriendly) return 'contact';
  if (lanes.includes('things_to_do_weekly')) return 'share';
  return 'research';
}

function whenWhere(item: InventoryItem): string | null {
  const bits: string[] = [];
  if (item.eventDate) {
    try {
      bits.push(
        new Date(item.eventDate).toLocaleString('en-US', {
          timeZone: 'America/Chicago',
          month: 'short',
          day: 'numeric',
          hour: item.flags ? undefined : undefined,
        }),
      );
    } catch {
      /* ignore */
    }
  }
  const place = item.venue || item.locationName || item.neighborhood;
  if (place) bits.push(place);
  return bits.length ? bits.join(' · ') : null;
}

/**
 * Build Worth a Look cards. Empty array when nothing qualifies — never pad.
 */
export function buildWorthALook(input: {
  inventory: InventoryItem[];
  claimedKeys: Set<string>;
  limit?: number;
}): WorthALookCard[] {
  const limit = input.limit ?? 3;
  const out: WorthALookCard[] = [];

  const ranked = [...input.inventory]
    .filter((item) => {
      if (!item.eventDate) return false;
      if (item.lifecycleStatus === 'expired' || item.lifecycleStatus === 'archived') return false;
      if (item.creatorValueStatus === 'rejected' || item.creatorValueStatus === 'archived') return false;
      const guard = evaluateHomeCategoryGuard({
        title: item.title,
        category: item.category,
        reason: item.whyItMatters,
        businessName: item.businessName,
      });
      if (!guard.ok) return false;
      const lanes = classifyContentLanes(item);
      // Things To Do Weekly may appear here without Best Move / Money showroom gate
      // (e.g. Kansas City Home Show — timely local film/share, not Pitch Ready).
      if (lanes.includes('things_to_do_weekly')) return true;
      // Filmable creator-fit items still need showroom eligibility.
      return lanes.includes('film_this') && evaluateHomeShowroomGate(item).eligible;
    })
    .sort((a, b) => {
      const as = a.audienceScore + a.creatorScore;
      const bs = b.audienceScore + b.creatorScore;
      return bs - as;
    });

  for (const item of ranked) {
    if (out.length >= limit) break;
    const key = canonicalHomeEntityKey({
      contentItemId: item.id,
      businessName: item.businessName,
      title: item.title,
    });
    if (key && input.claimedKeys.has(key)) continue;
    if (key) input.claimedKeys.add(key);

    const gap =
      !item.sourceUrl
        ? 'Missing source link'
        : /needs? verification|unverified/i.test(item.whyItMatters)
          ? 'Timing or details still need verification'
          : null;

    out.push({
      id: `look-${item.id}`,
      title: item.title.slice(0, 120),
      whatItIs: normalizeHomeWhatItIs({
        title: item.title,
        category: item.category,
        reason: item.whyItMatters,
        businessName: item.businessName,
      }),
      whenWhere: whenWhere(item),
      reason: safeHomeReason(
        {
          title: item.title,
          category: item.category,
          reason: item.whyItMatters,
          businessName: item.businessName,
        },
        'Useful local discovery — not urgent.',
      ),
      bestUse: bestUseFor(item),
      verificationGap: gap,
      sourceUrl: item.sourceUrl,
      contentItemId: item.id,
      href: `/discoveries/${item.id}`,
    });
  }

  return out;
}
