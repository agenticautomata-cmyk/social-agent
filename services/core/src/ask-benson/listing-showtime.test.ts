import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractEditorialContainerOpportunities } from './container-event-blocks.js';
import { parseEventDate } from './listing-extract.js';
import { overlayListingShowtime, parseListingCardShowtime } from './listing-showtime.js';
import type { ExtractedOpportunity } from './listing-extract.js';

const DOWNTOWN_OP_TITLE = 'Events in Overland Park — Downtown OP';
const DOWNTOWN_OP_URL = 'https://www.downtownop.org/events';
const DOWNTOWN_OP_HUB = `
Events in Overland Park — Downtown OP Skip to Content Events Explore All Categories
Open Menu Close Menu Downtown Events All Events
Apr 18 to Dec 19 Overland Park Farmers Market Sat, Apr 18, 2026 7:30 AM Sat, Dec 19, 2026 12:00 PM Matt Ross Community Center (map) Google Calendar ICS Check out the market at the new Clock Tower Landing! View Event
Oct 1 Harvesting Hope Thursday, October 1, 2026 5:30 PM 8:00 PM Google Calendar ICS Purchase tickets here ! View Event
Oct 24 Trick-or-Treat Event Saturday, October 24, 2026 2:00 PM 4:00 PM Google Calendar ICS Free community event! View Event
Join Our Newsletter Email Address Sign Up Contact Us
`;

function familyShowsFlattened(): string {
  return `
Family Shows in Kansas City | Schedule 2026–2027 Upcoming Family Shows
Aug 20 2026 7:30 PM Thu CIRCUS Garden Bros Nuclear Circus Garden Bros Nuclear Circus Independence Center Mall View Tickets
Nov 08 2026 1:00 PM Sun Paw Patrol Live Municipal Auditorium View Tickets
`;
}

function hubChild(overrides: Partial<ExtractedOpportunity> = {}): ExtractedOpportunity {
  return {
    title: 'Hot Wheels Monster Trucks Live Glow-N-Fire',
    summary: 'Hot Wheels 2026-10-03 00:00:00 T-Mobile Center',
    venue: 'T-Mobile Center',
    location: 'T-Mobile Center',
    eventDate: '2026-10-03T00:00:00',
    startTime: '00:00:00',
    category: 'local_event',
    sourceUrl: 'https://www.ticketsqueeze.com/tickets/7834029/buy-tickets',
    tags: ['container_card'],
    ...overrides,
  };
}

