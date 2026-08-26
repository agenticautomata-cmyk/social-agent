import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chunkContainerBlocks,
  cityFromVenueLabel,
  extractEditorialContainerOpportunities,
  finalizeContainerOpportunities,
  prepareContainerExtraction,
  tourPerformerFromPageTitle,
} from './container-event-blocks.js';
import { extractOpportunitiesFromPage } from './listing-extract.js';
import {
  classifyEditorialContainer,
  decomposeEditorialOpportunities,
  titlesMatch,
} from './editorial-container.js';
import { isFallbackMidnightDate } from './editorial-container.js';

const DOWNTOWN_OP_TITLE = 'Events in Overland Park — Downtown OP';
const DOWNTOWN_OP_URL = 'https://www.downtownop.org/events';
const DOWNTOWN_OP_HUB = `
Events in Overland Park — Downtown OP Skip to Content Events Explore All Categories
Open Menu Close Menu Downtown Events All Events
Apr 18 to Dec 19 Overland Park Farmers Market Sat, Apr 18, 2026 7:30 AM Sat, Dec 19, 2026 12:00 PM Matt Ross Community Center (map) Google Calendar ICS Check out the market at the new Clock Tower Landing! View Event
Aug 21 Third Fridays Friday, August 21, 2026 5:00 PM 7:00 PM Downtown Overland Park (map) Google Calendar ICS FREE Community Event View Event
Sep 2 Wellness Wednesdays Wednesday, September 2, 2026 6:30 PM 7:30 PM Google Calendar ICS recharge and prioritize your well-being! View Event
Sep 12 Movie Night Saturday, September 12, 2026 6:00 PM 9:00 PM Clock Tower Plaza (map) Google Calendar ICS Free community event! View Event
Oct 1 Harvesting Hope Thursday, October 1, 2026 5:30 PM 8:00 PM Google Calendar ICS Purchase tickets here ! View Event
Oct 9 Bourbon, Bacon & Brews Friday, October 9, 2026 4:00 PM 8:00 PM Google Calendar ICS TICKETS View Event
Oct 24 Trick-or-Treat Event Saturday, October 24, 2026 2:00 PM 4:00 PM Google Calendar ICS Free community event! View Event
Aug 13 Concerts in the Park: Twice on Sunday Thursday, August 13, 2026 7:00 PM 9:00 PM Google Calendar ICS Free live music! View Event
Join Our Newsletter Email Address Sign Up Contact Us
`;

const FAMILY_SHOWS_TITLE = 'Family Shows in Kansas City | Schedule 2026–2027';
const FAMILY_SHOWS_URL = 'https://kc.events/family';

function familyShowsFlattened(): string {
  const rows = [
    'Aug 20 2026 4:30 PM Thu CIRCUS Garden Bros Nuclear Circus : Fun Factory Garden Bros Nuclear Circus: Fun Factory Independence Center Mall Independence Center Mall 64057, 18801 East 39th Street S Independence , MO From $ 51 View Tickets',
    'Aug 20 2026 7:30 PM Thu CIRCUS Garden Bros Nuclear Circus : Fun Factory Garden Bros Nuclear Circus: Fun Factory Independence Center Mall Independence Center Mall 64057, 18801 East 39th Street S Independence , MO From $ 53 View Tickets',
    'Aug 21 2026 6:30 PM Fri CHILDREN / FAMILY High Demand What If Puppets What If Puppets The Carlsen Center - Polsky Theatre The Carlsen Center - Polsky Theatre 66210, 12345 College Boulevard Overland Park , KS From $ 15 View Tickets',
    'Oct 24 2026 2:00 PM Sat CHILDREN / FAMILY High Demand Weekend Event The Snowy Day The Snowy Day Starlight Theatre - Kansas City Starlight Theatre - Kansas City 64132, 4600 Starlight Rd Kansas City , MO From $ 32 View Tickets',
    'Nov 08 2026 1:00 PM Sun CHILDREN / FAMILY Paw Patrol Live Paw Patrol Live Municipal Auditorium Municipal Auditorium 64106, 301 W 13th St Kansas City , MO From $ 28 View Tickets',
    'Jan 15 2027 7:00 PM Fri CHILDREN / FAMILY Disney On Ice Disney On Ice T-Mobile Center T-Mobile Center 64105, 1407 Grand Blvd Kansas City , MO From $ 40 View Tickets',
  ];
  const chrome =
    'Family Shows in Kansas City | Schedule 2026–2027 Type at least 2 characters to search All Events Events Tonight This Weekend Family Shows Calendar — Updated Daily ‹ 19 AUG 2026 20 AUG 2026 21 AUG 2026 Updated : August 19, 2026 Upcoming Family Shows: 238 ';
  const filler = ' Nearby venues and filters. '.repeat(80);
  return `${chrome}${rows.join(' ')}${filler}${rows.join(' ')}`;
}

