import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DISPLAY_TITLE_MAX_CHARS,
  applyResearchDisplayTitle,
  displayIdentityKey,
  normalizeDisplayCaps,
  extractPageDisplayHints,
  resolveDisplayTitle,
  sameCanonicalDisplay,
  stripDisplayMarkup,
} from './resolve-display-title.js';

describe('display title clarity', () => {
  it('uses a page heading when the source-page title is SEO residue', () => {
    const hints = extractPageDisplayHints(`
      <title>FIRST FRIDAYS VENDORS | JuneteenthKC</title>
      <h1>STRENGTHEN THE VINE FIRST FRIDAYS</h1>
      <p>Join us every First Friday within the 18th & Vine Historic District.</p>
    `);
    assert.equal(hints.heading, 'STRENGTHEN THE VINE FIRST FRIDAYS');
    const resolved = resolveDisplayTitle({
      rawTitle: 'FIRST FRIDAYS VENDORS | JuneteenthKC',
      sourceName: 'JuneteenthKC',
      heading: hints.heading,
      venueName: '18th & Vine Historic District, Kansas City, MO',
      summary: 'Vendor market at 18th & Vine',
    });
    assert.equal(resolved.displayTitle, 'Strengthen the Vine First Fridays');
    assert.equal(resolved.displaySubtitle, 'Vendor market at 18th & Vine');
  });

  it('publisher appended with a pipe is not part of the title', () => {
    const resolved = resolveDisplayTitle({
      rawTitle: 'FIRST FRIDAYS VENDORS | JuneteenthKC',
      sourceName: 'JuneteenthKC',
      officialName: 'Strengthen the Vine First Fridays',
      summary: 'Vendor market at 18th & Vine',
      evidence: 'Strengthen the Vine First Fridays vendor market at 18th & Vine',
    });
    assert.equal(resolved.displayTitle, 'Strengthen the Vine First Fridays');
    assert.equal(resolved.displaySubtitle, 'Vendor market at 18th & Vine');
    assert.equal(resolved.sourceName, 'JuneteenthKC');
    assert.doesNotMatch(resolved.displayTitle, /JuneteenthKC/);
  });

  it('keeps legitimate punctuation that is part of the official name', () => {
    const resolved = resolveDisplayTitle({
      rawTitle: 'R&B Night: 90s vs. 2000s',
      sourceName: 'The Midland',
    });
    assert.equal(resolved.displayTitle.includes('R&B'), true);
    assert.match(resolved.displayTitle, /90s vs\. 2000s/i);
  });

  it('strips markdown links and broken markdown', () => {
    const broken = resolveDisplayTitle({
      rawTitle: '_[SantaCaliGon Days]( takes over Historic Independence Square for its 54th year',
    });
    assert.equal(broken.displayTitle, 'SantaCaliGon Days');
    assert.equal(broken.displaySubtitle, '54th annual festival at Historic Independence Square');
    assert.equal(stripDisplayMarkup('[Hummingbird Festival](https://example.com/x)'), 'Hummingbird Festival');
  });

  it('removes HTML residue', () => {
    const resolved = resolveDisplayTitle({
      rawTitle: '<h1>Plaza Art Fair</h1>&nbsp;<span>2026</span>',
    });
    assert.equal(resolved.displayTitle.includes('<'), false);
    assert.match(resolved.displayTitle, /Plaza Art Fair/);
  });

  it('normalizes all-caps without destroying acronyms or stylized names', () => {
    assert.equal(normalizeDisplayCaps('FIRST FRIDAYS VENDORS'), 'First Fridays Vendors');
    assert.equal(normalizeDisplayCaps('KC VIP DJ SET'), 'KC VIP DJ Set');
    const santa = resolveDisplayTitle({ rawTitle: 'SantaCaliGon Days' });
    assert.equal(santa.displayTitle, 'SantaCaliGon Days');
  });

  it('strips HERE ! date-lead residue from farmers-market headlines', () => {
    const resolved = resolveDisplayTitle({
      rawTitle: 'HERE ! Sep 6 Hyde Park Farmers Market',
    });
    assert.equal(resolved.displayTitle, 'Hyde Park Farmers Market');
    assert.doesNotMatch(resolved.displayTitle, /HERE/i);
    assert.doesNotMatch(resolved.displayTitle, /^Sep\b/i);
  });

  it('removes CTA headlines when a real name exists', () => {
    const resolved = resolveDisplayTitle({
      rawTitle: 'Sign up now!',
      officialName: 'Sapphic Con Festival',
    });
    assert.equal(resolved.displayTitle, 'Sapphic Con Festival');
    assert.doesNotMatch(resolved.displayTitle, /sign up/i);
  });

  it('extracts a descriptive sentence tail', () => {
    const resolved = resolveDisplayTitle({
      rawTitle: 'SantaCaliGon Days takes over Historic Independence Square for its 54th year',
    });
    assert.equal(resolved.displayTitle, 'SantaCaliGon Days');
    assert.match(resolved.displaySubtitle ?? '', /54th annual festival at Historic Independence Square/);
  });

  it('moves an anniversary into the subtitle', () => {
    const resolved = resolveDisplayTitle({
      rawTitle: '50 Seasons of Huzzah & Cheers!',
      officialName: 'Kansas City Renaissance Festival',
      evidence: 'Kansas City Renaissance Festival 50th season',
    });
    assert.equal(resolved.displayTitle, 'Kansas City Renaissance Festival');
    assert.equal(resolved.displaySubtitle, '50th season');
  });

  it('retains source separately from the title', () => {
    const resolved = resolveDisplayTitle({
      rawTitle: 'KPop Demon Hunters Night | Kansas City Royals',
      sourceName: 'Kansas City Royals',
      venueName: 'Kauffman Stadium',
    });
    const withoutSource = resolveDisplayTitle({
      rawTitle: 'KPop Demon Hunters Night | Kansas City Royals',
      venueName: 'Kauffman Stadium',
    });
    assert.equal(withoutSource.displayTitle, 'K-Pop Demon Hunters Night');
    assert.equal(withoutSource.sourceName, 'Kansas City Royals');
    assert.equal(resolved.displayTitle, 'K-Pop Demon Hunters Night');
    assert.equal(resolved.sourceName, 'Kansas City Royals');
    assert.equal(resolved.venueName, 'Kauffman Stadium');
    assert.doesNotMatch(resolved.displayTitle, /Royals/);
  });

  it('retains newsletter discovery provenance', () => {
    const resolved = resolveDisplayTitle({
      rawTitle: 'Hummingbird Festival',
      sourceName: 'Newsletter Intelligence',
      primarySourceName: 'City of Independence',
      discoveredThrough: 'Newsletter Intelligence',
      corroboratedBy: ['Visit KC', 'MU Extension'],
    });
    assert.equal(resolved.displayTitle, 'Hummingbird Festival');
    assert.equal(resolved.primarySourceName, 'City of Independence');
    assert.equal(resolved.discoveredThrough, 'Newsletter Intelligence');
    assert.deepEqual(resolved.corroboratedBy, ['Visit KC', 'MU Extension']);
    assert.doesNotMatch(resolved.displayTitle, /Newsletter Intelligence/);
  });

  it('promotes an official source after research', () => {
    const current = resolveDisplayTitle({
      rawTitle: 'Hummingbird Festival — Newsletter Intelligence',
      sourceName: 'Newsletter Intelligence',
    });
    const researched = applyResearchDisplayTitle({
      current,
      officialName: 'Hummingbird Festival',
      primarySourceName: 'City of Independence',
      officialUrl: 'https://www.ci.independence.mo.us/hummingbird',
      discoveredThrough: 'Newsletter Intelligence',
      corroboratedBy: ['Visit KC'],
    });
    assert.equal(researched.displayTitle, 'Hummingbird Festival');
    assert.equal(researched.primarySourceName, 'City of Independence');
    assert.equal(researched.discoveredThrough, 'Newsletter Intelligence');
    assert.equal(researched.sourceUrl, 'https://www.ci.independence.mo.us/hummingbird');
  });

  it('will not let a weak research result overwrite a stronger title', () => {
    const current = resolveDisplayTitle({
      rawTitle: 'Kansas City Renaissance Festival',
      officialName: 'Kansas City Renaissance Festival',
    });
    const researched = applyResearchDisplayTitle({
      current,
      officialName: '50 Seasons of Huzzah & Cheers!',
      ogTitle: '50 Seasons of Huzzah & Cheers! | Official Website',
    });
    assert.equal(researched.displayTitle, 'Kansas City Renaissance Festival');
    assert.match(researched.changeReason ?? '', /research_weaker_than_verified_title/);
  });

  it('shows the same canonical event consistently across surfaces', () => {
    const input = {
      rawTitle: 'KPop Demon Hunters Night | Kansas City Royals',
      sourceName: 'Kansas City Royals',
      venueName: 'Kauffman Stadium',
    };
    const calendar = resolveDisplayTitle(input);
    const discover = resolveDisplayTitle(input);
    const details = resolveDisplayTitle(input);
    assert.equal(sameCanonicalDisplay(calendar, discover), true);
    assert.equal(sameCanonicalDisplay(discover, details), true);
  });

  it('title cleanup does not change canonical identity', () => {
    const raw = 'FIRST FRIDAYS VENDORS | JuneteenthKC';
    const before = displayIdentityKey({
      rawTitle: raw,
      eventDate: '2026-09-05',
      venueName: '18th & Vine',
      sourceUrl: 'https://juneteenthkc.org/first-fridays',
    });
    const resolved = resolveDisplayTitle({ rawTitle: raw, sourceName: 'JuneteenthKC' });
    const after = displayIdentityKey({
      rawTitle: raw,
      eventDate: '2026-09-05',
      venueName: '18th & Vine',
      sourceUrl: 'https://juneteenthkc.org/first-fridays',
    });
    assert.equal(before, after);
    assert.notEqual(resolved.displayTitle, raw);
  });

  it('similar cleaned titles do not cause false deduplication', () => {
    const a = displayIdentityKey({
      rawTitle: 'Night Market | Visit KC',
      eventDate: '2026-09-05',
      venueName: 'Crossroads',
      sourceUrl: 'https://visitkc.com/night-market',
    });
    const b = displayIdentityKey({
      rawTitle: 'Night Market | Crossroads KC',
      eventDate: '2026-09-12',
      venueName: 'West Bottoms',
      sourceUrl: 'https://crossroadskc.org/night-market',
    });
    assert.notEqual(a, b);
    const cleanedA = resolveDisplayTitle({ rawTitle: 'Night Market | Visit KC', sourceName: 'Visit KC' });
    const cleanedB = resolveDisplayTitle({ rawTitle: 'Night Market | Crossroads KC', sourceName: 'Crossroads KC' });
    assert.equal(cleanedA.displayTitle, cleanedB.displayTitle);
  });

  it('preserves acronyms and stylized proper names', () => {
    const kpop = resolveDisplayTitle({ rawTitle: 'KPop Demon Hunters Night' });
    assert.equal(kpop.displayTitle, 'K-Pop Demon Hunters Night');
    const santa = resolveDisplayTitle({ rawTitle: 'SantaCaliGon Days' });
    assert.equal(santa.displayTitle, 'SantaCaliGon Days');
  });

  it('falls back conservatively when evidence is missing', () => {
    const resolved = resolveDisplayTitle({ rawTitle: 'Sign up now!' });
    assert.equal(resolved.verification, 'needs_verification');
    assert.ok(resolved.displayTitle.length > 0);
    assert.doesNotMatch(resolved.displayTitle, /undefined/);
  });

  it('does not replace a news sentence with an unrelated official name', () => {
    const resolved = resolveDisplayTitle({
      rawTitle: 'Tennessee’s Dolly Parton dies at 80 after a life of music and giving',
      officialName: 'Taste of Cincinnati',
      documentTitle: 'Taste of Cincinnati Returns Downtown for Its 46th Year',
    });
    assert.match(resolved.displayTitle, /Dolly Parton/i);
    assert.doesNotMatch(resolved.displayTitle, /Taste of Cincinnati/i);
  });

  it('does not keep a schedule-fragment title from a prior repair', () => {
    const resolved = resolveDisplayTitle({
      rawTitle: 'Craftsman Truck Series Kansas Speedway | Capacity',
      existingDisplayTitle: 'PM Sat Nascar Craftsman Truck Series',
      existingVerification: 'verified',
    });
    assert.match(resolved.displayTitle, /Craftsman Truck Series/i);
    assert.doesNotMatch(resolved.displayTitle, /^PM Sat/i);
  });

  it('keeps a news headline instead of collapsing it to an organization', () => {
    const resolved = resolveDisplayTitle({
      rawTitle: 'Blood pressure cuffs available for check-out through Kansas City Public Library branches',
      officialName: 'Kansas City Public Library',
      businessName: 'Kansas City Public Library',
    });
    assert.match(resolved.displayTitle, /Blood pressure cuffs/i);
    assert.doesNotMatch(resolved.displayTitle, /^Kansas City Public Library$/);
  });

  it('does not replace a tour name with a Ticketmaster SEO heading', () => {
    const resolved = resolveDisplayTitle({
      rawTitle: 'J. Cole: The Fall-Off Tour',
      heading: 'J. Cole Tickets, 2026 Concert Tour Dates | Ticketmaster',
      ogTitle: 'J. Cole Tickets, 2026 Concert Tour Dates | Ticketmaster',
    });
    assert.equal(resolved.displayTitle, 'J. Cole: The Fall-Off Tour');
  });

  it('does not keep a stored title that belongs to a different event', () => {
    const resolved = resolveDisplayTitle({
      rawTitle: 'Dax - The Anger Management Tour',
      existingDisplayTitle: 'Hadestown Tickets - Concert Tour Dates - AXS US',
      officialName: 'Hadestown Tickets - Concert Tour Dates - AXS US',
    });
    assert.match(resolved.displayTitle, /Dax/i);
    assert.doesNotMatch(resolved.displayTitle, /Hadestown/i);
  });

  it('keeps a specific matchup instead of collapsing to the team name', () => {
    const resolved = resolveDisplayTitle({
      rawTitle: 'Sporting Kansas City vs. Vancouver Whitecaps FC - Ted Lasso Night',
      businessName: 'Sporting Kansas City',
      officialName: 'Sporting Kansas City',
    });
    assert.match(resolved.displayTitle, /Ted Lasso Night/i);
    assert.match(resolved.displayTitle, /Vancouver/i);
  });

  it('promotes an artist when the left side is a generic heading', () => {
    const resolved = resolveDisplayTitle({
      rawTitle: 'Shows — The Bowline Brothers',
    });
    assert.equal(resolved.displayTitle, 'The Bowline Brothers');
  });

  it('keeps titles short enough for mobile wrapping and card height', () => {
    const resolved = resolveDisplayTitle({
      rawTitle:
        'AN INCREDIBLY LONG MARKETING HEADLINE ABOUT THE BEST NIGHT OUT YOU WILL EVER HAVE IN KANSAS CITY THIS WEEKEND WITH SPECIAL GUESTS | Visit KC',
      sourceName: 'Visit KC',
    });
    assert.ok(resolved.displayTitle.length <= DISPLAY_TITLE_MAX_CHARS);
    assert.equal(resolved.displayTitle.includes('|'), false);
  });
});
