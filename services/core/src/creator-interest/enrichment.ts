import OpenAI from 'openai';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { env } from '../env.js';
import { researchOpportunity } from '../web-research/index.js';
import { getOpportunityLocation } from '../opportunity-location/index.js';
import { inferEntityType, normalizeEntityName } from './normalize.js';
import type { BusinessEnrichment, VerifiedField } from './types.js';

const FieldSchema = z.object({
  value: z.union([z.string(), z.boolean(), z.array(z.string()), z.null()]).optional(),
  status: z.enum(['verified', 'inferred', 'unavailable', 'needs_confirmation']),
  source: z.string().nullable().optional(),
});

const EnrichmentSchema = z.object({
  canonicalName: FieldSchema,
  entityType: FieldSchema,
  currentlyOpen: FieldSchema,
  website: FieldSchema,
  phone: FieldSchema,
  email: FieldSchema,
  contactFormUrl: FieldSchema,
  address: FieldSchema,
  hours: FieldSchema,
  pricing: FieldSchema,
  parking: FieldSchema,
  signatureProducts: FieldSchema,
  filmingOpportunities: FieldSchema,
  filmingPolicy: FieldSchema,
  bestVisitTiming: FieldSchema,
  needsVerification: z.array(z.string()).default([]),
  researchSummary: z.string().nullable(),
});

function field<T>(
  value: T | null,
  status: VerifiedField['status'],
  source: string | null = null,
): VerifiedField<T> {
  return { value, status, source };
}

function listingFromMetadata(metadata: Record<string, unknown>) {
  const listing = (metadata.listingScrape ?? {}) as Record<string, unknown>;
  const extracted = ((metadata.rawPayload as Record<string, unknown> | undefined)?.extracted ??
    {}) as Record<string, unknown>;
  return {
    businessName: (listing.businessName as string) ?? (extracted.businessName as string) ?? null,
    documentTitle: (listing.documentTitle as string) ?? null,
    listingUrl: (listing.listingUrl as string) ?? null,
    category: (metadata.opportunityCategory as string) ?? (extracted.category as string) ?? null,
    tags: (metadata.tags as string[]) ?? (extracted.tags as string[]) ?? [],
  };
}

