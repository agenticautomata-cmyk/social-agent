import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, sponsorContacts, outreachEmails } from '../schema.js';
import { classifyContactVerification, normalizeCompanyName } from './pitch-readiness.js';

export type CleanupReport = {
  totalRawRecords: number;
  activeCreatorCandidates: number;
  actionableOpportunities: number;
  topPicks: number;
  expiredArchived: number;
  hiddenByCategory: number;
  contactsNormalized: number;
  invalidContactsMarked: number;
  pitchReadyCount: number;
  suppressedEntities: number;
};

export async function runCreatorAgentCleanup(): Promise<CleanupReport> {
  const totals = await db.execute(sql`
    SELECT
      count(*)::int AS total_raw,
      count(*) FILTER (WHERE creator_value_status = 'creator_candidate')::int AS creator_candidates,
      count(*) FILTER (WHERE creator_value_status = 'actionable')::int AS actionable,
      count(*) FILTER (WHERE creator_value_status = 'top_pick')::int AS top_picks,
      count(*) FILTER (WHERE lifecycle_status IN ('expired','archived'))::int AS expired_archived,
      count(*) FILTER (WHERE creator_value_status = 'hidden_raw_signal')::int AS hidden_raw
    FROM content_items
    WHERE source_id IS NOT NULL
  `);

  const row = (totals[0] ?? {}) as Record<string, number>;

  const contacts = await db.select().from(sponsorContacts).limit(5000);
  let contactsNormalized = 0;
  let invalidContactsMarked = 0;
  for (const contact of contacts) {
    const normalized = normalizeCompanyName(contact.businessName);
    const verification = classifyContactVerification(contact);
    const needsUpdate =
      normalized !== contact.businessName ||
      verification !== contact.contactVerificationStatus;
    if (needsUpdate) {
      contactsNormalized += 1;
      if (verification === 'invalid' || verification === 'missing') invalidContactsMarked += 1;
      await db
        .update(sponsorContacts)
        .set({
          businessName: normalized,
          contactVerificationStatus: verification,
          updatedAt: new Date(),
        })
        .where(sql`${sponsorContacts.id} = ${contact.id}`);
    }
  }

  const pitchReady = await db.execute(sql`
    SELECT count(*)::int AS c
    FROM outreach_emails
    WHERE pitch_readiness_status = 'pitch_ready'
      AND status = 'needs_approval'
  `);

  const suppressed = await db.execute(sql`
    SELECT count(*)::int AS c FROM entity_suppressions WHERE restored_at IS NULL
  `);

  return {
    totalRawRecords: row.total_raw ?? 0,
    activeCreatorCandidates: row.creator_candidates ?? 0,
    actionableOpportunities: row.actionable ?? 0,
    topPicks: row.top_picks ?? 0,
    expiredArchived: row.expired_archived ?? 0,
    hiddenByCategory: row.hidden_raw ?? 0,
    contactsNormalized,
    invalidContactsMarked,
    pitchReadyCount: Number((pitchReady[0] as Record<string, number> | undefined)?.c ?? 0),
    suppressedEntities: Number((suppressed[0] as Record<string, number> | undefined)?.c ?? 0),
  };
}
