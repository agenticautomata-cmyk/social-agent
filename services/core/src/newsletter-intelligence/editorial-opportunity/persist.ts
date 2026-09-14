import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db.js';
import { contentItems, campaigns, sources } from '../../schema.js';
import { normalizeBusinessKey } from '../../creator-interest/normalize.js';
import { initialContactResearch } from './contact-research.js';
import { notifyEditorialOpportunityOnce } from './telegram.js';
import type { EditorialOpportunityCandidate, EditorialOpportunityPersistResult } from './types.js';

const SOURCE_NAME = 'Editorial Email Opportunity';

async function defaultCampaignId(): Promise<string> {
  const row = await db.query.campaigns.findFirst({ where: eq(campaigns.active, true) });
  if (!row) throw new Error('no active campaign');
  return row.id;
}

async function getOrCreateSourceId(campaignId: string): Promise<string> {
  const existing = await db.query.sources.findFirst({
    where: and(eq(sources.campaignId, campaignId), eq(sources.name, SOURCE_NAME)),
  });
  if (existing) return existing.id;
  const [created] = await db
    .insert(sources)
    .values({
      campaignId,
      type: 'manual',
      name: SOURCE_NAME,
      config: { ingest: 'editorial_email_opportunity' },
      active: true,
    })
    .returning({ id: sources.id });
  return created!.id;
}

export async function findEditorialOpportunityByDedupe(
  dedupeIdentity: string,
): Promise<{ id: string; metadata: Record<string, unknown> } | null> {
  const rows = await db
    .select({ id: contentItems.id, metadata: contentItems.metadata })
    .from(contentItems)
    .where(sql`${contentItems.metadata}->>'editorialDedupeIdentity' = ${dedupeIdentity}`)
    .limit(1);
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    metadata: (rows[0].metadata ?? {}) as Record<string, unknown>,
  };
}

function buildMetadata(
  candidate: EditorialOpportunityCandidate,
  extra: {
    gmailMessageId: string;
    discoveryEmailMessageId: string | null;
    runId: string;
    subject: string;
    provenanceUrls?: string[];
    telegramNotifiedAt?: string | null;
  },
) {
  const contact = initialContactResearch(candidate);
  return {
    ingest: 'editorial_email_opportunity',
    opportunityLayer: 'opportunity',
    opportunityType: candidate.developmentType,
    opportunityCategory: 'business_opening',
    editorialContentType: candidate.contentType,
    editorialDevelopmentType: candidate.developmentType,
    editorialDedupeIdentity: candidate.dedupeIdentity,
    businessKey: normalizeBusinessKey(candidate.businessName),
    businessName: candidate.businessName,
    newsletterDestination: 'opportunity',
    calendarEligible: false,
    autoOutreach: false,
    inventoryStatus: 'suggested',
    verificationStatus: candidate.verificationState,
    creatorValueHints: {
      whyItMatters: candidate.whyItMatters,
      suggestedAngles: candidate.suggestedAngles,
      suggestedNextAction: candidate.suggestedNextAction,
    },
    editorialOpportunity: {
      summary: candidate.summary,
      location: candidate.location,
      address: candidate.address,
      market: candidate.market,
      openingOrAnnouncementDate: candidate.openingOrAnnouncementDate,
      canonicalArticleUrl: candidate.canonicalArticleUrl,
      emailSource: candidate.emailSource,
      publicationDate: candidate.publicationDate,
      evidence: candidate.evidence,
      urgency: candidate.urgency,
      confidence: candidate.confidence,
      articleAccess: candidate.articleAccess,
      contactDiscovery: contact,
    },
    newsletterAttribution: {
      gmailMessageId: extra.gmailMessageId,
      discoveryEmailMessageId: extra.discoveryEmailMessageId,
      subject: extra.subject,
      foundIn: candidate.emailSource,
    },
    provenance: {
      gmailMessageIds: [extra.gmailMessageId],
      articleUrls: [
        ...(candidate.canonicalArticleUrl ? [candidate.canonicalArticleUrl] : []),
        ...(extra.provenanceUrls ?? []),
      ],
      runIds: [extra.runId],
    },
    telegramNotifiedAt: extra.telegramNotifiedAt ?? null,
    lastVerifiedAt: new Date().toISOString(),
  };
}

