import { eq } from 'drizzle-orm';
import { db } from '../../db.js';
import { discoveryEmailMessages } from '../../schema.js';
import { fetchDiscoveryMessage } from '../../gmail-inbox/message-parse.js';
import { processEditorialEmailOpportunities } from './pipeline.js';
import type { EditorialOpportunityRunResult } from './types.js';

/**
 * Reprocess a monitored discovery email for editorial opportunities.
 * Uses the same production classifier path as first-time ingest.
 * Safe to run twice — dedupe merges provenance and creates zero new logical opportunities.
 */
export async function reprocessEditorialDiscoveryEmail(input: {
  gmailMessageId?: string;
  discoveryEmailMessageId?: string;
  dryRun?: boolean;
  notifyTelegram?: boolean;
  fetchArticle?: boolean;
}): Promise<EditorialOpportunityRunResult & { discoveryRowId: string }> {
  let row =
    input.discoveryEmailMessageId
      ? await db.query.discoveryEmailMessages.findFirst({
          where: eq(discoveryEmailMessages.id, input.discoveryEmailMessageId),
        })
      : null;

  if (!row && input.gmailMessageId) {
    row = await db.query.discoveryEmailMessages.findFirst({
      where: eq(discoveryEmailMessages.gmailMessageId, input.gmailMessageId),
    });
  }

  if (!row) {
    throw new Error('discovery_email_not_found');
  }

  // Prefer live Gmail body when available; fall back to stored text/urls.
  const live = await fetchDiscoveryMessage(row.gmailMessageId).catch(() => null);
  const bodyText = live?.bodyText?.trim() ? live.bodyText : row.bodyText ?? '';
  const bodyHtml = live?.bodyHtml ?? '';
  const urls = live?.urls?.length ? live.urls : ((row.urls as string[] | null) ?? []);

  const result = await processEditorialEmailOpportunities({
    gmailMessageId: row.gmailMessageId,
    discoveryEmailMessageId: row.id,
    subject: row.subject ?? live?.snippet ?? 'Discovery email',
    bodyText,
    bodyHtml,
    urls,
    senderEmail: row.senderEmail,
    senderName: row.senderName,
    receivedAt: row.receivedAt ?? undefined,
    dryRun: input.dryRun,
    notifyTelegram: input.notifyTelegram,
    fetchArticle: input.fetchArticle,
  });

  if (!input.dryRun) {
    const status =
      result.opportunitiesCreated > 0
        ? 'processed'
        : result.opportunitiesMerged > 0
          ? 'duplicate'
          : row.processingStatus === 'processed'
            ? row.processingStatus
            : result.candidates.length === 0
              ? 'skipped'
              : 'processed';

    await db
      .update(discoveryEmailMessages)
      .set({
        processingStatus: status,
        processingError:
          result.opportunitiesCreated > 0 || result.opportunitiesMerged > 0
            ? null
            : result.rejected[0]?.reason ?? row.processingError,
        contentItemId: result.contentItemIds[0] ?? row.contentItemId,
        messageKind: 'editorial_opportunity',
        entitiesExtracted: Math.max(row.entitiesExtracted ?? 0, result.candidates.length),
        updatedAt: new Date(),
      })
      .where(eq(discoveryEmailMessages.id, row.id));
  }

  return { ...result, discoveryRowId: row.id };
}
