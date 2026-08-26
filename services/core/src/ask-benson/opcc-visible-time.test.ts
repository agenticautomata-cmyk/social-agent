import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  composeJsonLdOpportunityDates,
  parseJsonLdPageGraph,
} from './jsonld-events.js';
import { jsonLdEventsToOpportunities } from './editorial-container.js';
import { parseEventDate, sanitizeEventEndInstant } from './listing-extract.js';
import type { ExtractedOpportunity } from './listing-extract.js';
import {
  isOpccEventDetailUrl,
  overlayOpccDetailVisibleTime,
  parseOpccDetailVisibleTime,
} from './opcc-visible-time.js';

function mecDetailHtml(opts: {
  title: string;
  startDate: string;
  endDate?: string | null;
  visibleTime: string | null;
  dateLabel?: string;
}): string {
  const endJson =
    opts.endDate === undefined
      ? `"endDate": "${opts.startDate.replace('T03:', 'T11:').replace('T05:', 'T11:').replace('T02:', 'T04:').replace('T06:', 'T13:').replace('T12:', 'T12:')}"`
      : opts.endDate
        ? `"endDate": "${opts.endDate}"`
        : `"endDate": "${opts.startDate.slice(0, 10)}"`;
  const timeBlock = opts.visibleTime
    ? `<div class="mec-single-event-time">
                <i class="mec-sl-clock"></i><h3 class="mec-time">Time</h3>
                <dl><dd><abbr class="mec-events-abbr">${opts.visibleTime}</abbr></dd></dl>
            </div>`
    : '';
  return `<!doctype html><html><head>
<script type="application/ld+json">
{"@context":"http://schema.org","@type":"Event","name":${JSON.stringify(opts.title)},
"startDate":${JSON.stringify(opts.startDate)},${endJson},
"location":{"@type":"Place","name":"Overland Park Convention Center"}}
</script></head><body>
<div class="mec-single-event-date"><h3 class="mec-date">Date</h3>
<dl><dd><abbr class="mec-events-abbr"><span class="mec-start-date-label">${opts.dateLabel ?? 'Aug 21 2026'}</span></abbr></dd></dl></div>
${timeBlock}
<p>Admin Office Hours M-F 8:00am - 5:00pm</p>
</body></html>`;
}

function runOpccDetailParse(html: string, detailUrl: string): ExtractedOpportunity {
  const graph = parseJsonLdPageGraph(html);
  const [opp] = jsonLdEventsToOpportunities(graph.events, detailUrl);
  assert.ok(opp);
  return overlayOpccDetailVisibleTime(opp, { html, pageUrl: detailUrl });
}

describe('isOpccEventDetailUrl', () => {
  it('accepts OPCC event detail paths only', () => {
    assert.equal(
      isOpccEventDetailUrl(
        'https://opconventioncenter.com/events/inspiring-women-in-public-administration-conference-2026/',
      ),
      true,
    );
    assert.equal(isOpccEventDetailUrl('https://opconventioncenter.com/events/'), false);
    assert.equal(isOpccEventDetailUrl('https://opconventioncenter.com/events'), false);
    assert.equal(isOpccEventDetailUrl('https://example.com/events/foo/'), false);
  });
});

describe('parseOpccDetailVisibleTime', () => {
  it('reads MEC abbr range and start-only', () => {
    const range = parseOpccDetailVisibleTime(
      mecDetailHtml({
        title: 'X',
        startDate: '2026-08-21T03:00:00-05:00',
        visibleTime: '8:00 am - 4:30 pm',
      }),
    );
    assert.deepEqual(range, {
      startTime: '08:00:00',
      endTime: '16:30:00',
      raw: '8:00 am - 4:30 pm',
    });

    const startOnly = parseOpccDetailVisibleTime(
      mecDetailHtml({
        title: 'Y',
        startDate: '2026-08-22T12:00:00-05:00',
        visibleTime: '5:00 pm',
      }),
    );
    assert.deepEqual(startOnly, {
      startTime: '17:00:00',
      endTime: null,
      raw: '5:00 pm',
    });
  });

  it('returns null when MEC Time block is missing', () => {
    assert.equal(
      parseOpccDetailVisibleTime(
        mecDetailHtml({
          title: 'Date only',
          startDate: '2026-09-10',
          endDate: null,
          visibleTime: null,
        }),
      ),
      null,
    );
  });
});

