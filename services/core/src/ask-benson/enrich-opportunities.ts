import { desc, eq, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems } from '../schema.js';
import { researchOpportunity } from '../web-research/index.js';
import type { CollectFromImageResult } from './collect-from-image.js';

const DEFAULT_LIMIT = 8;
const MAX_WEB_RESEARCH = 8;

export type EnrichOpportunitiesResult = CollectFromImageResult & {
  lookupQuery?: never;
};

async function loadSparseOpportunities(limit: number) {
  const rows = await db
    .select()
    .from(contentItems)
    .where(
      or(
        sql`${contentItems.metadata}->>'ingest' IN ('ask_benson_link', 'ask_benson_image', 'ask_benson_lookup')`,
        sql`COALESCE(LENGTH(${contentItems.script}), 0) < 120`,
      ),
    )
    .orderBy(desc(contentItems.createdAt))
    .limit(limit * 2);

  return rows
    .filter((row) => {
      const meta = row.metadata as Record<string, unknown> | null;
      const capture = meta?.askBensonCapture as Record<string, unknown> | undefined;
      const alreadyEnriched = capture?.enrichedAt != null;
      const scriptLen = row.script?.trim().length ?? 0;
      return !alreadyEnriched || scriptLen < 120;
    })
    .slice(0, limit);
}

export async function enrichRecentOpportunities(input?: {
  limit?: number;
}): Promise<EnrichOpportunitiesResult> {
  const limit = input?.limit ?? DEFAULT_LIMIT;
  const candidates = await loadSparseOpportunities(limit);

  let updated = 0;
  let enrichmentsAttempted = 0;
  let webResearchAttempted = 0;
  const items: EnrichOpportunitiesResult['items'] = [];

  for (const row of candidates) {
    if (webResearchAttempted >= MAX_WEB_RESEARCH) break;

    enrichmentsAttempted += 1;
    webResearchAttempted += 1;

    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const capture = (meta.askBensonCapture ?? {}) as Record<string, unknown>;
    const businessName =
      typeof capture.businessName === 'string' ? capture.businessName : null;

    const research = await researchOpportunity({
      title: row.topic,
      location: row.locationName,
      businessName,
    });

    if (!research.ok || (!research.summary && research.citations.length === 0)) {
      continue;
    }

    const existingScript = row.script?.trim() ?? '';
    const researchBlock = research.summary?.trim() ?? '';
    const script = researchBlock
      ? existingScript
        ? `${existingScript}\n\nEnriched: ${researchBlock}`.slice(0, 4000)
        : researchBlock.slice(0, 4000)
      : existingScript || null;

    const sourceUrl = research.citations[0]?.url ?? row.sourceUrl;
    const nextMeta = {
      ...meta,
      askBensonCapture: {
        ...capture,
        enrichedAt: new Date().toISOString(),
        webResearch: {
          summary: research.summary,
          links: research.citations.map((c) => c.url).slice(0, 5),
        },
      },
    };

    await db
      .update(contentItems)
      .set({
        script,
        sourceUrl,
        metadata: nextMeta,
        updatedAt: new Date(),
      })
      .where(eq(contentItems.id, row.id));

    updated += 1;
    items.push({
      contentItemId: row.id,
      title: row.topic,
      location: row.locationName,
      eventStartsAt: row.eventStartsAt?.toISOString() ?? null,
      relevanceScore: Number(row.relevanceScore ?? 0.5),
      urgencyScore: Number(row.urgencyScore ?? 0.5),
      outcome: 'updated',
      sourceUrl,
    });
  }

  return {
    documentTitle: 'Recent opportunities',
    extractedCount: candidates.length,
    created: 0,
    updated,
    items,
    enrichmentsAttempted,
    webResearchAttempted,
    sourceProposalsCreated: 0,
  };
}
