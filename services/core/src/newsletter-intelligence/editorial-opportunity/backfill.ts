import { and, desc, gte, sql } from 'drizzle-orm';
import { db } from '../../db.js';
import { discoveryEmailMessages } from '../../schema.js';
import { hasEditorialOpportunitySignal } from './classifier.js';
import { reprocessEditorialDiscoveryEmail } from './reprocess.js';

export type EditorialBackfillReport = {
  emailsExamined: number;
  possibleOpportunitiesDetected: number;
  opportunitiesCreated: number;
  duplicatesSuppressed: number;
  rejectedItems: number;
  blockedLinks: number;
  sampleRecovered: Array<{
    subject: string;
    gmailMessageId: string;
    businessNames: string[];
    contentItemIds: string[];
  }>;
  runIds: string[];
};

/**
 * Bounded historical recovery over recent monitored editorial emails.
 */
export async function backfillEditorialEmailOpportunities(input?: {
  sinceDays?: number;
  maxEmails?: number;
  dryRun?: boolean;
  notifyTelegram?: boolean;
}): Promise<EditorialBackfillReport> {
  const sinceDays = Math.min(Math.max(input?.sinceDays ?? 30, 1), 90);
  const maxEmails = Math.min(Math.max(input?.maxEmails ?? 40, 1), 100);
  const since = new Date(Date.now() - sinceDays * 86400000);

  const rows = await db
    .select({
      id: discoveryEmailMessages.id,
      gmailMessageId: discoveryEmailMessages.gmailMessageId,
      subject: discoveryEmailMessages.subject,
      bodyText: discoveryEmailMessages.bodyText,
      processingStatus: discoveryEmailMessages.processingStatus,
      processingError: discoveryEmailMessages.processingError,
    })
    .from(discoveryEmailMessages)
    .where(
      and(
        gte(discoveryEmailMessages.receivedAt, since),
        sql`(${discoveryEmailMessages.bodyText} is not null)`,
      ),
    )
    .orderBy(desc(discoveryEmailMessages.receivedAt))
    .limit(maxEmails * 3);

  const report: EditorialBackfillReport = {
    emailsExamined: 0,
    possibleOpportunitiesDetected: 0,
    opportunitiesCreated: 0,
    duplicatesSuppressed: 0,
    rejectedItems: 0,
    blockedLinks: 0,
    sampleRecovered: [],
    runIds: [],
  };

  for (const row of rows) {
    if (report.emailsExamined >= maxEmails) break;
    const blob = `${row.subject ?? ''}\n${row.bodyText ?? ''}`;
    if (!hasEditorialOpportunitySignal(blob)) continue;

    report.emailsExamined += 1;
    report.possibleOpportunitiesDetected += 1;

    const result = await reprocessEditorialDiscoveryEmail({
      discoveryEmailMessageId: row.id,
      dryRun: input?.dryRun,
      notifyTelegram: input?.notifyTelegram ?? false,
      fetchArticle: true,
    });

    report.runIds.push(result.runId);
    report.opportunitiesCreated += result.opportunitiesCreated;
    report.duplicatesSuppressed += result.opportunitiesMerged;
    report.rejectedItems += result.opportunitiesRejected;
    if (
      result.articleAccess === 'blocked' ||
      result.articleAccess === 'subscription_required' ||
      result.articleAccess === 'robots_disallowed'
    ) {
      report.blockedLinks += 1;
    }

    if (result.contentItemIds.length > 0 && report.sampleRecovered.length < 8) {
      report.sampleRecovered.push({
        subject: row.subject ?? '',
        gmailMessageId: row.gmailMessageId,
        businessNames: result.candidates.map((c) => c.businessName),
        contentItemIds: result.contentItemIds,
      });
    }
  }

  return report;
}
