import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '../../db.js';
import {
  campaigns,
  contentItems,
  creatorPartnerships,
  sponsorContacts,
} from '../../schema.js';
import { extractUrls } from '../collect-from-link.js';
import { getOrCreateShareIntakeSource } from '../../intake/promote.js';
import { normalizeSourceUrl } from '../../creator-partnership/url-intelligence.js';
import { findPartnershipIdByNormalizedSource } from '../../creator-partnership/partnership-sources.js';
import { extractBrandFromProgramUrl } from '../../program-library/canonical.js';
import { extractBusinessNameCandidates } from './classify.js';
import type { AssociationCandidate, AssociationResult, EvidenceItem } from './types.js';

function normalizeBrand(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function brandsLikelySame(a: string, b: string): boolean {
  const na = normalizeBrand(a);
  const nb = normalizeBrand(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const aTokens = na.split(/\s+/).filter((t) => t.length > 2);
  const bTokens = nb.split(/\s+/).filter((t) => t.length > 2);
  if (aTokens.length === 0 || bTokens.length === 0) return false;
  // Distinctive single-token brands (Loews, Nike) match compound labels containing them.
  if (aTokens.length === 1 && bTokens.includes(aTokens[0]!)) return true;
  if (bTokens.length === 1 && aTokens.includes(bTokens[0]!)) return true;
  // Compact host roots like "loewshotels" vs "loews"
  if (aTokens.length === 1 && bTokens.some((t) => t.startsWith(aTokens[0]!) || aTokens[0]!.startsWith(t))) {
    return aTokens[0]!.length >= 4 && Math.min(...bTokens.map((t) => t.length)) >= 4;
  }
  if (bTokens.length === 1 && aTokens.some((t) => t.startsWith(bTokens[0]!) || bTokens[0]!.startsWith(t))) {
    return bTokens[0]!.length >= 4;
  }
  const ta = new Set(aTokens);
  const overlap = bTokens.filter((t) => ta.has(t)).length;
  return overlap >= Math.min(2, bTokens.length);
}

async function defaultCampaignId(): Promise<string> {
  const [campaign] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.active, true))
    .orderBy(desc(campaigns.createdAt))
    .limit(1);
  if (!campaign) throw new Error('No active campaign found');
  return campaign.id;
}

async function findByUrl(urls: string[]): Promise<AssociationCandidate[]> {
  const out: AssociationCandidate[] = [];
  for (const url of urls) {
    let normalized: string;
    try {
      normalized = normalizeSourceUrl(url);
    } catch {
      continue;
    }
    const bySource = await findPartnershipIdByNormalizedSource(normalized);
    if (bySource) {
      const [p] = await db
        .select({
          id: creatorPartnerships.id,
          brandName: creatorPartnerships.brandName,
          retailerName: creatorPartnerships.retailerName,
          contentItemId: creatorPartnerships.contentItemId,
        })
        .from(creatorPartnerships)
        .where(eq(creatorPartnerships.id, bySource.partnershipId))
        .limit(1);
      out.push({
        entityType: 'partnership',
        entityId: bySource.partnershipId,
        contentItemId: bySource.contentItemId,
        partnershipId: bySource.partnershipId,
        sponsorContactId: null,
        label: p?.brandName || p?.retailerName || 'Partnership',
        confidence: 0.96,
        matchReason: 'normalized_source_url',
      });
    }

    // Host / brand domain soft match on partnerships + content items
    let host = '';
    try {
      host = new URL(normalized).hostname.replace(/^www\./i, '');
    } catch {
      continue;
    }
    const domainRoot = host.split('.')[0] ?? '';
    if (domainRoot.length >= 3) {
      const like = `%${domainRoot}%`;
      const partnerships = await db
        .select({
          id: creatorPartnerships.id,
          brandName: creatorPartnerships.brandName,
          retailerName: creatorPartnerships.retailerName,
          contentItemId: creatorPartnerships.contentItemId,
          submittedUrl: creatorPartnerships.submittedUrl,
        })
        .from(creatorPartnerships)
        .where(
          or(
            ilike(creatorPartnerships.submittedUrl, like),
            ilike(creatorPartnerships.brandName, like),
            ilike(creatorPartnerships.retailerName, like),
          ),
        )
        .orderBy(desc(creatorPartnerships.updatedAt))
        .limit(5);
      for (const p of partnerships) {
        out.push({
          entityType: 'partnership',
          entityId: p.id,
          contentItemId: p.contentItemId,
          partnershipId: p.id,
          sponsorContactId: null,
          label: p.brandName || p.retailerName || domainRoot,
          confidence: 0.88,
          matchReason: `domain_host:${host}`,
        });
      }

      const items = await db
        .select({
          id: contentItems.id,
          topic: contentItems.topic,
          sourceUrl: contentItems.sourceUrl,
        })
        .from(contentItems)
        .where(or(ilike(contentItems.topic, like), ilike(contentItems.sourceUrl, like)))
        .orderBy(desc(contentItems.updatedAt))
        .limit(5);
      for (const item of items) {
        out.push({
          entityType: 'content_item',
          entityId: item.id,
          contentItemId: item.id,
          partnershipId: null,
          sponsorContactId: null,
          label: item.topic,
          confidence: 0.84,
          matchReason: `content_domain:${host}`,
        });
      }
    }
  }
  return out;
}