describe('listing card showtime overlay', () => {
  it('parses explicit 6:30 PM as Kansas City instant and keeps title/date', () => {
    const before = hubChild();
    const html = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'Hot Wheels Monster Trucks Live Glow-N-Fire',
      startDate: '2026-10-03T18:30:00+00:00',
    })}</script>`;
    const after = overlayListingShowtime(before, {
      title: 'Hot Wheels Monster Trucks Live Glow-N-Fire Tickets | 10/03/2026 06:30PM | T-Mobile Center',
      html,
      text: 'Hot Wheels Monster Trucks Live Glow-N-Fire Tickets | 10/03/2026 06:30PM | T-Mobile Center',
    });
    assert.equal(after.title, before.title);
    assert.equal(after.eventDate?.slice(0, 10), '2026-10-03');
    assert.equal(after.startTime, '18:30:00');
    assert.equal(parseEventDate(after.eventDate)?.toISOString(), '2026-10-03T23:30:00.000Z');
  });

  it('keeps explicit 7:45 PM', () => {
    const after = overlayListingShowtime(
      hubChild({
        title: 'PBR Teams',
        eventDate: '2026-10-23T00:00:00',
        startTime: '00:00:00',
      }),
      {
        title: 'PBR Teams Tickets | 10/23/2026 07:45PM | T-Mobile Center',
        html: `<script type="application/ld+json">${JSON.stringify({
          '@type': 'Event',
          name: 'PBR Teams',
          startDate: '2026-10-23T19:45:00+00:00',
        })}</script>`,
        text: 'PBR Teams Tickets | 10/23/2026 07:45PM | T-Mobile Center',
      },
    );
    assert.equal(after.title, 'PBR Teams');
    assert.equal(after.startTime, '19:45:00');
    assert.equal(parseEventDate(after.eventDate)?.toISOString(), '2026-10-24T00:45:00.000Z');
  });

  it('keeps genuine date-only as date-only', () => {
    const after = overlayListingShowtime(
      hubChild({
        title: 'Benson Boone',
        eventDate: '2026-08-31T00:00:00',
        startTime: '00:00:00',
      }),
      {
        title: 'Benson Boone Tickets | 31st August | T-Mobile Center',
        html: `<script type="application/ld+json">${JSON.stringify({
          '@type': 'MusicEvent',
          name: 'Benson Boone',
          startDate: '2026-08-31T00:00:00+00:00',
        })}</script>`,
        text: 'Benson Boone Tickets | 31st August | T-Mobile Center',
      },
    );
    assert.equal(after.title, 'Benson Boone');
    assert.equal(after.eventDate, '2026-08-31');
    assert.equal(after.startTime, null);
    assert.equal(parseEventDate(after.eventDate)?.toISOString(), '2026-08-31T00:00:00.000Z');
  });

  it('does not accept 03:30AM ticket chrome as a showtime', () => {
    const parsed = parseListingCardShowtime(
      'Kansas Jayhawks vs. Missouri Tigers Tickets | 12/06/2026 03:30AM | T-Mobile Center',
    );
    assert.equal(parsed?.date, '2026-12-06');
    assert.equal(parsed?.time, null);
    const after = overlayListingShowtime(
      hubChild({
        title: 'Kansas Jayhawks vs. Missouri Tigers',
        eventDate: '2026-12-06T00:00:00',
        startTime: '00:00:00',
      }),
      {
        title: 'Kansas Jayhawks vs. Missouri Tigers Tickets | 12/06/2026 03:30AM | T-Mobile Center',
        html: `<script type="application/ld+json">${JSON.stringify({
          '@type': 'SportsEvent',
          name: 'Kansas Jayhawks vs. Missouri Tigers',
          startDate: '2026-12-06T03:30:00+00:00',
        })}</script>`,
        text: 'Kansas Jayhawks vs. Missouri Tigers Tickets | 12/06/2026 03:30AM | T-Mobile Center',
      },
    );
    assert.equal(after.eventDate, '2026-12-06');
    assert.equal(after.startTime, null);
  });

  it('keeps a generic JSON-LD 03:00Z clock when listing evidence has no AM chrome', () => {
    const after = overlayListingShowtime(
      hubChild({
        title: 'Overnight market load-in',
        eventDate: '2026-09-16',
        startTime: null,
      }),
      {
        title: 'Overnight market load-in',
        html: `<script type="application/ld+json">${JSON.stringify({
          '@type': 'Event',
          name: 'Overnight market load-in',
          startDate: '2026-09-16T03:00:00Z',
        })}</script>`,
        text: 'Overnight market load-in at the convention center',
      },
    );
    assert.equal(after.title, 'Overnight market load-in');
    assert.equal(after.startTime, '03:00:00');
    assert.equal(after.eventDate, '2026-09-16T03:00:00');
  });

  it('does not change Downtown OP extraction times', () => {
    const opps = extractEditorialContainerOpportunities({
      pageText: DOWNTOWN_OP_HUB,
      pageTitle: DOWNTOWN_OP_TITLE,
      pageUrl: DOWNTOWN_OP_URL,
    });
    const hope = opps.find((opp) => /harvesting hope/i.test(opp.title));
    assert.ok(hope);
    const after = overlayListingShowtime(hope!, { title: hope!.title, text: DOWNTOWN_OP_HUB });
    assert.equal(after.title, hope!.title);
    assert.equal(after.eventDate, hope!.eventDate);
    assert.equal(after.startTime, hope!.startTime);
    assert.match(after.eventDate ?? '', /T17:30:00/);
  });

  it('does not treat Time TBD as a trustworthy showtime', () => {
    const after = overlayListingShowtime(
      hubChild({
        title: 'NCAA Midwest Regional Session 2',
        eventDate: '2027-03-28T00:00:00',
        startTime: '00:00:00',
      }),
      {
        title:
          "NCAA Men's Basketball Tournament: Midwest Regional - Session 2 (Time: TBD) Tickets | 03/28/2027 12:00PM | T-Mobile Center",
        html: `<script type="application/ld+json">${JSON.stringify({
          '@type': 'SportsEvent',
          name: 'NCAA Midwest Regional Session 2',
          startDate: '2027-03-28T12:00:00+00:00',
        })}</script>`,
        text: 'Time: TBD 12:00PM',
      },
    );
    assert.equal(after.eventDate, '2027-03-28');
    assert.equal(after.startTime, null);
  });

  it('does not change Family Shows extraction times', () => {
    const opps = extractEditorialContainerOpportunities({
      pageText: familyShowsFlattened(),
      pageTitle: 'Family Shows in Kansas City | Schedule 2026–2027',
      pageUrl: 'https://kc.events/family',
    });
    const garden = opps.find((opp) => /garden bros/i.test(opp.title));
    assert.ok(garden);
    const after = overlayListingShowtime(garden!, { title: garden!.title, text: familyShowsFlattened() });
    assert.equal(after.title, garden!.title);
    assert.equal(after.eventDate, garden!.eventDate);
    assert.equal(after.startTime, garden!.startTime);
  });
});
