import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { discoveryEmailMessages, newsletterBackfillRuns } from '../schema.js';
import { listGmailMessageIds } from '../gmail-inbox/messages.js';
import { fetchDiscoveryMessage } from '../gmail-inbox/message-parse.js';
import { headerValue, parseFromHeader } from '../gmail-inbox/client.js';
import { processDiscoveryEmailMessage } from '../gmail-inbox/discovery-process.js';
import { processNewsletterEmailRouted } from './pipeline-router.js';
import {
  classifyNewsletterEmail,
  isProcessableNewsletterCategory,
  senderDomainFromEmail,
} from './classify.js';
import type { NewsletterBackfillReport } from './types.js';

function emptyReport(): NewsletterBackfillReport {
  return {
    emailsScanned: 0,
    relevantNewsletters: 0,
    ignoredTransactional: 0,
    ignoredPersonal: 0,
    entitiesFound: 0,
    restaurantEntities: 0,
    retailEntities: 0,
    eventEntities: 0,
    occurrencesExtracted: 0,
    datedOccurrences: 0,
    locationsExtracted: 0,
    officialLinksFound: 0,
    duplicatesMerged: 0,
    expiredItems: 0,
    conflictedItems: 0,
    needsOcr: 0,
    needsVerification: 0,
    recordsCreated: 0,
    recordsUpdated: 0,
    unchangedRerun: 0,
    errors: [],
  };
}

export async function runNewsletterBackfill(options: {
  dryRun?: boolean;
  sinceDays?: number;
  maxMessages?: number;
}): Promise<{ runId: string; report: NewsletterBackfillReport }> {
  const dryRun = options.dryRun !== false;
  const sinceDays = options.sinceDays ?? 180;
  const maxMessages = options.maxMessages ?? 200;
  const report = emptyReport();

  const [runRow] = await db
    .insert(newsletterBackfillRuns)
    .values({ dryRun, sinceDays, status: 'running' })
    .returning();

  const query = `in:inbox newer_than:${sinceDays}d (to:discoveries@kckellie.com OR deliveredto:discoveries@kckellie.com)`;

  try {
    const ids = await listGmailMessageIds(query, maxMessages);
    report.emailsScanned = ids.length;

    for (const messageId of ids) {
      try {
        const existing = await db.query.discoveryEmailMessages.findFirst({
          where: eq(discoveryEmailMessages.gmailMessageId, messageId),
        });

        if (existing?.processingStatus === 'processed' && existing.contentFingerprint) {
          report.unchangedRerun += 1;
          continue;
        }

        if (!dryRun && !existing) {
          await processDiscoveryEmailMessage(messageId);
          continue;
        }

        const message = await fetchDiscoveryMessage(messageId);
        if (!message) continue;

        const fromRaw = headerValue(message.headers, 'From') ?? '';
        const parsedFrom = parseFromHeader(fromRaw);
        const subject = headerValue(message.headers, 'Subject') ?? message.snippet ?? '';
        const category = classifyNewsletterEmail({
          subject,
          bodyText: message.bodyText,
          bodyHtml: message.bodyHtml,
          senderEmail: parsedFrom.email,
          senderName: parsedFrom.name,
        });

        if (category === 'transactional_email') {
          report.ignoredTransactional += 1;
          continue;
        }
        if (category === 'personal_email') {
          report.ignoredPersonal += 1;
          continue;
        }
        if (!isProcessableNewsletterCategory(category)) continue;

        report.relevantNewsletters += 1;

        const routed = await processNewsletterEmailRouted({
          message,
          subject,
          senderEmail: parsedFrom.email,
          senderName: parsedFrom.name,
          discoveryEmailMessageId: existing?.id ?? messageId,
          dryRun,
          emailSentAt: message.internalDate,
        });
        const result = routed.mode === 'legacy' ? routed.result : routed.legacy;

        report.entitiesFound += result.entitiesCreated + result.entitiesUpdated;
        report.occurrencesExtracted += result.occurrencesCreated + result.occurrencesUpdated;
        report.duplicatesMerged += result.duplicatesMerged;
        report.needsOcr += result.needsOcr ? 1 : 0;
        report.needsVerification += result.needsVerification;
        report.recordsCreated += result.entitiesCreated + result.occurrencesCreated;
        report.recordsUpdated += result.entitiesUpdated + result.occurrencesUpdated;
      } catch (err) {
        report.errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    await db
      .update(newsletterBackfillRuns)
      .set({
        status: 'completed',
        completedAt: new Date(),
        report,
      })
      .where(eq(newsletterBackfillRuns.id, runRow!.id));

    return { runId: runRow!.id, report };
  } catch (err) {
    const messageText = err instanceof Error ? err.message : String(err);
    report.errors.push(messageText);
    await db
      .update(newsletterBackfillRuns)
      .set({
        status: 'failed',
        completedAt: new Date(),
        report,
      })
      .where(eq(newsletterBackfillRuns.id, runRow!.id));
    throw err;
  }
}