export async function runBusinessEnrichment(contentItemId: string): Promise<BusinessEnrichment> {
  const [row] = await db.select().from(contentItems).where(eq(contentItems.id, contentItemId)).limit(1);
  if (!row) throw new Error('content_item_not_found');

  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const listing = listingFromMetadata(metadata);
  const canonicalName = normalizeEntityName({
    sourceName: null,
    title: row.topic,
    businessName: listing.businessName,
    documentTitle: listing.documentTitle,
  });

  const location = await getOpportunityLocation(contentItemId).catch(() => null);
  const web = await researchOpportunity(
    {
      title: row.topic,
      businessName: canonicalName,
      location: row.locationName ?? 'Kansas City, MO',
    },
    { context: 'user' },
  );

  const baseEnrichment: BusinessEnrichment = {
    canonicalName: field(canonicalName, listing.businessName ? 'verified' : 'inferred', 'listing_scrape'),
    entityType: field(
      inferEntityType(listing.category, listing.tags),
      'inferred',
      'category_tags',
    ),
    currentlyOpen: field<boolean>(null, 'needs_confirmation', null),
    website: field(row.sourceUrl ?? listing.listingUrl, row.sourceUrl ? 'verified' : 'inferred', 'source_url'),
    officialSocial: field<string[]>(null, 'unavailable', null),
    address: field(
      location?.formattedAddress ?? row.locationName,
      location?.formattedAddress ? 'verified' : row.locationName ? 'inferred' : 'unavailable',
      location?.locationSource ?? 'record',
    ),
    coordinates:
      location?.latitude != null && location?.longitude != null
        ? field({ lat: location.latitude, lng: location.longitude }, 'verified', 'google_places')
        : field<{ lat: number; lng: number }>(null, 'unavailable', null),
    phone: field<string>(null, 'unavailable', null),
    email: field<string>(null, 'unavailable', null),
    contactFormUrl: field<string>(null, 'unavailable', null),
    hours: field<string>(null, 'unavailable', null),
    pricing: field<string>(null, 'unavailable', null),
    parking: field<string>(null, 'unavailable', null),
    accessibility: field<string>(null, 'unavailable', null),
    ageRestrictions: field<string>(null, 'unavailable', null),
    reservationsRequired: field<boolean>(null, 'unavailable', null),
    bestVisitTiming: field<string>(null, 'unavailable', null),
    busyPeriods: field<string>(null, 'unavailable', null),
    signatureProducts: field<string[]>(listing.tags.length ? listing.tags : null, listing.tags.length ? 'inferred' : 'unavailable', 'listing_tags'),
    filmingOpportunities: field<string[]>(null, 'unavailable', null),
    indoorOutdoor: field<string>(null, 'unavailable', null),
    filmingPolicy: field<string>(null, 'unavailable', null),
    permissionAdvised: field<boolean>(null, 'needs_confirmation', null),
    kellieCoveredBefore: field(false, 'verified', 'system'),
    similarContentPerformance: field<string>(null, 'unavailable', null),
    sourceFreshness: field(
      row.lastSeenAt?.toISOString() ?? row.updatedAt.toISOString(),
      'verified',
      'content_items.last_seen_at',
    ),
    needsVerification: ['hours', 'currently_open', 'phone', 'pricing'],
    researchSummary: web.summary,
    citations: web.citations ?? [],
  };

  if (!env.OPENAI_API_KEY || !web.summary) {
    return baseEnrichment;
  }

  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: env.BENSON_ASK_MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1200,
      messages: [
        {
          role: 'system',
          content: `Extract business facts for a KC creator assistant. Rules:
- Use ONLY facts present in the provided record or web research summary
- Mark verified only when explicitly stated in official source/citations
- Mark inferred for reasonable category-based guesses
- Mark unavailable when not found — NEVER invent hours, phone, email, pricing, or policies
- If storefront is closed/relocating, set currentlyOpen appropriately and note in researchSummary
Respond JSON matching the schema fields with keys: canonicalName, entityType, currentlyOpen, website, phone, email, contactFormUrl, address, hours, pricing, parking, signatureProducts, filmingOpportunities, filmingPolicy, bestVisitTiming, needsVerification, researchSummary.`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            record: {
              title: row.topic,
              summary: row.script?.slice(0, 800),
              location: row.locationName,
              sourceUrl: row.sourceUrl,
              listing,
            },
            webResearch: web,
            existing: baseEnrichment,
          }),
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return baseEnrichment;

    const parsed = EnrichmentSchema.parse(JSON.parse(content));
    const mergeField = <T>(base: VerifiedField<T>, next: z.infer<typeof FieldSchema>): VerifiedField<T> => {
      if (next.status === 'unavailable' || next.value == null) return base;
      return {
        value: next.value as T,
        status: next.status,
        source: next.source ?? 'web_research',
      };
    };

    return {
      ...baseEnrichment,
      canonicalName: mergeField(baseEnrichment.canonicalName, parsed.canonicalName),
      entityType: mergeField(baseEnrichment.entityType, parsed.entityType),
      currentlyOpen: mergeField(baseEnrichment.currentlyOpen, parsed.currentlyOpen),
      website: mergeField(baseEnrichment.website, parsed.website),
      phone: mergeField(baseEnrichment.phone, parsed.phone),
      email: mergeField(baseEnrichment.email, parsed.email),
      contactFormUrl: mergeField(baseEnrichment.contactFormUrl, parsed.contactFormUrl),
      address: mergeField(baseEnrichment.address, parsed.address),
      hours: mergeField(baseEnrichment.hours, parsed.hours),
      pricing: mergeField(baseEnrichment.pricing, parsed.pricing),
      parking: mergeField(baseEnrichment.parking, parsed.parking),
      signatureProducts: mergeField(baseEnrichment.signatureProducts, parsed.signatureProducts),
      filmingOpportunities: mergeField(baseEnrichment.filmingOpportunities, parsed.filmingOpportunities),
      filmingPolicy: mergeField(baseEnrichment.filmingPolicy, parsed.filmingPolicy),
      bestVisitTiming: mergeField(baseEnrichment.bestVisitTiming, parsed.bestVisitTiming),
      needsVerification: parsed.needsVerification,
      researchSummary: parsed.researchSummary ?? web.summary,
    };
  } catch {
    return baseEnrichment;
  }
}

export function enrichmentBlocksVisit(enrichment: BusinessEnrichment): boolean {
  if (enrichment.currentlyOpen.value === false) return true;
  const summary = `${enrichment.researchSummary ?? ''}`.toLowerCase();
  return /\b(permanently closed|closed permanently|out of business|no longer open)\b/.test(summary);
}
