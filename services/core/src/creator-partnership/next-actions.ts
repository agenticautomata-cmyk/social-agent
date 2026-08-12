import type { PartnershipResearch } from './types.js';
import type { SanitizedStoryAngle } from './story-angles.js';
import { getCreatorLocalScope } from './creator-local-scope.js';

export type NextActionInput = {
  action: string;
  rationale: string;
  blockedBy?: string[];
};

export type RankedNextAction = {
  action: string;
  why: string;
  href?: string;
  priority: number;
};

const ACTION_ALIASES: Record<string, string> = {
  verify_inventory: 'call_location',
  call_location: 'call_location',
  research_further: 'research_further',
  apply_creator_program: 'apply_creator_program',
  apply_affiliate_platform: 'apply_affiliate_platform',
  request_filming_access: 'request_filming_access',
  build_creator_play: 'build_creator_play',
  save_monitor: 'save_monitor',
  wait_platform_approval: 'wait_platform_approval',
  pitch_brand: 'pitch_brand',
};

/**
 * Deterministic ranking of next-best actions from synthesis inputs + research state.
 */
export function rankPartnershipNextActions(input: {
  partnershipId: string;
  research: PartnershipResearch;
  nextActionInputs?: NextActionInput[];
  storyAngles?: SanitizedStoryAngle[];
  fitScore?: number | null;
}): RankedNextAction[] {
  const { partnershipId, research } = input;
  const baseHref = `/partnerships/${partnershipId}`;
  const ranked: RankedNextAction[] = [];
  const seen = new Set<string>();

  const inventoryUnresolved =
    research.localFilmingPotential?.status === 'needs_verification' ||
    (research.needsVerification ?? []).some((n) => /inventory|store|filming/i.test(n)) ||
    (research.localLocations ?? []).some(
      (l) =>
        l.availability !== 'confirmed_available' && l.availability !== 'confirmed_unavailable',
    );

  const programFound =
    research.creatorProgram?.status === 'verified' ||
    research.creatorProgram?.status === 'inferred';

  const push = (action: string, why: string, priority: number, href?: string) => {
    const key = ACTION_ALIASES[action] ?? action;
    if (seen.has(key)) return;
    seen.add(key);
    ranked.push({ action: key, why, priority, href });
  };

  if (inventoryUnresolved) {
    push(
      'call_location',
      'Store/local inventory is unresolved — verify before in-store filming.',
      100,
      `${baseHref}`,
    );
  }

  if (!programFound) {
    push('research_further', 'Creator/affiliate program details still need verification.', 80);
  } else {
    push(
      'apply_creator_program',
      'A creator or affiliate program path was found — review and apply when ready.',
      70,
      baseHref,
    );
  }

  if ((input.fitScore ?? 0) >= 40 && research.researchedAt) {
    push(
      'build_creator_play',
      'Research is far enough along to draft a Creator Play.',
      60,
      baseHref,
    );
  }

  if (!getCreatorLocalScope().configured) {
    push(
      'research_further',
      'Creator local scope is not configured — local filming relevance remains unresolved.',
      55,
    );
  }

  for (const raw of input.nextActionInputs ?? []) {
    const action = (ACTION_ALIASES[raw.action] ?? raw.action).trim();
    if (!action || action === 'pitch_brand') continue; // never auto-pitch
    if (raw.blockedBy?.length) {
      push(action, `${raw.rationale} (blocked: ${raw.blockedBy.join(', ')})`, 40, baseHref);
    } else {
      push(action, raw.rationale || action, 50, baseHref);
    }
  }

  if (ranked.length === 0) {
    push('save_monitor', 'Save and monitor — more verification needed before acting.', 10, baseHref);
  }

  return ranked.sort((a, b) => b.priority - a.priority).slice(0, 3);
}