const FESTIVAL_PAGE = `
Panda Fest returns to Legends Field.
The 12th annual Panda Fest is Saturday, October 9, 2026 4:00 PM at Legends Field in Kansas City, KS.
Gates open in the afternoon. Food, music, and family activities on the field.
`;

const GUIDE_PAGE = `
Parkville is a walkable river town. Start with coffee on Main, browse the boutiques,
then grab tacos before sunset at the riverfront. No tickets, no showtimes — just a day trip.
Updated : August 19, 2026
`;

describe('editorial container child extraction', () => {
  it('1. Downtown OP-style hub text yields multiple dated children and drops the parent title', async () => {
    const classified = classifyEditorialContainer({
      url: DOWNTOWN_OP_URL,
      title: DOWNTOWN_OP_TITLE,
      pageText: DOWNTOWN_OP_HUB,
    });
    assert.equal(classified.isContainer, true);

    const prep = prepareContainerExtraction({
      pageText: DOWNTOWN_OP_HUB,
      pageTitle: DOWNTOWN_OP_TITLE,
      pageUrl: DOWNTOWN_OP_URL,
    });
    assert.ok(prep.blocks.length >= 6, `expected many blocks, got ${prep.blocks.length}`);
    assert.ok(prep.shouldSplit);

    const extracted = await extractOpportunitiesFromPage({
      pageUrl: DOWNTOWN_OP_URL,
      pageTitle: DOWNTOWN_OP_TITLE,
      pageText: DOWNTOWN_OP_HUB,
      editorialContainer: true,
    });
    const titles = extracted.opportunities.map((opp) => opp.title);
    assert.equal(titles.some((title) => titlesMatch(title, DOWNTOWN_OP_TITLE)), false);
    assert.ok(extracted.opportunities.length >= 6, `got ${extracted.opportunities.length}: ${titles.join(', ')}`);
    assert.ok(titles.some((title) => /farmers market/i.test(title)));
    assert.ok(titles.some((title) => /third fridays/i.test(title)));
    assert.ok(titles.some((title) => /movie night/i.test(title)));
    assert.ok(extracted.opportunities.every((opp) => Boolean(opp.eventDate)));
  });

  it('2. Family Shows-style long flattened schedule chunks into multiple performances', () => {
    const pageText = familyShowsFlattened();
    assert.ok(pageText.length > 4000);
    const prep = prepareContainerExtraction({
      pageText,
      pageTitle: FAMILY_SHOWS_TITLE,
      pageUrl: FAMILY_SHOWS_URL,
    });
    assert.ok(prep.shouldSplit);
    assert.ok(prep.chunks.length >= 1);
    assert.ok(prep.blocks.length >= 4, `blocks=${prep.blocks.length}`);
    const titles = prep.structuredOpportunities.map((opp) => opp.title);
    assert.equal(titles.some((title) => titlesMatch(title, FAMILY_SHOWS_TITLE)), false);
    assert.ok(titles.some((title) => /garden bros/i.test(title)));
    assert.ok(titles.some((title) => /what if puppets/i.test(title)));
    assert.ok(titles.some((title) => /snowy day/i.test(title)));
    const chunked = chunkContainerBlocks(prep.blocks, 500);
    assert.ok(chunked.length >= 2, `expected chunking on long schedule, got ${chunked.length}`);
  });

  it('3. genuine single-event festival page is not split into children', () => {
    const prep = prepareContainerExtraction({
      pageText: FESTIVAL_PAGE,
      pageTitle: 'Panda Fest',
      pageUrl: 'https://www.examplefests.com/events-1/panda-fest',
    });
    assert.equal(prep.shouldSplit, false);
    assert.ok(prep.structuredOpportunities.length <= 1);
    const opps = extractEditorialContainerOpportunities({
      pageText: FESTIVAL_PAGE,
      pageTitle: 'Panda Fest',
      pageUrl: 'https://www.examplefests.com/events-1/panda-fest',
    });
    assert.equal(opps.length, 0);
  });

  it('4. editorial guide with no dated child cards yields zero children', () => {
    const title = 'Spend a Day in Parkville: Where to Eat, Shop, and Explore';
    const classified = classifyEditorialContainer({
      url: 'https://visitkc.com/spend-a-day-in-parkville',
      title,
      pageText: GUIDE_PAGE,
    });
    assert.equal(classified.isContainer, true);
    const opps = extractEditorialContainerOpportunities({
      pageText: GUIDE_PAGE,
      pageTitle: title,
      pageUrl: 'https://visitkc.com/spend-a-day-in-parkville',
    });
    assert.equal(opps.length, 0);
    const decomposed = decomposeEditorialOpportunities({
      opportunities: opps,
      parentTitle: title,
      parentUrl: 'https://visitkc.com/parkville',
      container: classified,
    });
    assert.equal(decomposed.length, 1);
    assert.equal(decomposed[0]?.eventDate, null);
    assert.equal(decomposed[0]?.startTime, null);
  });

  it('5. duplicate child appearing in two chunks is one normalized result', () => {
    const pageText = `${DOWNTOWN_OP_HUB}\n${DOWNTOWN_OP_HUB}`;
    const opps = extractEditorialContainerOpportunities({
      pageText,
      pageTitle: DOWNTOWN_OP_TITLE,
      pageUrl: DOWNTOWN_OP_URL,
    });
    const movie = opps.filter((opp) => /movie night/i.test(opp.title));
    assert.equal(movie.length, 1);
    const doubled = finalizeContainerOpportunities([...opps, ...opps], DOWNTOWN_OP_TITLE);
    assert.equal(doubled.length, opps.length);
  });

  it('6. date/time parsing keeps real times, leaves date-only undated-at-midnight, and drops parent midnight', () => {
    const pageText = `
Events in Overland Park — Downtown OP
Apr 18 Overland Park Farmers Market Sat, Apr 18, 2026 7:30 AM Matt Ross Community Center (map) View Event
Oct 12 Harvest Festival Saturday, October 12, 2026 Clock Tower Plaza (map) View Event
`;
    const opps = extractEditorialContainerOpportunities({
      pageText,
      pageTitle: DOWNTOWN_OP_TITLE,
      pageUrl: DOWNTOWN_OP_URL,
    });
    const timed = opps.find((opp) => /farmers market/i.test(opp.title));
    const dateOnly = opps.find((opp) => /harvest festival/i.test(opp.title));
    assert.ok(timed?.eventDate);
    assert.ok(timed?.startTime);
    assert.match(timed!.eventDate!, /T07:30:00/);
    assert.equal(isFallbackMidnightDate(timed!.eventDate), false);
    assert.ok(dateOnly?.eventDate);
    assert.equal(dateOnly?.startTime, null);
    assert.equal(dateOnly!.eventDate!.slice(0, 10), '2026-10-12');
    assert.doesNotMatch(dateOnly!.eventDate!, /T00:00:00/);
    assert.equal(opps.some((opp) => titlesMatch(opp.title, DOWNTOWN_OP_TITLE)), false);
    assert.equal(opps.some((opp) => /T00:00:00/.test(opp.eventDate ?? '') && !opp.startTime), false);
  });
});

