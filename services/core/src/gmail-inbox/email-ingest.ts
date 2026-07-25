import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, contentItems, sources } from '../schema.js';
import { persistIngestedContentItem } from '../scanner/ingest-persist.js';
import { recommendCoverageFormat } from '../coverage-format/recommend.js';
import { findDuplicateBySubjectTitle } from '../green-screen/duplicates.js';
import { extractIntakeSubmission } from '../intake/openai-extract.js';
import { markSubscriptionNewsletterReceived } from '../discovery-subscriptions/index.js';
import { headerValue, parseFromHeader } from './client.js';
import type { ParsedDiscoveryMessage } from './message-parse.js';

const DISCOVERY_SOURCE_NAME = 'Discovery Email';
const DIGEST_SOURCE_NAME = 'Email Digest';

export type EmailIngestResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  contentItemId?: string;
  duplicateOfContentItemId?: string;
  title?: string;
};

async function defaultCampaignId(): Promise<string> {
  const row = await db.query.campaigns.findFirst({
    where: eq(campaigns.active, true),
  });
  if (!row) throw new Error('no active campaign');
  return row.id;
}

async function getOrCreateSource(campaignId: string, sourceName: string, ingestKey: string): Promise<string> {
  const existing = await db.query.sources.findFirst({
    where: and(eq(sources.campaignId, campaignId), eq(sources.name, sourceName)),
  });
  if (existing) return existing.id;

  const [created] = await db
    .insert(sources)
    .values({
      campaignId,
      type: 'manual',
      name: sourceName,
      config: { ingest: ingestKey },
      active: true,
    })
    .returning({ id: sources.id });

  return created!.id;
}

export async function ingestEmailMessageAsOpportunity(input: {
  message: ParsedDiscoveryMessage;
  subject: string;
  sourceName?: typeof DISCOVERY_SOURCE_NAME | typeof DIGEST_SOURCE_NAME;
  ingestKey?: 'discovery_email' | 'email_digest';
  externalIdPrefix?: string;
  originalRecipient?: string | null;
  activeSubscriptionId?: string | null;
  skipDuplicateCheck?: boolean;
}): Promise<EmailIngestResult> {
  const {
    message,
    subject,
    sourceName = DISCOVERY_SOURCE_NAME,
    ingestKey = 'discovery_email',
    externalIdPrefix = 'discovery-email',
    originalRecipient = null,
    activeSubscriptionId = null,
    skipDuplicateCheck = false,
  } = input;

  if (!skipDuplicateCheck) {
    const duplicate = await findDuplicateBySubjectTitle(subject);
    if (duplicate) {
      if (activeSubscriptionId) {
        await markSubscriptionNewsletterReceived(
          activeSubscriptionId,
          message.internalDate ?? new Date(),
          duplicate.id,
        );
      }
      return {
        ok: true,
        skipped: true,
        reason: 'duplicate_opportunity',
        contentItemId: duplicate.id,
        duplicateOfContentItemId: duplicate.id,
        title: duplicate.title,
      };
    }
  }

  const parsedFrom = parseFromHeader(headerValue(message.headers, 'From') ?? '');
  const extracted = await extractIntakeSubmission({
    intakeType: message.urls.length ? 'mixed' : 'text',
    url: message.urls[0] ?? null,
    text: message.bodyText.slice(0, 8000),
    notes: `Email from ${parsedFrom.email ?? 'unknown sender'} — ${subject}`,
    hasImage: false,
  });

  const campaignId = await defaultCampaignId();
  const sourceId = await getOrCreateSource(campaignId, sourceName, ingestKey);
  const externalId = `${externalIdPrefix}-${message.id}`;
  const title = extracted.extracted_title?.trim() || subject.slice(0, 200);

  const outcome = await persistIngestedContentItem(
    sourceId,
    externalId,
    () => ({
      campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: title,
      hook: extracted.ai_summary?.slice(0, 500) ?? null,
      script: message.bodyText.slice(0, 4000),
      sourceId,
      sourceExternalId: externalId,
      sourceUrl: message.urls[0] ?? null,
      discoveredAt: message.internalDate ?? new Date(),
      eventStartsAt: extracted.extracted_date,
      locationName: extracted.extracted_location,
      metadata: {
        ingest: ingestKey,
        opportunityCategory: extracted.extracted_category,
        tags: extracted.extracted_tags ?? [],
        emailIngest: {
          gmailMessageId: message.id,
          originalRecipient,
          senderEmail: parsedFrom.email,
          subject,
          urls: message.urls,
        },
        ...(activeSubscriptionId ? { discoverySubscriptionId: activeSubscriptionId } : {}),
      },
    }),
    { sourceUrl: message.urls[0] ?? null },
  );

  const contentRow = await db.query.contentItems.findFirst({
    where: and(eq(contentItems.sourceId, sourceId), eq(contentItems.sourceExternalId, externalId)),
  });

  if (contentRow) {
    const suggested = recommendCoverageFormat({
      title: contentRow.topic,
      summary: contentRow.script ?? contentRow.hook,
      category: extracted.extracted_category,
      eventStartsAt: contentRow.eventStartsAt,
      locationName: contentRow.locationName,
      sourceUrl: contentRow.sourceUrl,
      metadata: contentRow.metadata as Record<string, unknown>,
    });

    await db
      .update(contentItems)
      .set({ suggestedCoverageFormat: suggested, updatedAt: new Date() })
      .where(eq(contentItems.id, contentRow.id));
  }

  if (activeSubscriptionId && contentRow) {
    await markSubscriptionNewsletterReceived(
      activeSubscriptionId,
      message.internalDate ?? new Date(),
      contentRow.id,
    );
  }

  return {
    ok: true,
    contentItemId: contentRow?.id,
    title,
    skipped: outcome === 'updated',
    reason: outcome === 'updated' ? 'duplicate_opportunity' : undefined,
  };
}