describe('overlayOpccDetailVisibleTime — audited OPCC cases', () => {
  it('1. Inspiring Women: HTML 8:00 am – 4:30 pm beats JSON-LD 03:00/11:30', () => {
    const url =
      'https://opconventioncenter.com/events/inspiring-women-in-public-administration-conference-2026/';
    const html = mecDetailHtml({
      title: 'Inspiring Women in Public Administration Conference 2026',
      startDate: '2026-08-21T03:00:00-05:00',
      endDate: '2026-08-21T11:30:00-05:00',
      visibleTime: '8:00 am - 4:30 pm',
      dateLabel: 'Aug 21 2026',
    });
    const opp = runOpccDetailParse(html, url);
    assert.equal(opp.startTime, '08:00:00');
    assert.equal(opp.eventDate, '2026-08-21T08:00:00');
    assert.equal(opp.eventEndDate, '2026-08-21T16:30:00');
    const start = parseEventDate(opp.eventDate);
    const end = sanitizeEventEndInstant(start, parseEventDate(opp.eventEndDate));
    assert.equal(start?.toISOString(), '2026-08-21T13:00:00.000Z');
    assert.equal(end?.toISOString(), '2026-08-21T21:30:00.000Z');
    assert.ok(end && start && end.getTime() >= start.getTime());
  });

  it('2. Midwest Ability: 10:00 am – 4:00 pm', () => {
    const url = 'https://opconventioncenter.com/events/midwest-ability-summit-2026/';
    const html = mecDetailHtml({
      title: 'Midwest Ability Summit 2026',
      startDate: '2026-08-22T05:00:00-05:00',
      endDate: '2026-08-22T11:00:00-05:00',
      visibleTime: '10:00 am - 4:00 pm',
    });
    const opp = runOpccDetailParse(html, url);
    assert.equal(opp.startTime, '10:00:00');
    assert.equal(opp.eventEndDate, '2026-08-22T16:00:00');
    assert.equal(parseEventDate(opp.eventDate)?.toISOString(), '2026-08-22T15:00:00.000Z');
    assert.equal(parseEventDate(opp.eventEndDate)?.toISOString(), '2026-08-22T21:00:00.000Z');
  });

  it('3. Blue Valley Education Breakfast: 7:00 am – 9:00 am', () => {
    const url = 'https://opconventioncenter.com/events/blue-valley-education-breakfast-2026/';
    const html = mecDetailHtml({
      title: 'Blue Valley Education Breakfast 2026',
      startDate: '2026-09-03T02:00:00-05:00',
      endDate: '2026-09-03T04:00:00-05:00',
      visibleTime: '7:00 am - 9:00 am',
    });
    const opp = runOpccDetailParse(html, url);
    assert.equal(opp.startTime, '07:00:00');
    assert.equal(opp.eventEndDate, '2026-09-03T09:00:00');
    assert.equal(parseEventDate(opp.eventDate)?.toISOString(), '2026-09-03T12:00:00.000Z');
    assert.equal(parseEventDate(opp.eventEndDate)?.toISOString(), '2026-09-03T14:00:00.000Z');
  });

  it('4. India Fest: 11:00 am – 6:00 pm', () => {
    const url = 'https://opconventioncenter.com/events/india-fest-2026/';
    const html = mecDetailHtml({
      title: 'India Fest 2026',
      startDate: '2026-08-23T06:00:00-05:00',
      endDate: '2026-08-23T13:00:00-05:00',
      visibleTime: '11:00 am - 6:00 pm',
    });
    const opp = runOpccDetailParse(html, url);
    assert.equal(opp.startTime, '11:00:00');
    assert.equal(opp.eventEndDate, '2026-08-23T18:00:00');
  });

  it('5. Trinity Gala: start-only 5:00 pm — do not invent end', () => {
    const url = 'https://opconventioncenter.com/events/trinity-temple-50th-anniversary-gala/';
    const html = mecDetailHtml({
      title: 'Trinity Temple 50th Anniversary Gala',
      startDate: '2026-08-22T12:00:00-05:00',
      endDate: '2026-08-22',
      visibleTime: '5:00 pm',
    });
    const before = jsonLdEventsToOpportunities(parseJsonLdPageGraph(html).events, url)[0]!;
    const opp = overlayOpccDetailVisibleTime(before, { html, pageUrl: url });
    assert.equal(opp.startTime, '17:00:00');
    assert.equal(opp.eventDate, '2026-08-22T17:00:00');
    assert.equal(opp.eventEndDate, before.eventEndDate);
    assert.equal(opp.eventEndDate, '2026-08-22');
  });

  it('6. MVP Law: 8:00 am – 4:00 pm', () => {
    const url = 'https://opconventioncenter.com/events/mvp-law-kansas-city-seminar/';
    const html = mecDetailHtml({
      title: 'MVP Law Kansas City Seminar',
      startDate: '2026-09-16T03:00:00-05:00',
      endDate: '2026-09-16T11:00:00-05:00',
      visibleTime: '8:00 am - 4:00 pm',
    });
    const opp = runOpccDetailParse(html, url);
    assert.equal(opp.startTime, '08:00:00');
    assert.equal(opp.eventEndDate, '2026-09-16T16:00:00');
  });
});