const BOWLINE_TOUR_TITLE = 'Shows — The Bowline Brothers';
const BOWLINE_TOUR_URL = 'https://www.bowlinebrothers.com/shows';
const BOWLINE_TOUR_HTML = `
<html><head>
<title>Shows — The Bowline Brothers</title>
<script type="application/ld+json">{"@type":"WebSite","name":"The Bowline Brothers","url":"https://www.bowlinebrothers.com"}</script>
</head><body>
<article class="eventlist-event">
  <h1 class="eventlist-title"><a href="/shows/tin-roof-delray">Tin Roof Delray Beach</a></h1>
  <time class="event-date">Sep 3 to Sep 4</time>
  <time datetime="2026-09-03">Thu, Sep 3, 2026</time>
  <time datetime="2026-09-03T22:00:00">10:00 PM</time>
  <time datetime="2026-09-04">Fri, Sep 4, 2026</time>
  <time datetime="2026-09-04T02:00:00">2:00 AM</time>
  Google Calendar ICS View Event
</article>
<article class="eventlist-event">
  <h1 class="eventlist-title"><a href="/shows/tin-roof-ftl">Tin Roof Fort Lauderdale</a></h1>
  <time>Sep 5</time>
  <time datetime="2026-09-05">Fri, Sep 5, 2026</time>
  <time datetime="2026-09-05T22:00:00">10:00 PM</time>
  Google Calendar ICS View Event
</article>
<article class="eventlist-event">
  <h1 class="eventlist-title"><a href="/shows/tin-roof-indy">Tin Roof Indianapolis</a></h1>
  <time>Sep 12</time>
  <time datetime="2026-09-12">Sat, Sep 12, 2026</time>
  <time datetime="2026-09-12T21:00:00">9:00 PM</time>
  Google Calendar ICS View Event
</article>
<article class="eventlist-event">
  <h1 class="eventlist-title"><a href="/shows/limitless">Limitless Brewing</a></h1>
  <time>Sep 18</time>
  <time datetime="2026-09-18">Thu, Sep 18, 2026</time>
  <time datetime="2026-09-18T20:00:00">8:00 PM</time>
  Google Calendar ICS View Event
</article>
<article class="eventlist-event">
  <h1 class="eventlist-title"><a href="/shows/recordbar">recordBar Kansas City</a></h1>
  <time>Oct 2</time>
  <time datetime="2026-10-02">Fri, Oct 2, 2026</time>
  <time datetime="2026-10-02T21:00:00">9:00 PM</time>
  Google Calendar ICS View Event
</article>
</body></html>
`;

