/**
 * Internal abstraction over partnership source URLs (metadata v1).
 * Future partnership_sources table should implement the same surface.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import type { PartnershipUrlIntelligence } from './url-intelligence.js';

export const PARTNERSHIP_SOURCE_ROLES = [
  'discovery',
  'program',
  'product',
  'store',
  'supporting',
] as const;

export type PartnershipSourceRole = (typeof PARTNERSHIP_SOURCE_ROLES)[number];

export type PartnershipSourceEntityContext = {
  retailerName?: string | null;
  brandName?: string | null;
  productName?: string | null;
};

export type PartnershipSourceRecord = {
  originalUrl: string;
  normalizedUrl: string;
  role: PartnershipSourceRole;
  discoveredAt: string;
  lastObservedAt: string;
  entityContext?: PartnershipSourceEntityContext;
  provenance?: { status?: string; intakeRoute?: string };
  parseSnapshot?: PartnershipUrlIntelligence;
};

export type PartnershipDecisionBrief = {
  phase: 'provisional' | 'complete';
  headline: string;
  entities: Array<{ name: string; type: string; confidence: number }>;
  localRelevance: string | null;
  provisionalSignals: string[];
  knownGaps: string[];
  storyAngles?: Array<{ angle: string; status: string }>;
  nextActions?: Array<{ action: string; why: string; href?: string }>;
  fitScore?: number | null;
  researchStatus: string;
  partnershipHref: string;
  updatedAt: string;
};

export type PartnershipMetadata = {
  sourceScreen?: string;
  opportunityFingerprint?: string;
  /** 2 = SHA-256 V2. Missing/other = legacy truncated hex. Never treat legacy as V2. */
  opportunityFingerprintVersion?: number;
  opportunityFingerprintTuple?: string;
  primaryDiscoveryUrl?: string;
  sourceUrls?: PartnershipSourceRecord[];
  urlIntelligence?: PartnershipUrlIntelligence;
  decisionBrief?: PartnershipDecisionBrief;
  relatedOpportunityIds?: string[];
  provisionalSignals?: string[];
  [key: string]: unknown;
};

export function listPartnershipSources(
  metadata: PartnershipMetadata | null | undefined,
): PartnershipSourceRecord[] {
  return metadata?.sourceUrls ?? [];
}

export function findSourceByNormalizedUrl(
  metadata: PartnershipMetadata | null | undefined,
  normalizedUrl: string,
): PartnershipSourceRecord | null {
  return listPartnershipSources(metadata).find((s) => s.normalizedUrl === normalizedUrl) ?? null;
}

export function attachPartnershipSource(
  metadata: PartnershipMetadata,
  source: Omit<PartnershipSourceRecord, 'discoveredAt' | 'lastObservedAt'> & {
    discoveredAt?: string;
    lastObservedAt?: string;
  },
): { metadata: PartnershipMetadata; attached: boolean; updated: boolean } {
  const now = new Date().toISOString();
  const existing = findSourceByNormalizedUrl(metadata, source.normalizedUrl);
  if (existing) {
    const sourceUrls = listPartnershipSources(metadata).map((s) =>
      s.normalizedUrl === source.normalizedUrl
        ? {
            ...s,
            ...source,
            discoveredAt: s.discoveredAt,
            lastObservedAt: now,
          }
        : s,
    );
    return {
      metadata: { ...metadata, sourceUrls },
      attached: false,
      updated: true,
    };
  }

  const record: PartnershipSourceRecord = {
    ...source,
    discoveredAt: source.discoveredAt ?? now,
    lastObservedAt: source.lastObservedAt ?? now,
  };

  return {
    metadata: {
      ...metadata,
      sourceUrls: [...listPartnershipSources(metadata), record],
      primaryDiscoveryUrl: metadata.primaryDiscoveryUrl ?? source.originalUrl,
    },
    attached: true,
    updated: false,
  };
}

export async function findPartnershipIdByNormalizedSource(
  normalizedUrl: string,
): Promise<{ partnershipId: string; contentItemId: string } | null> {
  const rows = await db.execute(sql`
    SELECT id, content_item_id
    FROM creator_partnerships
    WHERE submitted_url = ${normalizedUrl}
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(COALESCE(metadata->'sourceUrls', '[]'::jsonb)) elem
         WHERE elem->>'normalizedUrl' = ${normalizedUrl}
       )
    LIMIT 1
  `);

  const list = rows as unknown as Array<{ id: string; content_item_id: string }>;
  const row = list[0];
  if (!row) return null;
  return { partnershipId: row.id, contentItemId: row.content_item_id };
}

export type PartnershipFingerprintMatch = {
  partnershipId: string;
  contentItemId: string;
  brandName: string | null;
  retailerName: string | null;
  metadata: PartnershipMetadata;
};

/**
 * Duplicate lookup by opportunity fingerprint.
 * V2 only — legacy truncated hex is never used as a duplicate-identity fallback.
 */
export async function findPartnershipIdByFingerprint(
  fingerprint: string,
): Promise<PartnershipFingerprintMatch | null> {
  const trimmed = fingerprint.trim();
  if (!trimmed) return null;
  const rows = await db.execute(sql`
    SELECT id, content_item_id, brand_name, retailer_name, metadata
    FROM creator_partnerships
    WHERE metadata->>'opportunityFingerprint' = ${trimmed}
      AND coalesce(metadata->>'opportunityFingerprintVersion', '') = '2'
    LIMIT 1
  `);
  const list = rows as unknown as Array<{
    id: string;
    content_item_id: string;
    brand_name: string | null;
    retailer_name: string | null;
    metadata: unknown;
  }>;
  const row = list[0];
  if (!row) return null;
  return {
    partnershipId: row.id,
    contentItemId: row.content_item_id,
    brandName: row.brand_name,
    retailerName: row.retailer_name,
    metadata: readPartnershipMetadata(row.metadata),
  };
}

export function readPartnershipMetadata(raw: unknown): PartnershipMetadata {
  if (raw && typeof raw === 'object') return raw as PartnershipMetadata;
  return {};
}
