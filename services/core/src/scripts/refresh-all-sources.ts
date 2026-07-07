import { refreshAllSources } from '../source-ingestion/refresh.js';

const result = await refreshAllSources({ dryRun: false });
console.log(
  JSON.stringify(
    {
      ok: result.totals.failed === 0,
      totals: result.totals,
      failedSources: result.sources
        .filter((s) => s.status === 'failed')
        .map((s) => ({ name: s.sourceName, error: s.errorMessage })),
      durationSec:
        (new Date(result.finishedAt).getTime() - new Date(result.startedAt).getTime()) / 1000,
    },
    null,
    2,
  ),
);