describe('overlayOpccDetailVisibleTime — controls', () => {
  it('7. OPCC detail with no usable Time keeps JSON-LD clocks', () => {
    const url = 'https://opconventioncenter.com/events/no-visible-time-event/';
    const html = mecDetailHtml({
      title: 'No Visible Time Event',
      startDate: '2026-08-21T03:00:00-05:00',
      endDate: '2026-08-21T11:30:00-05:00',
      visibleTime: null,
    });
    const before = jsonLdEventsToOpportunities(parseJsonLdPageGraph(html).events, url)[0]!;
    const after = overlayOpccDetailVisibleTime(before, { html, pageUrl: url });
    assert.equal(after.startTime, '03:00:00');
    assert.equal(after.eventDate, '2026-08-21T03:00:00');
    assert.equal(after.eventEndDate, before.eventEndDate);
  });

  it('8. non-OPCC JSON-LD with conflicting Time-looking text is unchanged', () => {
    const url = 'https://example.com/events/other-venue-show/';
    const html = mecDetailHtml({
      title: 'Other Venue Show',
      startDate: '2026-08-21T03:00:00-05:00',
      endDate: '2026-08-21T11:30:00-05:00',
      visibleTime: '8:00 am - 4:30 pm',
    });
    const before = jsonLdEventsToOpportunities(parseJsonLdPageGraph(html).events, url)[0]!;
    const after = overlayOpccDetailVisibleTime(before, { html, pageUrl: url });
    assert.equal(after.startTime, '03:00:00');
    assert.equal(after.eventDate, before.eventDate);
  });

  it('9. date-only OPCC event remains date-only (no invented clock)', () => {
    const url = 'https://opconventioncenter.com/events/woman-of-influence-awards/';
    const html = `<!doctype html><html><head>
<script type="application/ld+json">
{"@context":"http://schema.org","@type":"Event","name":"Woman of Influence",
"startDate":"2026-09-10","endDate":"2026-09-10",
"location":{"@type":"Place","name":"Overland Park Convention Center"}}
</script></head><body>
<div class="mec-single-event-date"><h3 class="mec-date">Date</h3>
<dl><dd><abbr class="mec-events-abbr">Sep 10 2026</abbr></dd></dl></div>
<p>All day celebration. Admin Office Hours M-F 8:00am - 5:00pm</p>
</body></html>`;
    const graph = parseJsonLdPageGraph(html);
    const [before] = jsonLdEventsToOpportunities(graph.events, url);
    assert.ok(before);
    assert.equal(before.startTime, null);
    assert.equal(before.eventDate, '2026-09-10');
    const after = overlayOpccDetailVisibleTime(before, { html, pageUrl: url });
    assert.equal(after.startTime, null);
    assert.equal(after.eventDate, '2026-09-10');
  });

  it('does not use +5 hour arithmetic; visible clock is the authority', () => {
    const url = 'https://opconventioncenter.com/events/odd-clock-check/';
    // Human 9:15 am would be +5h-from-JSON only if we hardcoded; prove literal parse.
    const html = mecDetailHtml({
      title: 'Odd Clock Check',
      startDate: '2026-08-21T03:00:00-05:00',
      endDate: '2026-08-21T11:30:00-05:00',
      visibleTime: '9:15 am - 1:45 pm',
    });
    const opp = runOpccDetailParse(html, url);
    assert.equal(opp.startTime, '09:15:00');
    assert.equal(opp.eventEndDate, '2026-08-21T13:45:00');
  });

  it('generic composeJsonLdOpportunityDates path still matches JSON-LD wall digits', () => {
    const composed = composeJsonLdOpportunityDates({
      startDate: '2026-08-21',
      endDate: '2026-08-21',
      startTime: '03:00:00',
      endTime: '11:30:00',
    });
    assert.equal(composed.eventDate, '2026-08-21T03:00:00');
    assert.equal(composed.eventEndDate, '2026-08-21T11:30:00');
  });
});
