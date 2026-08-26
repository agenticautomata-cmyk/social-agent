import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, contentItems, sources } from '../schema.js';
import { emitDataChange } from '../data-revision/index.js';
import { setIngestDryRun } from '../scanner/ingest-persist.js';
import { markSubscriptionNewsletterReceived } from '../discovery-subscriptions/index.js';
import { rootDomain } from '../discovery-subscriptions/extract.js';
import {
  classifyNewsletterEmail,
  isProcessableNewsletterCategory,
  senderDomainFromEmail,
} from './classify.js';
import { computeEmailContentFingerprint, extractNewsletterItems } from './extract.js';
import {
  persistNewsletterInventoryItem,
  findExistingEntityByKey,
} from './persist.js';
import { evaluateNewsletterItem } from './quality-gates.js';
import { prefilterNewsletterEmail } from './prefilter.js';
import { resolveNewsletterUrls, pickCanonicalSourceUrl } from './resolve-links.js';
import {
  attachInventoryEvidence,
  recordNewsletterSourceStats,
  updateDiscoveryEmailParseStats,
  upsertNewsletterSource,
} from './sources.js';
import type { NewsletterParseContext, NewsletterParseResult } from './types.js';
import type { ParsedDiscoveryMessage } from '../gmail-inbox/message-parse.js';
import { normalizeBusinessKey } from '../creator-interest/normalize.js';
import { resolveDiscoveryOccurrenceOutcome } from './occurrence-outcome.js';

const NEWSLETTER_SOURCE_NAME = 'Newsletter Intelligence';

async function defaultCampaignId(): Promise<string> {
  const row = await db.query.campaigns.findFirst({ where: eq(campaigns.active, true) });
  if (!row) throw new Error('no active campaign');
  return row.id;
}

async function getOrCreateNewsletterSourceId(campaignId: string): Promise<string> {
  const existing = await db.query.sources.findFirst({
    where: and(eq(sources.campaignId, campaignId), eq(sources.name, NEWSLETTER_SOURCE_NAME)),
  });
  if (existing) return existing.id;
  const [created] = await db
    .insert(sources)
    .values({
      campaignId,
      type: 'manual',
      name: NEWSLETTER_SOURCE_NAME,
      config: { ingest: 'newsletter_intelligence' },
      active: true,
    })
    .returning({ id: sources.id });
  return created!.id;
}

