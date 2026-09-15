import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  detectEventListingCapability,
  extractEventListingsFromHtml,
  stableEventListingFingerprint,
} from './event-listing-extract.js';
import {
  discoverHtmlCalendarPagination,
  extractHtmlCalendarListings,
  htmlLooksLikeDateGroupedCalendar,
  parseFullCalendarDate,
  planHtmlCalendarPageFetches,
} from './html-calendar-extract.js';
import { runAdaptiveExtractionFromArtifacts } from './adaptive-extraction/orchestrator.js';

const here = dirname(fileURLToPath(import.meta.url));
const page1 = readFileSync(join(here, 'fixtures/ssr-date-heading-calendar.fixture.html'), 'utf8');
const page2 = readFileSync(
  join(here, 'fixtures/ssr-date-heading-calendar-page2.fixture.html'),
  'utf8',
);
const empty = readFileSync(join(here, 'fixtures/ssr-date-heading-empty.fixture.html'), 'utf8');
const collectionUrl = 'https://calendar.example.org/events/';

describe('general HTML calendar reader (SSR date headings)', () => {
  it('parses full weekday date headings', () => {
    assert.equal(parseFullCalendarDate('Tuesday, September 15, 2026'), '2026-09-15');
    assert.equal(parseFullCalendarDate('Sep 15'), null);
  });

  it('recognizes date-grouped calendars without publisher-domain checks', () => {
    assert.equal(htmlLooksLikeDateGroupedCalendar(page1), true);
    assert.equal(htmlLooksLikeDateGroupedCalendar(empty), false);
    const cap = detectEventListingCapability(page1, collectionUrl);
    assert.equal(cap.hasDateGroupedHtmlCalendar, true);
    assert.ok(cap.reasons.includes('date_grouped_html_calendar'));
    assert.equal(cap.needsAdapter, false);
  });

  it('inherits date headings onto cards with short month/day labels', () => {
    const result = extractHtmlCalendarListings({
      html: page1,
      pageUrl: collectionUrl,
      configuredUrl: collectionUrl,
    });
    assert.equal(result.method, 'semantic_html_blocks');
    assert.ok(result.events.length >= 5);
    const jazz = result.events.find((e) => /Riverside Jazz Night/i.test(e.title));
    assert.ok(jazz);
    assert.equal(jazz!.startDate, '2026-09-15');
    assert.equal(jazz!.venue, 'Riverside Amphitheater');
    assert.match(jazz!.eventUrl ?? '', /\/events\/riverside-jazz-night\/?$/);
    assert.doesNotMatch(jazz!.eventUrl ?? '', /utm_source|fbclid/);
    assert.ok(jazz!.evidence.some((e) => e.startsWith('heading:Tuesday')));
    assert.ok(jazz!.imageUrl?.includes('jazz.jpg'));
  });

  it('keeps recurring titles on different dates as separate occurrences', () => {
    const result = extractEventListingsFromHtml({
      html: page1,
      pageUrl: collectionUrl,
      now: new Date('2026-09-15T17:00:00Z'),
    });
    assert.equal(result.method, 'semantic_html_blocks');
    const science = result.events.filter((e) => /Science Exhibit/i.test(e.title));
    assert.equal(science.length, 2);
    assert.deepEqual(
      science.map((e) => e.startDate).sort(),
      ['2026-09-15', '2026-09-16'],
    );
    const fps = new Set(science.map((e) => stableEventListingFingerprint(e)));
    assert.equal(fps.size, 2);
  });

  it('reads plain-text venues and categories when linked listings are absent', () => {
    const result = extractHtmlCalendarListings({
      html: page1,
      pageUrl: collectionUrl,
      configuredUrl: collectionUrl,
    });
    const trivia = result.events.find((e) => /Neighborhood Trivia/i.test(e.title));
    assert.ok(trivia);
    assert.equal(trivia!.venue, 'Corner Pub');
    assert.equal(trivia!.isRecurring, true);
    assert.ok(trivia!.evidence.some((e) => /category:Free Events/i.test(e)));
  });

  it('does not treat event titles that embed dates as date headings', () => {
    const result = extractHtmlCalendarListings({
      html: page1,
      pageUrl: collectionUrl,
      configuredUrl: collectionUrl,
    });
    assert.ok(result.events.every((e) => e.startDate === '2026-09-15' || e.startDate === '2026-09-16'));
    assert.ok(!result.events.some((e) => e.startDate === '2026-10-09'));
  });

  it('discovers numbered pagination and next-page URLs', () => {
    const pagination = discoverHtmlCalendarPagination(page1, collectionUrl);
    assert.equal(pagination.totalPages, 12);
    assert.equal(pagination.totalResults, 240);
    assert.equal(pagination.hasNext, true);
    assert.match(pagination.nextPageUrl ?? '', /\/page\/2\/?$/);
    const plan = planHtmlCalendarPageFetches({
      collectionUrl,
      html: page1,
      maxPages: 4,
    });
    assert.ok(plan.pages.length >= 2);
    assert.ok(plan.pages.every((u) => /calendar\.example\.org/.test(u)));
    assert.ok(plan.pages.every((u) => !/visitkc/i.test(u)));
  });

  it('merges bounded pagination pages without collapsing distinct dates', () => {
    const adaptive = runAdaptiveExtractionFromArtifacts({
      configuredUrl: collectionUrl,
      httpStatus: 200,
      html: page1,
      alternateBodies: [
        {
          url: `${collectionUrl}page/2/`,
          kind: 'calendar_collection',
          status: 200,
          body: page2,
        },
      ],
      now: new Date('2026-09-15T17:00:00Z'),
    });
    assert.equal(adaptive.status, 'healthy');
    assert.equal(adaptive.selectedPlatform?.signature, 'generic_semantic_html');
    assert.equal(adaptive.selectedMethod, 'semantic_html_blocks');
    assert.ok(adaptive.occurrenceCount >= 8);
    const science = adaptive.events.filter((e) => /Science Exhibit/i.test(e.title));
    assert.ok(science.length >= 3);
    assert.deepEqual(
      [...new Set(science.map((e) => e.startDate))].sort(),
      ['2026-09-15', '2026-09-16', '2026-09-17'],
    );
    // Configured collection URL preserved on rows.
    assert.ok(adaptive.events.every((e) => e.configuredUrl === collectionUrl || e.sourceUrl));
  });

  it('does not claim empty_confirmed when there are no date headings', () => {
    const result = extractEventListingsFromHtml({
      html: empty,
      pageUrl: collectionUrl,
      now: new Date('2026-09-15T17:00:00Z'),
    });
    assert.equal(result.events.length, 0);
    assert.equal(htmlLooksLikeDateGroupedCalendar(empty), false);
  });

  it('dedupes identical same-occurrence rows but not cross-date repeats', () => {
    const dupHtml = page1.replace(
      '</div>\n\n    <h2>Wednesday',
      `</div>
    <article>
      <div>Sep 15</div>
      <h3><a href="https://calendar.example.org/events/riverside-jazz-night/">Riverside Jazz Night</a></h3>
      <p><a href="https://calendar.example.org/listings/riverside-amphitheater/">Riverside Amphitheater</a></p>
    </article>

    <h2>Wednesday`,
    );
    const result = extractHtmlCalendarListings({
      html: dupHtml,
      pageUrl: collectionUrl,
      configuredUrl: collectionUrl,
    });
    const jazz = result.events.filter((e) => /Riverside Jazz Night/i.test(e.title));
    assert.equal(jazz.length, 1);
  });
});
