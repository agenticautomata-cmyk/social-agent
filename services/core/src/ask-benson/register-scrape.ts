import { db } from '../db.js';
import { sourceProposals } from '../schema.js';
import {
  registerScrapeSource,
  SCRAPE_HOST_BLOCKLIST,
  type RegisterScrapeSourceResult,
} from '../source-ingestion/register-scrape-source.js';
import type { WebResearchResult } from '../web-research/index.js';

export async function registerAskBensonListingUrl(input: {
  campaignId: string;
  url: string;
  title?: string | null;
  rationale?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<RegisterScrapeSourceResult> {
  const result = await registerScrapeSource(input);
  if (result.ok) {
    await db
      .insert(sourceProposals)
      .values({
        kind: 'new_source',
        sourceId: result.sourceId,
        title: input.title?.slice(0, 200) ?? input.url,
        url: input.url,
        rationale: input.rationale ?? 'Registered from Ask Benson chat intake.',
        status: 'accepted',
        metadata: {
          discoveredVia: input.metadata?.discoveredVia ?? 'ask_benson_auto_register',
          ...(input.metadata ?? {}),
        },
      })
      .onConflictDoNothing();
  }
  return result;
}

export async function registerAskBensonResearchCitations(
  campaignId: string,
  research: WebResearchResult,
  context: { title: string; pageUrl?: string; discoveredVia: string },
): Promise<number> {
  let registered = 0;
  for (const citation of research.citations.slice(0, 3)) {
    try {
      const host = new URL(citation.url).hostname;
      if (SCRAPE_HOST_BLOCKLIST.test(host)) continue;
      const result = await registerAskBensonListingUrl({
        campaignId,
        url: citation.url,
        title: citation.title?.slice(0, 200) ?? host,
        rationale: `Found while researching "${context.title}". ${research.summary?.slice(0, 600) ?? ''}`.trim(),
        metadata: {
          discoveredVia: context.discoveredVia,
          pageUrl: context.pageUrl ?? null,
        },
      });
      if (result.ok && result.created) registered += 1;
    } catch {
      // invalid URL — skip
    }
  }
  return registered;
}

export function countRegisteredScrapeSources(
  results: RegisterScrapeSourceResult[],
): number {
  return results.filter((result) => result.ok && result.created).length;
}
