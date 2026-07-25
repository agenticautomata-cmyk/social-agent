import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runSocrataJsonAdapter } from './adapters.js';
import { watcherFixture } from './test-fixtures.js';

describe('socrata_json adapter', () => {
  it('parses KCMO tenant-finish permits from open data', async () => {
    const watcher = watcherFixture({
      id: 'test-watcher',
      sourceName: 'KCMO Permits Test',
      sourceUrl: 'https://data.kcmo.org/resource/ntw8-aacc.json',
      sourceCategory: 'city_permit',
      adapterType: 'socrata_json',
      checkFrequencyMs: 3600000,
      lastSuccessfulCheck: null,
      lastChangedAt: null,
      lastFailureAt: null,
      lastFailureMessage: null,
      enabled: true,
      consecutiveFailureCount: 0,
      healthStatus: 'unknown',
      linkedSourceId: null,
      config: {
        socrataQuery:
          "$where=issueddate > '2025-01-01' AND (upper(description) like '%TENANT%' OR upper(permittype) like '%TENANT%')&$order=issueddate DESC&$limit=3",
        textFields: ['projectname', 'description', 'permittype'],
        entityField: 'projectname',
        idField: 'permitnum',
        matchPatterns: ['tenant'],
        signalType: 'permit',
        city: 'Kansas City',
        state: 'MO',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await runSocrataJsonAdapter(watcher, [], null);
    assert.equal(result.ok, true);
    assert.ok(result.results.length >= 1, 'expected at least one tenant permit row');
    assert.equal(result.results[0]?.signalType, 'permit');
  });
});
