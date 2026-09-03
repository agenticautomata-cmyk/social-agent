/**
 * Scheduled partnership-source health checks.
 *
 * Only runs extractors that exist — sources without extractors stay honest as
 * unchecked rather than fake-healthy. Invoked by the cron worker and the CLI.
 */

import { checkSource, hasExtractor } from './check.js';
import { listSourcesDueForCheck, seedSources, summarizeSourceHealth } from './registry.js';

export type PartnershipSourcesCycleResult = {
  seeded: { inserted: number; updated: number };
  checked: number;
  skippedNoExtractor: number;
  results: Array<{
    sourceName: string;
    health: string;
    factsRecorded: number;
    explanation: string;
  }>;
  healthSummary: Awaited<ReturnType<typeof summarizeSourceHealth>>;
};

export async function runDuePartnershipSourceChecks(options?: {
  seed?: boolean;
}): Promise<PartnershipSourcesCycleResult> {
  const seeded =
    options?.seed === false ? { inserted: 0, updated: 0 } : await seedSources();

  const due = await listSourcesDueForCheck();
  const results: PartnershipSourcesCycleResult['results'] = [];
  let skippedNoExtractor = 0;

  for (const source of due) {
    if (!hasExtractor(source.url)) {
      skippedNoExtractor += 1;
      continue;
    }
    const result = await checkSource(source);
    results.push({
      sourceName: result.sourceName,
      health: result.health,
      factsRecorded: result.factsRecorded,
      explanation: result.explanation,
    });
  }

  const healthSummary = await summarizeSourceHealth();
  return {
    seeded,
    checked: results.length,
    skippedNoExtractor,
    results,
    healthSummary,
  };
}