function bowlineTourPlainText(): string {
  return `
Shows — The Bowline Brothers
Sep 3 to Sep 4 Tin Roof Delray Beach Thu, Sep 3, 2026 10:00 PM Fri, Sep 4, 2026 2:00 AM Google Calendar ICS View Event
Sep 5 Tin Roof Fort Lauderdale Fri, Sep 5, 2026 10:00 PM Google Calendar ICS View Event
Sep 12 Tin Roof Indianapolis Sat, Sep 12, 2026 9:00 PM Google Calendar ICS View Event
Sep 18 Limitless Brewing Thu, Sep 18, 2026 8:00 PM Google Calendar ICS View Event
Oct 2 recordBar Kansas City Fri, Oct 2, 2026 9:00 PM Google Calendar ICS View Event
`;
}

describe('artist tour venue-only child promotion', () => {
  it('1. artist tour page + venue-only child => performer title, venue, and city', () => {
    assert.equal(tourPerformerFromPageTitle(BOWLINE_TOUR_TITLE), 'The Bowline Brothers');
    assert.equal(cityFromVenueLabel('Tin Roof Delray Beach'), 'Delray Beach');

    const opps = extractEditorialContainerOpportunities({
      pageText: bowlineTourPlainText(),
      pageTitle: BOWLINE_TOUR_TITLE,
      pageUrl: BOWLINE_TOUR_URL,
      pageHtml: BOWLINE_TOUR_HTML,
    });
    const delray = opps.find((opp) => /delray/i.test(opp.venue ?? '') || /delray/i.test(opp.title));
    assert.ok(delray, `missing Delray: ${opps.map((o) => o.title).join(' | ')}`);
    assert.match(delray!.title, /bowline brothers at tin roof delray beach/i);
    assert.equal(delray!.venue, 'Tin Roof Delray Beach');
    assert.equal(delray!.location, 'Delray Beach');
    assert.ok(delray!.eventDate);
    assert.match(delray!.eventDate!, /2026-09-03/);
    assert.equal(delray!.startTime, '22:00:00');
  });

  it('2. two venues on different dates yield distinct children', () => {
    const opps = extractEditorialContainerOpportunities({
      pageText: bowlineTourPlainText(),
      pageTitle: BOWLINE_TOUR_TITLE,
      pageUrl: BOWLINE_TOUR_URL,
    });
    const delray = opps.find((opp) => /delray/i.test(opp.venue ?? ''));
    const ftl = opps.find((opp) => /fort lauderdale/i.test(opp.venue ?? ''));
    assert.ok(delray && ftl);
    assert.notEqual(delray!.title, ftl!.title);
    assert.notEqual(delray!.eventDate?.slice(0, 10), ftl!.eventDate?.slice(0, 10));
    assert.equal(ftl!.venue, 'Tin Roof Fort Lauderdale');
    assert.equal(ftl!.location, 'Fort Lauderdale');
  });

  it('3. out-of-market venue/location is preserved for wrong_city logic', () => {
    const opps = extractEditorialContainerOpportunities({
      pageText: bowlineTourPlainText(),
      pageTitle: BOWLINE_TOUR_TITLE,
      pageUrl: BOWLINE_TOUR_URL,
    });
    const indy = opps.find((opp) => /indianapolis/i.test(opp.venue ?? ''));
    assert.ok(indy);
    assert.equal(indy!.venue, 'Tin Roof Indianapolis');
    assert.equal(indy!.location, 'Indianapolis');
    assert.match(indy!.title, /bowline brothers at tin roof indianapolis/i);
  });

  it('4. Kansas City-area venue survives as a legitimate event candidate', () => {
    const opps = extractEditorialContainerOpportunities({
      pageText: bowlineTourPlainText(),
      pageTitle: BOWLINE_TOUR_TITLE,
      pageUrl: BOWLINE_TOUR_URL,
    });
    const kc = opps.find((opp) => /kansas city/i.test(opp.venue ?? '') || /recordbar/i.test(opp.venue ?? ''));
    assert.ok(kc);
    assert.match(kc!.venue ?? '', /recordbar kansas city/i);
    assert.equal(kc!.location, 'Kansas City');
    assert.match(kc!.title, /bowline brothers at recordbar kansas city/i);
  });

  it('5. real child event title is not rewritten into parent-performer format', () => {
    const pageText = `
Shows — The Bowline Brothers
Sep 18 Limitless Brewing Thu, Sep 18, 2026 8:00 PM Google Calendar ICS View Event
Sep 20 Hometown Reunion Show Sat, Sep 20, 2026 8:00 PM Knuckleheads Saloon Kansas City (map) Google Calendar ICS View Event
`;
    const opps = extractEditorialContainerOpportunities({
      pageText,
      pageTitle: BOWLINE_TOUR_TITLE,
      pageUrl: BOWLINE_TOUR_URL,
    });
    const reunion = opps.find((opp) => /hometown reunion/i.test(opp.title));
    assert.ok(reunion, `got ${opps.map((o) => o.title).join(' | ')}`);
    assert.match(reunion!.title, /^Hometown Reunion Show$/i);
    assert.doesNotMatch(reunion!.title, /bowline brothers at/i);
    assert.ok(reunion!.venue && /knuckleheads/i.test(reunion!.venue));
    const brewing = opps.find((opp) => /limitless/i.test(opp.venue ?? ''));
    assert.ok(brewing);
    assert.match(brewing!.title, /bowline brothers at limitless brewing/i);
  });

  it('6. Downtown OP / Family Shows extraction remains unchanged', async () => {
    const downtown = await extractOpportunitiesFromPage({
      pageUrl: DOWNTOWN_OP_URL,
      pageTitle: DOWNTOWN_OP_TITLE,
      pageText: DOWNTOWN_OP_HUB,
      editorialContainer: true,
    });
    assert.ok(downtown.opportunities.some((opp) => /movie night/i.test(opp.title)));
    assert.equal(
      downtown.opportunities.some((opp) => /downtown op at/i.test(opp.title) || /bowline/i.test(opp.title)),
      false,
    );
    assert.ok(downtown.opportunities.every((opp) => !/^The Bowline Brothers at/i.test(opp.title)));

    const family = prepareContainerExtraction({
      pageText: familyShowsFlattened(),
      pageTitle: FAMILY_SHOWS_TITLE,
      pageUrl: FAMILY_SHOWS_URL,
    });
    const familyTitles = family.structuredOpportunities.map((opp) => opp.title);
    assert.ok(familyTitles.some((title) => /garden bros/i.test(title)));
    assert.equal(familyTitles.some((title) => / at /i.test(title) && /family shows/i.test(title)), false);
  });

  it('cityFromVenueLabel skips venue-type trailing tokens', () => {
    assert.equal(cityFromVenueLabel('Limitless Brewing'), null);
    assert.equal(cityFromVenueLabel('Tin Roof Delray Beach'), 'Delray Beach');
    assert.equal(cityFromVenueLabel('Tin Roof Fort Lauderdale'), 'Fort Lauderdale');
    assert.equal(cityFromVenueLabel("St Elizabeth's BBQ Fest"), null);
  });

  it('strips upcoming-shows chrome from a venue-only first card', () => {
    const pageText = `
Shows — The Bowline Brothers Upcoming Shows
Aug 20 Limitless Brewing Thu, Aug 20, 2026 7:00 PM Google Calendar ICS View Event
Oct 2 recordBar Kansas City Fri, Oct 2, 2026 9:00 PM Google Calendar ICS View Event
`;
    const opps = extractEditorialContainerOpportunities({
      pageText,
      pageTitle: BOWLINE_TOUR_TITLE,
      pageUrl: BOWLINE_TOUR_URL,
    });
    const brewing = opps.find((opp) => /limitless/i.test(opp.venue ?? '') || /limitless/i.test(opp.title));
    assert.ok(brewing, `got ${opps.map((o) => `${o.title} [${o.venue}]`).join(' | ')}`);
    assert.equal(brewing!.venue, 'Limitless Brewing');
    assert.match(brewing!.title, /^The Bowline Brothers at Limitless Brewing$/i);
    assert.doesNotMatch(brewing!.title, /upcoming shows/i);
  });
});
