import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { urlIntakeAudit, urlIntakeQuarantine, urlWatchRules } from '../schema.js';
import type { QualificationRejectionCode } from './qualify-url-opportunity.js';
import type { ExtractedOpportunity } from './listing-extract.js';

export async function loadWatchRuleForDomain(domain: string): Promise<{
  locationScope: string | null;
  businessName: string | null;
  cityScope: string | null;
} | null> {
  const normalized = domain.replace(/^www\./, '').toLowerCase();
  const [row] = await db
    .select()
    .from(urlWatchRules)
    .where(eq(urlWatchRules.domain, normalized))
    .limit(1);
  if (!row) return null;
  return {
    locationScope: row.locationScope,
    businessName: row.businessName,
    cityScope: row.cityScope,
  };
}

export async function upsertWatchRule(input: {
  domain: string;
  businessName?: string | null;
  locationScope?: string | null;
  cityScope?: string | null;
  notes?: string | null;
}): Promise<string> {
  const domain = input.domain.replace(/^www\./, '').toLowerCase();
  const scope = input.locationScope ?? null;
  const existing = await loadWatchRuleForDomain(domain);
  if (existing && existing.locationScope === scope) {
    const [row] = await db
      .update(urlWatchRules)
      .set({
        businessName: input.businessName ?? existing.businessName,
        cityScope: input.cityScope ?? existing.cityScope ?? 'Kansas City metro',
        notes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(urlWatchRules.domain, domain))
      .returning({ id: urlWatchRules.id });
    return row!.id;
  }
  const [row] = await db
    .insert(urlWatchRules)
    .values({
      domain,
      businessName: input.businessName ?? null,
      locationScope: scope,
      cityScope: input.cityScope ?? 'Kansas City metro',
      notes: input.notes ?? null,
    })
    .returning({ id: urlWatchRules.id });
  return row!.id;
}

export async function recordQuarantine(input: {
  sourceUrl: string;
  pageUrl: string;
  userMessage?: string | null;
  opp: ExtractedOpportunity;
  rejectionCode: QualificationRejectionCode;
  rejectionReason: string;
  entityName?: string | null;
  entityDomain?: string | null;
  locationScope?: string | null;
}): Promise<string> {
  const eventDate = input.opp.eventDate?.slice(0, 10) ?? null;
  const [row] = await db
    .insert(urlIntakeQuarantine)
    .values({
      sourceUrl: input.sourceUrl,
      pageUrl: input.pageUrl,
      userMessage: input.userMessage ?? null,
      extractedTitle: input.opp.title,
      extractedLocation: input.opp.location ?? input.opp.venue ?? null,
      extractedEventDate: eventDate,
      rejectionCode: input.rejectionCode,
      rejectionReason: input.rejectionReason,
      entityName: input.entityName ?? null,
      entityDomain: input.entityDomain ?? null,
      locationScope: input.locationScope ?? null,
      rawExtraction: input.opp,
    })
    .returning({ id: urlIntakeQuarantine.id });
  return row!.id;
}

export async function recordIntakeAudit(input: {
  contentItemId?: string | null;
  action: string;
  reasonCode: string;
  reasonDetail?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(urlIntakeAudit).values({
    contentItemId: input.contentItemId ?? null,
    action: input.action,
    reasonCode: input.reasonCode,
    reasonDetail: input.reasonDetail ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function quarantineWrongLocationItems(input: {
  entityDomain: string;
  locationScope: string;
}): Promise<number> {
  const { contentItems } = await import('../schema.js');
  const { and, ilike, not, eq: eqOp } = await import('drizzle-orm');
  const domain = input.entityDomain.replace(/^www\./, '').toLowerCase();

  const rows = await db
    .select({ id: contentItems.id, topic: contentItems.topic, locationName: contentItems.locationName })
    .from(contentItems)
    .where(
      and(
        sql`${contentItems.metadata}->>'ingest' = 'ask_benson_link'`,
        sql`${contentItems.sourceUrl} ILIKE ${'%' + domain + '%'}`,
      ),
    );

  let count = 0;
  const { matchesLocationScope } = await import('./url-geo.js');
  for (const row of rows) {
    if (row.locationName && !matchesLocationScope(row.locationName, input.locationScope)) {
      await db
        .update(contentItems)
        .set({
          lifecycleStatus: 'archived',
          creatorValueStatus: 'rejected',
        })
        .where(eqOp(contentItems.id, row.id));
      await recordIntakeAudit({
        contentItemId: row.id,
        action: 'quarantine_wrong_location',
        reasonCode: 'location_scope_mismatch',
        reasonDetail: `Removed from active inventory — outside ${input.locationScope} scope`,
      });
      count += 1;
    }
  }
  return count;
}
