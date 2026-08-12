import type { PartnershipResearch } from './types.js';

export type StoryAngleCandidate = {
  angle: string;
  premiseTags: Array<'verified' | 'inferred' | 'blocked'>;
  blockedReason?: string;
};

export type SanitizedStoryAngle = {
  angle: string;
  status: 'verified' | 'inferred' | 'blocked';
  blockedReason?: string;
};

/**
 * Deterministic sanitize of LLM story angle candidates against verification gaps.
 * No additional model call.
 */
export function sanitizeStoryAngles(
  candidates: StoryAngleCandidate[] | undefined,
  research: PartnershipResearch,
): SanitizedStoryAngle[] {
  const blockedPremises = new Set(
    (research.needsVerification ?? [])
      .map((n) => n.replace(/^NEEDS VERIFICATION:\s*/i, '').toLowerCase())
      .filter(Boolean),
  );

  const inventoryUnresolved =
    research.localFilmingPotential?.status === 'needs_verification' ||
    (research.localLocations ?? []).some(
      (l) =>
        l.availability !== 'confirmed_available' && l.availability !== 'confirmed_unavailable',
    );

  const out: SanitizedStoryAngle[] = [];
  for (const candidate of candidates ?? []) {
    const angle = candidate.angle?.trim();
    if (!angle) continue;

    const mentionsInStore = /\b(in[- ]store|on the floor|filming at|at the store)\b/i.test(angle);
    if (mentionsInStore && inventoryUnresolved) {
      out.push({
        angle,
        status: 'blocked',
        blockedReason: 'In-store inventory not confirmed — verify before using this angle.',
      });
      continue;
    }

    const taggedBlocked = candidate.premiseTags?.includes('blocked');
    if (taggedBlocked || candidate.blockedReason) {
      out.push({
        angle,
        status: 'blocked',
        blockedReason: candidate.blockedReason ?? 'Blocked by verification constraints.',
      });
      continue;
    }

    const hitsGap = [...blockedPremises].some((gap) => angle.toLowerCase().includes(gap.slice(0, 24)));
    if (hitsGap) {
      out.push({
        angle,
        status: 'blocked',
        blockedReason: 'Angle depends on an unresolved verification gap.',
      });
      continue;
    }

    const status = candidate.premiseTags?.includes('verified')
      ? 'verified'
      : candidate.premiseTags?.includes('inferred')
        ? 'inferred'
        : 'inferred';
    out.push({ angle, status });
  }

  return out.slice(0, 5);
}