async function findByBusinessNames(names: string[]): Promise<AssociationCandidate[]> {
  const out: AssociationCandidate[] = [];
  for (const name of names) {
    const like = `%${name.replace(/[%_]/g, '')}%`;
    if (like.length < 5) continue;

    const items = await db
      .select({
        id: contentItems.id,
        topic: contentItems.topic,
        metadata: contentItems.metadata,
      })
      .from(contentItems)
      .where(
        or(
          ilike(contentItems.topic, like),
          sql`${contentItems.metadata}->>'businessName' ILIKE ${like}`,
        ),
      )
      .orderBy(desc(contentItems.updatedAt))
      .limit(8);
    for (const item of items) {
      const meta = (item.metadata ?? {}) as Record<string, unknown>;
      const biz = typeof meta.businessName === 'string' ? meta.businessName : item.topic;
      const conf = brandsLikelySame(name, biz) ? 0.92 : 0.72;
      out.push({
        entityType: 'content_item',
        entityId: item.id,
        contentItemId: item.id,
        partnershipId: null,
        sponsorContactId: null,
        label: biz,
        confidence: conf,
        matchReason: `business_name:${name}`,
      });
    }

    const partnerships = await db
      .select({
        id: creatorPartnerships.id,
        brandName: creatorPartnerships.brandName,
        retailerName: creatorPartnerships.retailerName,
        contentItemId: creatorPartnerships.contentItemId,
      })
      .from(creatorPartnerships)
      .where(
        or(ilike(creatorPartnerships.brandName, like), ilike(creatorPartnerships.retailerName, like)),
      )
      .orderBy(desc(creatorPartnerships.updatedAt))
      .limit(8);
    for (const p of partnerships) {
      const label = p.brandName || p.retailerName || name;
      const conf = brandsLikelySame(name, label) ? 0.93 : 0.74;
      out.push({
        entityType: 'partnership',
        entityId: p.id,
        contentItemId: p.contentItemId,
        partnershipId: p.id,
        sponsorContactId: null,
        label,
        confidence: conf,
        matchReason: `partnership_name:${name}`,
      });
    }

    const contacts = await db
      .select({
        id: sponsorContacts.id,
        businessName: sponsorContacts.businessName,
        sourceOpportunityId: sponsorContacts.sourceOpportunityId,
      })
      .from(sponsorContacts)
      .where(ilike(sponsorContacts.businessName, like))
      .orderBy(desc(sponsorContacts.updatedAt))
      .limit(5);
    for (const c of contacts) {
      out.push({
        entityType: 'sponsor_contact',
        entityId: c.id,
        contentItemId: c.sourceOpportunityId,
        partnershipId: null,
        sponsorContactId: c.id,
        label: c.businessName,
        confidence: brandsLikelySame(name, c.businessName) ? 0.9 : 0.7,
        matchReason: `sponsor_contact:${name}`,
      });
    }
  }
  return out;
}

function dedupeCandidates(candidates: AssociationCandidate[]): AssociationCandidate[] {
  const byKey = new Map<string, AssociationCandidate>();
  for (const c of candidates) {
    const key = c.contentItemId
      ? `ci:${c.contentItemId}`
      : c.partnershipId
        ? `p:${c.partnershipId}`
        : `${c.entityType}:${c.entityId}`;
    const prev = byKey.get(key);
    if (!prev || c.confidence > prev.confidence) byKey.set(key, c);
  }
  return [...byKey.values()].sort((a, b) => b.confidence - a.confidence);
}

