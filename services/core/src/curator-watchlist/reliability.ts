import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { curatorEventLeads, curatorReliabilityStats } from '../schema.js';

export async function refreshCuratorReliability(watcherId: string): Promise<void> {
  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      verified: sql<number>`count(*) filter (where verification_status = 'VERIFIED')::int`,
      partial: sql<number>`count(*) filter (where verification_status = 'PARTIALLY_VERIFIED')::int`,
      conflicted: sql<number>`count(*) filter (where verification_status = 'CONFLICTED')::int`,
      expired: sql<number>`count(*) filter (where verification_status = 'EXPIRED')::int`,
      dismissed: sql<number>`count(*) filter (where dismissed_at is not null)::int`,
      ignored: sql<number>`count(*) filter (where creator_recommendation = 'ignore')::int`,
    })
    .from(curatorEventLeads)
    .where(eq(curatorEventLeads.watcherId, watcherId));

  const total = Number(counts?.total ?? 0);
  const verified = Number(counts?.verified ?? 0);
  const partial = Number(counts?.partial ?? 0);
  const conflicted = Number(counts?.conflicted ?? 0);
  const expired = Number(counts?.expired ?? 0);
  const dismissed = Number(counts?.dismissed ?? 0);
  const ignored = Number(counts?.ignored ?? 0);

  const verificationRate = total > 0 ? verified / total : 0;
  const conflictRate = total > 0 ? conflicted / total : 0;
  const noiseRate = total > 0 ? (dismissed + ignored + expired) / total : 0;
  const reliabilityScore = Math.min(
    0.99,
    verificationRate * 0.5 + (partial / Math.max(total, 1)) * 0.2 + (1 - conflictRate) * 0.2 + (1 - noiseRate) * 0.1,
  );

  await db
    .insert(curatorReliabilityStats)
    .values({
      watcherId,
      leadsExtracted: total,
      leadsVerified: verified,
      leadsPartiallyVerified: partial,
      leadsConflicted: conflicted,
      leadsExpired: expired,
      verificationRate: String(verificationRate),
      conflictRate: String(conflictRate),
      noiseRate: String(noiseRate),
      reliabilityScore: String(reliabilityScore),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: curatorReliabilityStats.watcherId,
      set: {
        leadsExtracted: total,
        leadsVerified: verified,
        leadsPartiallyVerified: partial,
        leadsConflicted: conflicted,
        leadsExpired: expired,
        verificationRate: String(verificationRate),
        conflictRate: String(conflictRate),
        noiseRate: String(noiseRate),
        reliabilityScore: String(reliabilityScore),
        updatedAt: new Date(),
      },
    });
}

export async function incrementCuratorRunStats(
  watcherId: string,
  input: { postsProcessed: number; slidesProcessed: number },
): Promise<void> {
  const [existing] = await db
    .select()
    .from(curatorReliabilityStats)
    .where(eq(curatorReliabilityStats.watcherId, watcherId))
    .limit(1);

  const posts = (existing?.postsProcessed ?? 0) + input.postsProcessed;
  const slides = (existing?.slidesProcessed ?? 0) + input.slidesProcessed;

  await db
    .insert(curatorReliabilityStats)
    .values({
      watcherId,
      postsProcessed: posts,
      slidesProcessed: slides,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: curatorReliabilityStats.watcherId,
      set: { postsProcessed: posts, slidesProcessed: slides, updatedAt: new Date() },
    });
}