export async function persistEditorialOpportunity(input: {
  candidate: EditorialOpportunityCandidate;
  gmailMessageId: string;
  discoveryEmailMessageId: string | null;
  runId: string;
  subject: string;
  dryRun?: boolean;
  notifyTelegram?: boolean;
}): Promise<EditorialOpportunityPersistResult> {
  const { candidate } = input;
  const existing = await findEditorialOpportunityByDedupe(candidate.dedupeIdentity);

  if (input.dryRun) {
    return {
      contentItemId: existing?.id ?? 'dry-run',
      created: !existing,
      duplicateMerged: Boolean(existing),
      telegramSent: false,
      candidate,
    };
  }

  const campaignId = await defaultCampaignId();
  const sourceId = await getOrCreateSourceId(campaignId);
  const now = new Date();

  if (existing) {
    const prev = existing.metadata;
    const prevProv = (prev.provenance as Record<string, unknown> | undefined) ?? {};
    const gmailIds = new Set<string>([
      ...((prevProv.gmailMessageIds as string[]) ?? []),
      input.gmailMessageId,
    ]);
    const runIds = new Set<string>([...((prevProv.runIds as string[]) ?? []), input.runId]);
    const articleUrls = new Set<string>([
      ...((prevProv.articleUrls as string[]) ?? []),
      ...(candidate.canonicalArticleUrl ? [candidate.canonicalArticleUrl] : []),
    ]);

    await db
      .update(contentItems)
      .set({
        lastSeenAt: now,
        sourceLastCheckedAt: now,
        stale: false,
        hook: candidate.whyItMatters.slice(0, 500),
        script: candidate.summary,
        locationName: candidate.location,
        formattedAddress: candidate.address,
        sourceUrl: candidate.canonicalArticleUrl ?? undefined,
        metadata: sql`${contentItems.metadata} || ${JSON.stringify({
          lastEditorialSeenAt: now.toISOString(),
          provenance: {
            gmailMessageIds: [...gmailIds],
            articleUrls: [...articleUrls],
            runIds: [...runIds],
          },
          editorialOpportunity: {
            ...(((prev.editorialOpportunity as object) ?? {}) as object),
            urgency: candidate.urgency,
            confidence: Math.max(
              Number((prev.editorialOpportunity as { confidence?: number } | undefined)?.confidence ?? 0),
              candidate.confidence,
            ),
            evidence: [
              ...((((prev.editorialOpportunity as { evidence?: unknown[] } | undefined)?.evidence) ??
                []) as unknown[]),
              ...candidate.evidence,
            ].slice(0, 20),
          },
        })}::jsonb`,
        updatedAt: now,
      })
      .where(eq(contentItems.id, existing.id));

    return {
      contentItemId: existing.id,
      created: false,
      duplicateMerged: true,
      telegramSent: false,
      candidate,
    };
  }

  const metadata = buildMetadata(candidate, {
    gmailMessageId: input.gmailMessageId,
    discoveryEmailMessageId: input.discoveryEmailMessageId,
    runId: input.runId,
    subject: input.subject,
  });

  const topic = `${candidate.businessName} — ${candidate.developmentType.replace(/_/g, ' ')}${
    candidate.location ? ` · ${candidate.location}` : ''
  }`;

  const [inserted] = await db
    .insert(contentItems)
    .values({
      campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic,
      hook: candidate.whyItMatters.slice(0, 500),
      script: [
        candidate.summary,
        '',
        `Evidence: ${candidate.evidence.map((e) => e.excerpt).join(' | ')}`,
        `Next: ${candidate.suggestedNextAction}`,
        `Angles: ${candidate.suggestedAngles.join('; ')}`,
      ].join('\n'),
      sourceId,
      sourceExternalId: `editorial-opp:${candidate.dedupeIdentity}`,
      sourceUrl: candidate.canonicalArticleUrl,
      discoveredAt: now,
      eventStartsAt: null,
      eventEndsAt: null,
      locationName: candidate.location,
      formattedAddress: candidate.address,
      metadata,
      firstSeenAt: now,
      lastSeenAt: now,
      sourceLastCheckedAt: now,
      stale: false,
      freshnessBucket: 'fresh',
      creatorValueStatus: 'creator_candidate',
      lifecycleStatus: 'active',
    })
    .returning({ id: contentItems.id });

  let telegramSent = false;
  if (input.notifyTelegram !== false) {
    const tg = await notifyEditorialOpportunityOnce({
      candidate,
      contentItemId: inserted!.id,
      created: true,
    });
    telegramSent = tg.sent;
    if (tg.sent) {
      await db
        .update(contentItems)
        .set({
          metadata: sql`${contentItems.metadata} || ${JSON.stringify({
            telegramNotifiedAt: new Date().toISOString(),
          })}::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(contentItems.id, inserted!.id));
    }
  }

  return {
    contentItemId: inserted!.id,
    created: true,
    duplicateMerged: false,
    telegramSent,
    candidate,
  };
}
