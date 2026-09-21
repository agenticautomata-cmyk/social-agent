import { desc, ilike, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { discoveryEmailMessages } from '../schema.js';
import { ingestOpeningRoundup } from './pipeline.js';
import type { OpeningIngestResult } from './types.js';

/**
 * Bounded backfill over recent editorial emails.
 * Does NOT seed fixtures into production — fixture bodies are test-only.
 */
export async function backfillOpeningsRadar(input?: {
  sinceDays?: number;
  limit?: number;
  dryRun?: boolean;
  /** @deprecated Ignored — fixtures are never inserted into production. */
  includeFixtureIfMissing?: boolean;
  fetchArticle?: boolean;
}): Promise<{
  emailsExamined: number;
  runs: OpeningIngestResult[];
  fixtureUsed: boolean;
  bigListFound: boolean;
}> {
  const sinceDays = input?.sinceDays ?? 90;
  const limit = Math.min(input?.limit ?? 40, 80);
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(discoveryEmailMessages)
    .where(
      or(
        ilike(discoveryEmailMessages.subject, '%opening%'),
        ilike(discoveryEmailMessages.subject, '%BIG LIST%'),
        ilike(discoveryEmailMessages.subject, '%coming soon%'),
        ilike(discoveryEmailMessages.senderEmail, '%kcinsiders%'),
        sql`${discoveryEmailMessages.bodyText} ILIKE ${'%opening soon%'}`,
      )!,
    )
    .orderBy(desc(discoveryEmailMessages.receivedAt))
    .limit(limit);

  const recent = rows.filter((r) => !r.receivedAt || r.receivedAt >= since);
  const runs: OpeningIngestResult[] = [];
  let bigListFound = false;

  // Sequential — memory-tight host
  for (const row of recent) {
    const subject = row.subject ?? '';
    if (/BIG LIST|Who.?s Opening/i.test(subject)) bigListFound = true;
    const result = await ingestOpeningRoundup({
      subject,
      bodyText: row.bodyText ?? '',
      urls: (row.urls as string[]) ?? [],
      gmailMessageId: row.gmailMessageId,
      discoveryEmailMessageId: row.id,
      senderEmail: row.senderEmail,
      senderName: row.senderName,
      receivedAt: row.receivedAt ?? undefined,
      dryRun: input?.dryRun,
      fetchArticle: input?.fetchArticle ?? true,
      channel: 'email',
      force: false,
    });
    if (result.entriesParsed > 0 || result.rejected[0]?.reason !== 'not_opening_roundup') {
      runs.push(result);
    }
  }

  return {
    emailsExamined: recent.length,
    runs,
    fixtureUsed: false,
    bigListFound,
  };
}