function urlCorroboratesLabel(urls: string[], label: string): boolean {
  for (const url of urls) {
    try {
      const brand = extractBrandFromProgramUrl(url);
      if (brand && brandsLikelySame(brand, label)) return true;
      const host = new URL(url).hostname.replace(/^www\./i, '');
      if (brandsLikelySame(host.replace(/\./g, ' '), label)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

function softContextCorroborated(
  soft: AssociationCandidate | null,
  evidenceNames: string[],
  urls: string[],
): boolean {
  if (!soft) return false;
  // A freshly pasted URL that does not match the conversation entity outranks stale context.
  if (urls.length > 0 && !urlCorroboratesLabel(urls, soft.label)) {
    return false;
  }
  if (urlCorroboratesLabel(urls, soft.label)) return true;
  return evidenceNames.some((n) => brandsLikelySame(n, soft.label));
}

async function createOpportunityForBrand(input: {
  businessName: string;
  message: string;
  evidence: EvidenceItem[];
}): Promise<AssociationCandidate> {
  const campaignId = await defaultCampaignId();
  const sourceId = await getOrCreateShareIntakeSource(campaignId);
  const now = new Date();
  const externalId = `ask-benson-evidence-${normalizeBrand(input.businessName).replace(/\s+/g, '-')}-${now
    .toISOString()
    .slice(0, 10)}`;

  const existing = await db
    .select({ id: contentItems.id, topic: contentItems.topic })
    .from(contentItems)
    .where(eq(contentItems.sourceExternalId, externalId))
    .limit(1);
  if (existing[0]) {
    return {
      entityType: 'content_item',
      entityId: existing[0].id,
      contentItemId: existing[0].id,
      partnershipId: null,
      sponsorContactId: null,
      label: existing[0].topic,
      confidence: 0.9,
      matchReason: 'created_opportunity_idempotent',
    };
  }

  const [row] = await db
    .insert(contentItems)
    .values({
      campaignId,
      type: 'industry_insight',
      language: 'en',
      state: 'planned',
      topic: input.businessName.slice(0, 500),
      hook: 'Sponsor opportunity from Ask Benson evidence',
      script: input.message.slice(0, 4000),
      sourceId,
      sourceExternalId: externalId,
      discoveredAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      sourceLastCheckedAt: now,
      stale: false,
      freshnessBucket: 'fresh',
      creatorValueStatus: 'creator_candidate',
      lifecycleStatus: 'active',
      relevanceScore: '0.700',
      urgencyScore: '0.500',
      metadata: {
        ingest: 'ask_benson_evidence',
        businessName: input.businessName,
        opportunityCategory: 'local_business',
        userConfirmed: true,
        // contactEmails filled by mutate step so first evidence write is non-idempotent
        askBensonEvidenceCapture: {
          capturedAt: now.toISOString(),
          source: 'evidence_orchestration',
        },
      },
    })
    .returning({ id: contentItems.id, topic: contentItems.topic });

  return {
    entityType: 'content_item',
    entityId: row!.id,
    contentItemId: row!.id,
    partnershipId: null,
    sponsorContactId: null,
    label: row!.topic,
    confidence: 0.9,
    matchReason: 'created_opportunity',
  };
}

export async function associateEvidence(input: {
  message: string;
  evidence: EvidenceItem[];
  softPartnershipId?: string | null;
  softContentItemId?: string | null;
  contentItemIdHint?: string | null;
  allowCreate?: boolean;
}): Promise<AssociationResult> {
  const urls = extractUrls(input.message);
  const names = extractBusinessNameCandidates(input.message);
  const raw: AssociationCandidate[] = [];

  if (input.contentItemIdHint) {
    const [item] = await db
      .select({ id: contentItems.id, topic: contentItems.topic })
      .from(contentItems)
      .where(eq(contentItems.id, input.contentItemIdHint))
      .limit(1);
    if (item) {
      raw.push({
        entityType: 'content_item',
        entityId: item.id,
        contentItemId: item.id,
        partnershipId: null,
        sponsorContactId: null,
        label: item.topic,
        confidence: 0.7,
        matchReason: 'request_hint',
      });
    }
  }

  raw.push(...(await findByUrl(urls)));
  raw.push(...(await findByBusinessNames(names)));

  let soft: AssociationCandidate | null = null;
  if (input.softPartnershipId) {
    const [p] = await db
      .select({
        id: creatorPartnerships.id,
        brandName: creatorPartnerships.brandName,
        retailerName: creatorPartnerships.retailerName,
        contentItemId: creatorPartnerships.contentItemId,
      })
      .from(creatorPartnerships)
      .where(eq(creatorPartnerships.id, input.softPartnershipId))
      .limit(1);
    if (p) {
      soft = {
        entityType: 'partnership',
        entityId: p.id,
        contentItemId: p.contentItemId,
        partnershipId: p.id,
        sponsorContactId: null,
        label: p.brandName || p.retailerName || 'Conversation partnership',
        confidence: 0.55,
        matchReason: 'soft_conversation_context',
      };
    }
  } else if (input.softContentItemId) {
    const [item] = await db
      .select({ id: contentItems.id, topic: contentItems.topic })
      .from(contentItems)
      .where(eq(contentItems.id, input.softContentItemId))
      .limit(1);
    if (item) {
      soft = {
        entityType: 'content_item',
        entityId: item.id,
        contentItemId: item.id,
        partnershipId: null,
        sponsorContactId: null,
        label: item.topic,
        confidence: 0.55,
        matchReason: 'soft_conversation_context',
      };
    }
  }

  // Soft context alone must not win — only when corroborated by name/url evidence
  if (soft && softContextCorroborated(soft, names, urls)) {
    raw.push({
      ...soft,
      confidence: Math.max(soft.confidence, 0.97),
      matchReason: `${soft.matchReason}+corroborated`,
    });
  }

  const candidates = dedupeCandidates(raw).filter((c) => c.confidence >= 0.7);

  // Corroborated soft partnership/content wins when URL/name ties to it — avoid
  // ambiguous chooser across same-brand inventory variants (Batch 1 entity safety).
  if (soft && softContextCorroborated(soft, names, urls)) {
    const preferred =
      candidates.find((c) => c.entityId === soft.entityId || c.partnershipId === soft.partnershipId) ??
      ({
        ...soft,
        confidence: 0.97,
        matchReason: `${soft.matchReason}+corroborated`,
      } satisfies AssociationCandidate);
    const sameBrand = candidates.filter((c) => brandsLikelySame(c.label, preferred.label));
    const partnership = sameBrand.find((c) => c.partnershipId) ?? preferred;
    const content = sameBrand.find((c) => c.contentItemId);
    return {
      status: 'resolved',
      entityType: partnership.entityType,
      entityId: partnership.entityId,
      contentItemId: content?.contentItemId ?? partnership.contentItemId ?? soft.contentItemId,
      partnershipId: partnership.partnershipId ?? soft.partnershipId,
      sponsorContactId: sameBrand.find((c) => c.sponsorContactId)?.sponsorContactId ?? null,
      label: preferred.label,
      confidence: preferred.confidence,
      matchReason: preferred.matchReason,
    };
  }

  if (candidates.length === 0) {
    if (soft && !softContextCorroborated(soft, names, urls) && input.evidence.length > 0) {
      return {
        status: 'unrelated',
        reason:
          'Evidence does not corroborate the current conversation entity; refusing to attach to avoid wrong-entity mutation.',
        softContextEntityId: soft.entityId,
      };
    }

    const primaryName = names[0];
    const actionable = input.evidence.some(
      (e) => e.kind === 'contact_email' || e.kind === 'official_intake_form_url',
    );
    if (input.allowCreate !== false && primaryName && actionable) {
      const created = await createOpportunityForBrand({
        businessName: primaryName,
        message: input.message,
        evidence: input.evidence,
      });
      return {
        status: 'resolved',
        entityType: created.entityType,
        entityId: created.entityId,
        contentItemId: created.contentItemId,
        partnershipId: created.partnershipId,
        sponsorContactId: created.sponsorContactId,
        label: created.label,
        confidence: created.confidence,
        matchReason: created.matchReason,
        createdOpportunity: created.matchReason === 'created_opportunity',
      };
    }

    return { status: 'none', reason: 'No durable entity matched the supplied evidence.' };
  }

  const top = candidates[0]!;
  const rivals = candidates.filter(
    (c) =>
      c.entityId !== top.entityId &&
      c.contentItemId !== top.contentItemId &&
      c.confidence >= top.confidence - 0.08 &&
      !brandsLikelySame(c.label, top.label),
  );

  if (rivals.length > 0) {
    return {
      status: 'ambiguous',
      candidates: [top, ...rivals].slice(0, 5),
      reason: 'Multiple distinct entities match this evidence; clarify before mutating.',
    };
  }

  // Merge same-brand partnership + content_item into one resolved target
  const sameBrand = candidates.filter((c) => brandsLikelySame(c.label, top.label));
  const partnership = sameBrand.find((c) => c.partnershipId);
  const content = sameBrand.find((c) => c.contentItemId);
  const contact = sameBrand.find((c) => c.sponsorContactId);

  return {
    status: 'resolved',
    entityType: partnership?.entityType ?? content?.entityType ?? top.entityType,
    entityId: partnership?.entityId ?? content?.entityId ?? top.entityId,
    contentItemId: content?.contentItemId ?? partnership?.contentItemId ?? top.contentItemId,
    partnershipId: partnership?.partnershipId ?? top.partnershipId,
    sponsorContactId: contact?.sponsorContactId ?? top.sponsorContactId,
    label: top.label,
    confidence: top.confidence,
    matchReason: top.matchReason,
  };
}

export { brandsLikelySame, normalizeBrand };
