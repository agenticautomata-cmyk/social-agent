import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { composeJsonLdOpportunityDates, parseJsonLdPageGraph } from './jsonld-events.js';
import { jsonLdEventsToOpportunities } from './editorial-container.js';
import { parseEventDate, sanitizeEventEndInstant } from './listing-extract.js';

describe('json-ld event extraction', () => {
  it('extracts multiple Event nodes from a schedule graph', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'CollectionPage', name: 'Family Shows in Kansas City | Schedule 2026–2027' },
        {
          '@type': 'TheaterEvent',
          name: 'The Lion King',
          startDate: '2026-10-12T19:00:00-05:00',
          location: { '@type': 'Place', name: 'Music Hall' },
          url: 'https://kctheater.org/lion-king',
        },
        {
          '@type': 'TheaterEvent',
          name: 'Paw Patrol Live',
          startDate: '2026-11-08T14:00:00-05:00',
          location: { '@type': 'Place', name: 'Municipal Auditorium' },
        },
      ],
    })}</script>`;
    const graph = parseJsonLdPageGraph(html);
    assert.equal(graph.hasArticleSchema, true);
    assert.equal(graph.events.length, 2);
    assert.equal(graph.events[0]?.name, 'The Lion King');
    assert.equal(graph.events[0]?.startDate, '2026-10-12');
    assert.equal(graph.events[0]?.startTime, '19:00:00');
    assert.equal(graph.events[0]?.venue, 'Music Hall');
  });

  it('keeps a legitimate UTC 03:00Z JSON-LD clock', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Event',
      name: 'Overnight market load-in',
      startDate: '2026-09-16T03:00:00Z',
    })}</script>`;
    const graph = parseJsonLdPageGraph(html);
    assert.equal(graph.events[0]?.startDate, '2026-09-16');
    assert.equal(graph.events[0]?.startTime, '03:00:00');
  });

  it('treats UTC midnight JSON-LD as date-only and keeps TicketSqueeze evening wall clocks', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'MusicEvent', name: 'Benson Boone', startDate: '2026-08-31T00:00:00+00:00' },
        { '@type': 'Event', name: 'Hot Wheels', startDate: '2026-10-03T18:30:00+00:00' },
        { '@type': 'SportsEvent', name: 'Kansas Jayhawks vs Missouri', startDate: '2026-12-06T03:30:00+00:00' },
        { '@type': 'Event', name: 'PBR Teams', startDate: '2026-10-23T19:45:00+00:00' },
      ],
    })}</script>`;
    const graph = parseJsonLdPageGraph(html);
    const byName = Object.fromEntries(graph.events.map((ev) => [ev.name, ev]));
    assert.equal(byName['Benson Boone']?.startDate, '2026-08-31');
    assert.equal(byName['Benson Boone']?.startTime, null);
    assert.equal(byName['Hot Wheels']?.startDate, '2026-10-03');
    assert.equal(byName['Hot Wheels']?.startTime, '18:30:00');
    assert.equal(byName['Kansas Jayhawks vs Missouri']?.startDate, '2026-12-06');
    assert.equal(byName['Kansas Jayhawks vs Missouri']?.startTime, '03:30:00');
    assert.equal(byName['PBR Teams']?.startTime, '19:45:00');
  });
});

describe('json-ld endDate clock preservation', () => {
  it('1. start 08:00 -06:00 / end 14:00 -06:00 => 14:00Z / 20:00Z', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Event',
      name: '2026 CommUNITY Fest Presented by G.E.H.A',
      startDate: '2026-11-06T08:00:00-06:00',
      endDate: '2026-11-06T14:00:00-06:00',
      location: { '@type': 'Place', name: 'Memorial Hall' },
    })}</script>`;
    const graph = parseJsonLdPageGraph(html);
    assert.equal(graph.events[0]?.startDate, '2026-11-06');
    assert.equal(graph.events[0]?.startTime, '08:00:00');
    assert.equal(graph.events[0]?.endDate, '2026-11-06');
    assert.equal(graph.events[0]?.endTime, '14:00:00');

    const [opp] = jsonLdEventsToOpportunities(
      graph.events,
      'https://unitedwaygkc.org/event/community-fest-2026/',
    );
    assert.equal(opp?.eventDate, '2026-11-06T08:00:00');
    assert.equal(opp?.eventEndDate, '2026-11-06T14:00:00');

    const start = parseEventDate(opp!.eventDate);
    const end = sanitizeEventEndInstant(start, parseEventDate(opp!.eventEndDate));
    assert.equal(start?.toISOString(), '2026-11-06T14:00:00.000Z');
    assert.equal(end?.toISOString(), '2026-11-06T20:00:00.000Z');
    assert.ok(end!.getTime() > start!.getTime());
  });

  it('2. same-day normal timed event keeps end after start', () => {
    const composed = composeJsonLdOpportunityDates({
      startDate: '2026-09-16',
      startTime: '17:00:00',
      endDate: '2026-09-16',
      endTime: '20:00:00',
    });
    const start = parseEventDate(composed.eventDate);
    const end = sanitizeEventEndInstant(start, parseEventDate(composed.eventEndDate));
    assert.ok(start && end && end.getTime() > start.getTime());
  });

  it('3. overnight event crossing midnight preserves next-day end', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@type': 'MusicEvent',
      name: 'Late night set',
      startDate: '2026-11-06T22:00:00-06:00',
      endDate: '2026-11-07T02:00:00-06:00',
    })}</script>`;
    const graph = parseJsonLdPageGraph(html);
    const [opp] = jsonLdEventsToOpportunities(graph.events, 'https://example.com/late');
    const start = parseEventDate(opp!.eventDate);
    const end = sanitizeEventEndInstant(start, parseEventDate(opp!.eventEndDate));
    assert.equal(start?.toISOString(), '2026-11-07T04:00:00.000Z');
    assert.equal(end?.toISOString(), '2026-11-07T08:00:00.000Z');
    assert.ok(end!.getTime() > start!.getTime());
  });

  it('3b. same-calendar-date overnight clocks bump end to next day', () => {
    const composed = composeJsonLdOpportunityDates({
      startDate: '2026-11-06',
      startTime: '22:00:00',
      endDate: '2026-11-06',
      endTime: '02:00:00',
    });
    assert.equal(composed.eventEndDate, '2026-11-07T02:00:00');
    const start = parseEventDate(composed.eventDate);
    const end = sanitizeEventEndInstant(start, parseEventDate(composed.eventEndDate));
    assert.ok(start && end && end.getTime() > start.getTime());
  });

  it('4. event with no endDate does not invent an end', () => {
    const composed = composeJsonLdOpportunityDates({
      startDate: '2026-11-06',
      startTime: '08:00:00',
      endDate: null,
      endTime: null,
    });
    assert.equal(composed.eventEndDate, null);
    assert.equal(sanitizeEventEndInstant(parseEventDate(composed.eventDate), null), null);
  });

  it('5. date-only end keeps date-only semantics', () => {
    const composed = composeJsonLdOpportunityDates({
      startDate: '2026-11-06',
      startTime: null,
      endDate: '2026-11-06',
      endTime: null,
    });
    assert.equal(composed.eventEndDate, '2026-11-06');
    assert.equal(parseEventDate(composed.eventEndDate)?.toISOString(), '2026-11-06T00:00:00.000Z');
  });

  it('drops inverted date-only end when start is a later timed instant', () => {
    const start = parseEventDate('2026-11-06T08:00:00');
    const end = parseEventDate('2026-11-06');
    assert.equal(sanitizeEventEndInstant(start, end), null);
  });
});
