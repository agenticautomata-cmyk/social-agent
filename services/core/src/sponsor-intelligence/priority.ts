import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { outreachEmails } from '../schema.js';
import type { SponsorRecommendation } from './recommendations.js';

export type SponsorBriefingLink = {
  label: string;
  href: string;
};

/** Contact statuses that mean "already engaged" — a Home "Finish pitch" nudge would be stale/wrong. */
const ALREADY_ENGAGED_CONTACT_STATUSES = new Set([
  'scheduled',
  'sent',
  'replied',
  'follow_up_needed',
  'converted',
  'not_interested',
]);

export function shouldPromoteSponsorCandidate(rec: SponsorRecommendation): boolean {
  // Once a contact has moved past "lead"/"ready_to_contact" it has already
  // been engaged (contacted via email, site form, DM, etc). Re-prompting
  // "Finish pitch" here would contradict the pipeline and re-litigate a pitch
  // that's already in flight or resolved.
  if (rec.sponsorContactStatus && ALREADY_ENGAGED_CONTACT_STATUSES.has(rec.sponsorContactStatus)) {
    return false;
  }
  if (/^KC Sipps:/i.test(rec.title)) return false;
  if (rec.recommendedPitchAngle === 'NO VALID ANGLE') return false;
  if (rec.suggestedContentAngle === 'NO VALID ANGLE') return false;
  return rec.scores.contactFirst >= 70;
}

export function emailApprovalsHref(outreachEmailId?: string | null): string {
  return outreachEmailId ? `/email/approvals?id=${outreachEmailId}` : '/email/approvals';
}

export function sponsorBriefingLinkFromCandidate(
  rec: SponsorRecommendation,
  options?: { outreachEmailId?: string | null },
): SponsorBriefingLink {
  if (rec.sponsorContactId) {
    return {
      label: `Finish pitch email: ${rec.businessName}`,
      href: options?.outreachEmailId
        ? emailApprovalsHref(options.outreachEmailId)
        : `/sponsors/${rec.sponsorContactId}`,
    };
  }
  return {
    label: `Start sponsor pitch: ${rec.businessName}`,
    href: `/sponsor-intelligence`,
  };
}

/** Latest Benson pitch awaiting approval for a sponsor contact, if any. */
export async function findNeedsApprovalEmailIdForContact(
  sponsorContactId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: outreachEmails.id })
    .from(outreachEmails)
    .where(
      and(
        eq(outreachEmails.sponsorContactId, sponsorContactId),
        eq(outreachEmails.status, 'needs_approval'),
      ),
    )
    .orderBy(desc(outreachEmails.updatedAt))
    .limit(1);
  return row?.id ?? null;
}

export async function resolveSponsorBriefingLink(
  rec: SponsorRecommendation,
): Promise<SponsorBriefingLink> {
  if (!rec.sponsorContactId) return sponsorBriefingLinkFromCandidate(rec);
  const outreachEmailId = await findNeedsApprovalEmailIdForContact(rec.sponsorContactId);
  return sponsorBriefingLinkFromCandidate(rec, { outreachEmailId });
}