export async function processNewsletterEmail(input: {
  message: ParsedDiscoveryMessage;
  subject: string;
  senderEmail: string | null;
  senderName: string | null;
  discoveryEmailMessageId: string;
  discoverySubscriptionId?: string | null;
  originalRecipient?: string | null;
  dryRun?: boolean;
  forceReprocess?: boolean;
  fromEnabledNewsletterSource?: boolean;
}): Promise<NewsletterParseResult> {
  const {
    message,
    subject,
    senderEmail,
    senderName,
    discoveryEmailMessageId,
    discoverySubscriptionId,
    dryRun = false,
    fromEnabledNewsletterSource = false,
  } = input;

  const senderDomain = senderDomainFromEmail(senderEmail) ?? 'unknown';
  const contentFingerprint = computeEmailContentFingerprint({
    gmailMessageId: message.id,
    subject,
    senderEmail,
    bodyText: message.bodyText,
  });

  const newsletterCategory = classifyNewsletterEmail({
    subject,
    bodyText: message.bodyText,
    bodyHtml: message.bodyHtml,
    senderEmail,
    senderName,
    fromActiveSubscription: Boolean(discoverySubscriptionId) || fromEnabledNewsletterSource,
  });

  if (!isProcessableNewsletterCategory(newsletterCategory)) {
    const outcome = resolveDiscoveryOccurrenceOutcome({
      skipReason: newsletterCategory,
      datedOccurrencesCreated: 0,
      datedOccurrenceDuplicates: 0,
      extractedItemCount: 0,
    });
    await updateDiscoveryEmailParseStats(discoveryEmailMessageId, {
      newsletterCategory,
      senderDomain,
      contentFingerprint,
      processingStatus: outcome.processingStatus,
      processingError: outcome.processingError,
    });
    return {
      ok: true,
      skipped: true,
      reason: outcome.reason,
      processingStatus: outcome.processingStatus,
      entitiesCreated: 0,
      entitiesUpdated: 0,
      occurrencesCreated: 0,
      occurrencesUpdated: 0,
      datedOccurrencesCreated: 0,
      datedOccurrenceDuplicates: 0,
      quarantined: 0,
      duplicatesMerged: 0,
      contentItemIds: [],
      needsOcr: false,
      needsVerification: 0,
    };
  }

  const prefilter = prefilterNewsletterEmail({
    gmailMessageId: message.id,
    subject,
    bodyText: message.bodyText,
    bodyHtml: message.bodyHtml,
    senderEmail,
    senderName,
    urls: message.urls,
    newsletterCategory,
    persistReject: !dryRun,
  });
  if (!prefilter.pass) {
    const outcome = resolveDiscoveryOccurrenceOutcome({
      skipReason: prefilter.reason,
      datedOccurrencesCreated: 0,
      datedOccurrenceDuplicates: 0,
      extractedItemCount: 0,
    });
    await updateDiscoveryEmailParseStats(discoveryEmailMessageId, {
      newsletterCategory,
      senderDomain,
      contentFingerprint,
      processingStatus: outcome.processingStatus,
      processingError: outcome.processingError,
    });
    return {
      ok: true,
      skipped: true,
      reason: outcome.reason,
      processingStatus: outcome.processingStatus,
      entitiesCreated: 0,
      entitiesUpdated: 0,
      occurrencesCreated: 0,
      occurrencesUpdated: 0,
      datedOccurrencesCreated: 0,
      datedOccurrenceDuplicates: 0,
      quarantined: 0,
      duplicatesMerged: 0,
      contentItemIds: [],
      needsOcr: false,
      needsVerification: 0,
    };
  }

  const newsletterSource = dryRun
    ? null
    : await upsertNewsletterSource({
        senderEmail,
        senderDomain,
        senderName,
        category: newsletterCategory,
        discoverySubscriptionId,
      });

  if (newsletterSource?.status === 'paused' || newsletterSource?.status === 'ignored') {
    return {
      ok: true,
      skipped: true,
      reason: `source_${newsletterSource.status}`,
      processingStatus: 'skipped' as const,
      entitiesCreated: 0,
      entitiesUpdated: 0,
      occurrencesCreated: 0,
      occurrencesUpdated: 0,
      datedOccurrencesCreated: 0,
      datedOccurrenceDuplicates: 0,
      quarantined: 0,
      duplicatesMerged: 0,
      contentItemIds: [],
      needsOcr: false,
      needsVerification: 0,
    };
  }

  const ctx: NewsletterParseContext = {
    gmailMessageId: message.id,
    gmailThreadId: message.threadId,
    senderEmail,
    senderName,
    senderDomain: rootDomain(senderDomain) || senderDomain,
    subject,
    receivedAt: message.internalDate ?? new Date(),
    bodyText: message.bodyText,
    bodyHtml: message.bodyHtml,
    urls: message.urls,
    newsletterSourceId: newsletterSource?.id ?? null,
    newsletterSourceName: newsletterSource?.senderName ?? senderName,
    newsletterCategory,
    discoveryEmailMessageId,
    discoverySubscriptionId: discoverySubscriptionId ?? null,
    isOfficialSender: false,
  };

  setIngestDryRun(dryRun);
  const { items, needsOcr } = await extractNewsletterItems({
    gmailMessageId: message.id,
    subject,
    bodyText: message.bodyText,
    bodyHtml: message.bodyHtml,
    senderName,
    senderEmail,
    newsletterSourceName: ctx.newsletterSourceName,
    urls: message.urls,
    emailSentAt: message.internalDate ?? ctx.receivedAt,
  });

  const resolvedLinks = await resolveNewsletterUrls(message.urls);
  const campaignId = await defaultCampaignId();
  const sourceId = await getOrCreateNewsletterSourceId(campaignId);

  let entitiesCreated = 0;
  let entitiesUpdated = 0;
  let occurrencesCreated = 0;
  let occurrencesUpdated = 0;
  let datedOccurrencesCreated = 0;
  let datedOccurrenceDuplicates = 0;
  let quarantined = 0;
  let duplicatesMerged = 0;
  let needsVerification = 0;
  const datedCandidateCount = items.filter(
    (item) => item.layer === 'occurrence' && Boolean(item.startDate),
  ).length;
  const contentItemIds: string[] = [];
  const entityIdByKey = new Map<string, string>();

  for (const item of items) {
    const gate = evaluateNewsletterItem(item);
    if (!gate.accept) {
      if (gate.quarantine) quarantined += 1;
      continue;
    }

    const businessKey = normalizeBusinessKey(item.entityName);
    let linkedEntityId = entityIdByKey.get(businessKey) ?? null;
    if (!linkedEntityId && item.layer === 'occurrence') {
      const existingEntity = await findExistingEntityByKey(businessKey);
      linkedEntityId = existingEntity?.id ?? null;
    }

    if (item.layer === 'entity' || !linkedEntityId) {
      const entityItem = item.layer === 'entity' ? item : { ...item, layer: 'entity' as const, title: item.entityName };
      const entityResult = await persistNewsletterInventoryItem({
        ctx,
        item: entityItem,
        sourceId,
        campaignId,
        resolvedLinks,
        dryRun,
      });
      if (entityResult) {
        entityIdByKey.set(businessKey, entityResult.contentItemId);
        linkedEntityId = entityResult.contentItemId;
        if (entityResult.created) entitiesCreated += 1;
        else entitiesUpdated += 1;
        if (entityResult.duplicateMerged) duplicatesMerged += 1;
        contentItemIds.push(entityResult.contentItemId);
      }
    }

    if (item.layer === 'occurrence') {
      const occResult = await persistNewsletterInventoryItem({
        ctx,
        item,
        sourceId,
        campaignId,
        resolvedLinks,
        linkedEntityContentItemId: linkedEntityId,
        dryRun,
      });
      if (occResult) {
        if (occResult.created) occurrencesCreated += 1;
        else occurrencesUpdated += 1;
        if (occResult.duplicateMerged) duplicatesMerged += 1;
        if (item.startDate) {
          if (occResult.created) datedOccurrencesCreated += 1;
          else datedOccurrenceDuplicates += 1;
        }
        if (occResult.verificationStatus === 'newsletter_only') needsVerification += 1;
        contentItemIds.push(occResult.contentItemId);

        if (!dryRun) {
          const canonicalUrl = pickCanonicalSourceUrl({
            sourceUrl: item.sourceUrl,
            ticketLink: item.ticketLink,
            reservationLink: item.reservationLink,
            officialWebsite: item.officialWebsite,
            resolved: resolvedLinks,
          });
          await attachInventoryEvidence({
            contentItemId: occResult.contentItemId,
            evidenceType: 'newsletter_email',
            sourceLabel: ctx.newsletterSourceName ?? ctx.senderDomain,
            gmailMessageId: ctx.gmailMessageId,
            discoveryEmailMessageId: ctx.discoveryEmailMessageId,
            newsletterSourceId: ctx.newsletterSourceId,
            sourceUrl: item.sourceUrl,
            canonicalSourceUrl: canonicalUrl,
            receivedAt: ctx.receivedAt,
            verificationStatus: occResult.verificationStatus,
          });
        }
      }
    }
  }

  setIngestDryRun(false);

  const outcome = resolveDiscoveryOccurrenceOutcome({
    datedOccurrencesCreated,
    datedOccurrenceDuplicates,
    extractedItemCount: items.length,
    datedCandidateCount,
  });

  if (!dryRun && newsletterSource) {
    await recordNewsletterSourceStats(newsletterSource.id, {
      emailsProcessed: 1,
      entitiesExtracted: entitiesCreated,
      occurrencesExtracted: datedOccurrencesCreated,
      duplicateMergeCount: duplicatesMerged,
      quarantinedCount: quarantined,
      parsed: datedOccurrencesCreated > 0 || datedOccurrenceDuplicates > 0,
    });
  }

  if (!dryRun) {
    await updateDiscoveryEmailParseStats(discoveryEmailMessageId, {
      newsletterCategory,
      senderDomain,
      contentFingerprint,
      newsletterSourceId: newsletterSource?.id ?? null,
      entitiesExtracted: entitiesCreated + entitiesUpdated,
      occurrencesExtracted: datedOccurrencesCreated + datedOccurrenceDuplicates,
      quarantinedCount: quarantined,
      processingStatus: outcome.processingStatus,
      processingError: outcome.processingError,
      contentItemId: contentItemIds[0] ?? null,
    });

    if (discoverySubscriptionId && contentItemIds[0]) {
      await markSubscriptionNewsletterReceived(
        discoverySubscriptionId,
        message.internalDate ?? new Date(),
        contentItemIds[0],
      );
    }

    await emitDataChange({
      eventType: 'manual_update',
      domains: ['discoveries', 'opportunities', 'recommendations', 'home_briefing'],
      completedAt: new Date().toISOString(),
      source: 'newsletter-intelligence',
      recordIds: contentItemIds,
      success: true,
      metadata: {
        gmailMessageId: message.id,
        entitiesCreated,
        occurrencesCreated: datedOccurrencesCreated,
        outcome: outcome.reason,
      },
    });
  }

  return {
    ok: true,
    skipped: outcome.processingStatus !== 'processed',
    reason: outcome.reason,
    processingStatus: outcome.processingStatus,
    entitiesCreated,
    entitiesUpdated,
    occurrencesCreated,
    occurrencesUpdated,
    datedOccurrencesCreated,
    datedOccurrenceDuplicates,
    quarantined,
    duplicatesMerged,
    contentItemIds,
    needsOcr,
    needsVerification,
  };
}
