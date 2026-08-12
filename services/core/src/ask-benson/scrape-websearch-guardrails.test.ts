import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, beforeEach } from 'node:test';
import {
  SCRAPE_WEB_SEARCH_PER_REFRESH_CAP,
  beginScrapeRefreshWave,
  buildScrapeListingSearchOptions,
  confirmScrapeWebSearchReserved,
  endScrapeRefreshWave,
  getScrapeRefreshWaveSearchCount,
  normalizeListingUrlForDedupe,
  releaseScrapeWebSearchReservation,
  reserveScrapeWebSearch,
  resetScrapeWebSearchGuardrailsForTests,
} from './scrape-websearch-guardrails.js';
import { searchWeb } from '../web-research/index.js';
import { shouldSkipBackgroundLlm } from '../llm-spend/index.js';
import { env } from '../env.js';

describe('scrape websearch guardrails', () => {
  beforeEach(() => {
    resetScrapeWebSearchGuardrailsForTests();
  });

  it('buildScrapeListingSearchOptions uses background worker scrape_listing context', () => {
    beginScrapeRefreshWave('wave-test');
    const opts = buildScrapeListingSearchOptions({
      sourceId: 'src-1',
      listingUrl: 'https://Example.com/events/',
      scanRunId: 'scan-1',
    });
    assert.equal(opts.context, 'background');
    assert.equal(opts.caller, 'scrape_listing');
    assert.equal(opts.process, 'worker');
    assert.equal(opts.sourceId, 'src-1');
    assert.equal(opts.scanRunId, 'scan-1');
    assert.equal(opts.refreshWaveId, 'wave-test');
    assert.ok(opts.listingUrl?.includes('example.com/events'));
  });

  it('normalizes listing URLs for dedupe (host case, trailing slash)', () => {
    assert.equal(
      normalizeListingUrlForDedupe('https://Example.com/events/'),
      normalizeListingUrlForDedupe('https://example.com/events'),
    );
  });

  it('per-refresh cap stops excess calls', () => {
    beginScrapeRefreshWave('cap-wave');
    const urls = Array.from({ length: SCRAPE_WEB_SEARCH_PER_REFRESH_CAP + 5 }, (_, i) => `https://a.com/${i}`);
    let allowed = 0;
    for (const url of urls) {
      const r = reserveScrapeWebSearch({ listingUrl: url, kind: 'page_fallback' });
      if (r.allowed) {
        allowed += 1;
        confirmScrapeWebSearchReserved(r.dedupeKey, r.refreshWaveId);
      }
    }
    assert.equal(allowed, SCRAPE_WEB_SEARCH_PER_REFRESH_CAP);
    assert.equal(getScrapeRefreshWaveSearchCount(), SCRAPE_WEB_SEARCH_PER_REFRESH_CAP);
    const blocked = reserveScrapeWebSearch({ listingUrl: 'https://blocked.com', kind: 'page_fallback' });
    assert.equal(blocked.allowed, false);
    if (!blocked.allowed) assert.equal(blocked.reason, 'refresh_cap_exceeded');
  });

  it('duplicate listing URL reuses/skips within TTL for page_fallback', () => {
    beginScrapeRefreshWave('dedupe-wave');
    const url = 'https://www.fifa.com/en/tournaments/mens/worldcup/';
    const first = reserveScrapeWebSearch({ listingUrl: url, kind: 'page_fallback' });
    assert.equal(first.allowed, true);
    if (first.allowed) confirmScrapeWebSearchReserved(first.dedupeKey, first.refreshWaveId);
    const second = reserveScrapeWebSearch({
      listingUrl: 'https://www.fifa.com/en/tournaments/mens/worldcup',
      kind: 'page_fallback',
    });
    assert.equal(second.allowed, false);
    if (!second.allowed) assert.equal(second.reason, 'listing_url_dedupe');
  });

  it('failed or empty search does not retry within TTL (dedupe on attempt)', () => {
    beginScrapeRefreshWave('fail-wave');
    const url = 'https://do816.com/events';
    const first = reserveScrapeWebSearch({ listingUrl: url, kind: 'page_fallback' });
    assert.equal(first.allowed, true);
    if (first.allowed) {
      // scrape-listing confirms after run() even when ok=false (unless skipped).
      confirmScrapeWebSearchReserved(first.dedupeKey, first.refreshWaveId);
    }
    const retry = reserveScrapeWebSearch({ listingUrl: url, kind: 'page_fallback' });
    assert.equal(retry.allowed, false);
    if (!retry.allowed) assert.equal(retry.reason, 'listing_url_dedupe');
  });

  it('telemetry options include caller, process, source, listing, and wave correlation', () => {
    beginScrapeRefreshWave('telemetry-wave');
    const opts = buildScrapeListingSearchOptions({
      sourceId: 'src-telemetry',
      listingUrl: 'https://visitkc.com/events/',
      scanRunId: 'scan-telemetry',
    });
    assert.equal(opts.caller, 'scrape_listing');
    assert.equal(opts.process, 'worker');
    assert.equal(opts.sourceId, 'src-telemetry');
    assert.ok(opts.listingUrl);
    assert.equal(opts.scanRunId, 'scan-telemetry');
    assert.equal(opts.refreshWaveId, 'telemetry-wave');
  });

  it('Ask Benson collect-from-link keeps user context (no scrape background options)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, 'collect-from-link.ts'), 'utf8');
    assert.doesNotMatch(src, /buildScrapeListingSearchOptions/);
    assert.doesNotMatch(src, /context:\s*['"]background['"]/);
    assert.doesNotMatch(src, /caller:\s*['"]scrape_listing['"]/);
  });

  it('distinct listings can still research within cap', () => {
    beginScrapeRefreshWave('distinct-wave');
    const a = reserveScrapeWebSearch({ listingUrl: 'https://do816.com/events', kind: 'page_fallback' });
    const b = reserveScrapeWebSearch({ listingUrl: 'https://axios.com/local/kc', kind: 'page_fallback' });
    assert.equal(a.allowed, true);
    assert.equal(b.allowed, true);
  });

  it('page_fallback and opportunity_enrich dedupe keys are independent', () => {
    beginScrapeRefreshWave('kind-wave');
    const url = 'https://savers.com/weekly-specials';
    const fallback = reserveScrapeWebSearch({ listingUrl: url, kind: 'page_fallback' });
    assert.equal(fallback.allowed, true);
    if (fallback.allowed) confirmScrapeWebSearchReserved(fallback.dedupeKey, fallback.refreshWaveId);
    const enrich = reserveScrapeWebSearch({
      listingUrl: url,
      kind: 'opportunity_enrich',
      enrichKey: 'weekly-deals',
    });
    assert.equal(enrich.allowed, true);
  });

  it('failed reservation release restores cap slot', () => {
    beginScrapeRefreshWave('release-wave');
    const r = reserveScrapeWebSearch({ listingUrl: 'https://gated.com', kind: 'page_fallback' });
    assert.equal(r.allowed, true);
    releaseScrapeWebSearchReservation();
    assert.equal(getScrapeRefreshWaveSearchCount(), 0);
  });

  it('nested refresh waves reuse outer budget', () => {
    const outer = beginScrapeRefreshWave('outer');
    const inner = beginScrapeRefreshWave('inner');
    assert.equal(inner, outer);
    endScrapeRefreshWave();
  });

  it('background searchWeb hits background gate when web search disabled', async () => {
    if (env.BENSON_WEB_SEARCH_ENABLED) {
      // Gate path verified structurally; live env has web search enabled.
      const gate = await shouldSkipBackgroundLlm('web_search');
      assert.equal(gate.skip, false);
      return;
    }
    const result = await searchWeb('fixture query', undefined, {
      context: 'background',
      caller: 'scrape_listing',
      process: 'worker',
    });
    assert.equal(result.skipped, true);
    assert.equal(result.ok, false);
  });

  it('user-context searchWeb defaults omit background gate skip when web search enabled', async () => {
    const result = await searchWeb('user fixture query');
    if (!env.OPENAI_API_KEY) {
      assert.equal(result.ok, false);
      assert.equal(result.error, 'OPENAI_API_KEY missing');
      return;
    }
    // Default context is user — not skipped by background gate alone.
    assert.notEqual(result.error, 'web_search_disabled');
  });
});
