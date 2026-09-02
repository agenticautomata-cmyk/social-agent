import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  discoverLaneIsCompatible,
  discoverOpportunityKind,
  discoverPrimaryAction,
  discoverSubjectProse,
} from './discover-card.js';

const FUTURE = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

function kindAndCta(input: Parameters<typeof discoverOpportunityKind>[0]) {
  const kind = discoverOpportunityKind(input);
  const primaryAction = discoverPrimaryAction(kind, input);
  return { kind, primaryAction };
}

describe('Discover displayed category authority', () => {
  it('ROCK THE BRIDGE funk night is Nightlife / Event, not Shopping Find', () => {
    const { kind, primaryAction } = kindAndCta({
      title: 'ROCK THE BRIDGE - Old School Funk Night',
      summary:
        'Get ready to groove all night with some classic funk vibes and old school jams that\'ll keep you moving! Web research: there is a recurring event called "Soul Sundays Analog Market," which features vinyl-only DJs, analog beat makers, and vintage vendors.',
      locationName: 'Rock Island Bridge',
      category: 'Music Event',
      eventStartsAt: FUTURE,
      metadata: { opportunityCategory: 'Music Event', ingest: 'ask_benson_link' },
    });
    assert.equal(kind, 'Nightlife / Event');
    assert.notEqual(kind, 'Shopping Find');
    assert.equal(primaryAction.label, 'Post now');
    assert.equal(discoverLaneIsCompatible(kind, primaryAction), true);
  });

  it('web-research Analog Market text is ignored for classification', () => {
    assert.equal(
      discoverSubjectProse(
        'Groove all night. Web research: Soul Sundays Analog Market with vintage vendors.',
      ),
      'Groove all night.',
    );
  });

  it('stale raw Shopping Find label cannot override funk-night title evidence', () => {
    const { kind, primaryAction } = kindAndCta({
      title: 'ROCK THE BRIDGE - Old School Funk Night',
      summary: 'Classic funk vibes and old school jams.',
      locationName: 'Rock Island Bridge',
      category: 'Shopping Find',
      eventStartsAt: FUTURE,
      metadata: { opportunityCategory: 'Shopping Find', ingest: 'scrape_listing' },
    });
    assert.equal(kind, 'Nightlife / Event');
    assert.equal(primaryAction.label, 'Post now');
    assert.equal(discoverLaneIsCompatible(kind, primaryAction), true);
  });

  it('Rock Island Bridge recurring live music is Live Music with Things To Do CTA', () => {
    const { kind, primaryAction } = kindAndCta({
      title: 'Rock Island Bridge',
      summary:
        'Free live music every Wednesday, Friday, and Saturday on the Rock Island Bridge — rotating KC artists spanning indie, rock, soul, country, jazz, and more.',
      locationName: 'Rock Island Bridge, 1799 American Royal Drive, Kansas City, Missouri 64106',
      category: 'Music Event',
      eventStartsAt: FUTURE,
    });
    assert.equal(kind, 'Live Music');
    assert.equal(primaryAction.label, 'Post now');
    assert.equal(discoverLaneIsCompatible(kind, primaryAction), true);
  });

  it('Garden Bros Nuclear Circus is Event, not Shopping Find', () => {
    const { kind, primaryAction } = kindAndCta({
      title: 'Garden Bros Nuclear Circus',
      summary: 'Find family shows in Kansas City.',
      locationName: 'Independence, MO',
      category: 'CIRCUS',
      eventStartsAt: FUTURE,
    });
    assert.equal(kind, 'Event');
    assert.notEqual(kind, 'Shopping Find');
    assert.equal(primaryAction.label, 'Post now');
    assert.equal(discoverLaneIsCompatible(kind, primaryAction), true);
  });

  it('Brass & Boujee Halloween at a brewery stays Things To Do / event-compatible', () => {
    const { kind, primaryAction } = kindAndCta({
      title: 'Brass & Boujee Halloween Event at Vine Street Brewing',
      summary: 'Brass & Boujee Halloween is up!',
      locationName: 'Kansas City, United States',
      category: 'Event',
      eventStartsAt: FUTURE,
    });
    assert.ok(kind === 'Things To Do' || kind === 'Nightlife / Event' || kind === 'Event');
    assert.notEqual(kind, 'Shopping Find');
    assert.equal(primaryAction.label, 'Post now');
    assert.equal(discoverLaneIsCompatible(kind, primaryAction), true);
  });

  it('event title cannot render as Shopping Find without retail evidence', () => {
    const kind = discoverOpportunityKind({
      title: 'Westport DJ night at The Record Bar',
      summary: 'A night of records and dancing in Kansas City.',
      locationName: 'Westport',
      category: 'retail',
      eventStartsAt: FUTURE,
    });
    assert.notEqual(kind, 'Shopping Find');
  });

  it('real retail markdown remains Shopping Find', () => {
    const { kind, primaryAction } = kindAndCta({
      title: "Plato's Closet Overland Park 50% off markdown",
      summary: 'Clearance racks and name-brand consignment restock.',
      locationName: 'Overland Park',
      category: 'Shopping Find',
      eventStartsAt: FUTURE,
    });
    assert.equal(kind, 'Shopping Find');
    assert.equal(primaryAction.label, 'Post now');
    assert.equal(discoverLaneIsCompatible(kind, primaryAction), true);
  });

  it('restaurant tasting is Food & Drink, not Shopping Find', () => {
    const kind = discoverOpportunityKind({
      title: 'Summer menu tasting dinner',
      summary: 'Chef tasting menu and dinner in Kansas City.',
      category: 'Food & Drink',
      eventStartsAt: FUTURE,
    });
    assert.equal(kind, 'Food & Drink');
  });
});
