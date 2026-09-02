import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canonicalizeDiscoverSourceUrl,
  collapseDiscoverFeedItems,
  discoverSourcePathKey,
  discoverIdentitiesMatch,
  discoverOpportunityKey,
  discoverSeriesKey,
  isDiscoverHubUrl,
} from './discover-identity.js';
import {
  discoverPitchReadiness,
  discoverPrimaryActionForState,
  discoverRecommendationState,
  evaluateDiscoverTrust,
  isImplausibleDiscoverDate,
  isTradeConference,
  looksLikeRawScraperText,
} from './discover-trust.js';
import { computeSkipMatchIdentity } from '../creator-skip/fingerprint.js';
import { discoverLaneIsCompatible, discoverPrimaryAction } from './discover-card.js';

const NOW = new Date('2026-09-02T18:00:00.000Z');
const THIS_WEEK = new Date('2026-09-06T22:00:00.000Z');
const NEXT_MONTH = new Date('2026-10-15T22:00:00.000Z');
const NEXT_YEAR = new Date('2027-07-01T03:30:00.000Z');

describe('discover identity', () => {
  it('cross-source duplicates share a key via canonical URL, not title', () => {
    const a = discoverOpportunityKey({
      id: '1',
      title: 'Don Felder Concert',
      eventStartsAt: '2026-09-11T00:00:00.000Z',
      locationName: 'Kansas City, MO',
      sourceUrl: 'https://www.eventbrite.com/e/don-felder-tickets-12345678901?utm_source=openai',
    });
    const b = discoverOpportunityKey({
      id: '2',
      title: 'Don Felder LIVE at Ameristar',
      eventStartsAt: '2026-09-11T00:00:00.000Z',
      locationName: 'Kansas City, MO',
      sourceUrl: 'https://www.eventbrite.com/e/don-felder-tickets-12345678901?fbclid=abc',
    });
    assert.equal(a, b);
    assert.match(a, /^eb:12345678901$/);
    assert.equal(
      canonicalizeDiscoverSourceUrl('https://KCConvention.com/event/gala/?utm_source=openai#top'),
      'https://kcconvention.com/event/gala',
    );
    assert.equal(
      canonicalizeDiscoverSourceUrl('https://www.fotzkc.org/brew?utm_source=openai'),
      canonicalizeDiscoverSourceUrl('https://www.fotzkc.org/brew?fbclid=abc'),
    );
    assert.notEqual(
      canonicalizeDiscoverSourceUrl('https://www.fotzkc.org/events?id=1'),
      canonicalizeDiscoverSourceUrl('https://www.fotzkc.org/events?id=2'),
    );
  });

  it('near-duplicate false positives stay separate when only the title is vague', () => {
    const friday = {
      id: 'a',
      title: 'Live music',
      eventStartsAt: '2026-09-12T20:00:00.000Z',
      locationName: 'The Ship, Kansas City',
      sourceUrl: 'https://example.com/ship',
    };
    const saturday = {
      id: 'b',
      title: 'Live music',
      eventStartsAt: '2026-09-13T20:00:00.000Z',
      locationName: 'Lemonade Park, Kansas City',
      sourceUrl: 'https://example.com/lemonade',
    };
    assert.equal(discoverIdentitiesMatch(friday, saturday), false);
    assert.notEqual(discoverOpportunityKey(friday), discoverOpportunityKey(saturday));
    assert.equal(discoverSeriesKey({ title: 'Royals', locationName: 'Kansas City' }), null);
  });

  it('listing hub URLs are not treated as a unique event identity', () => {
    assert.equal(isDiscoverHubUrl('https://kansascity.events/concerts/july?utm_source=openai'), true);
    assert.equal(isDiscoverHubUrl('https://www.cmfkc.com/'), true);
    assert.equal(isDiscoverHubUrl('https://kcconvention.com/event/hot103jamz-21st-white-linen-party/'), false);
    const hubA = {
      id: '1',
      title: 'Rock Island Bridge Evening Concerts',
      eventStartsAt: '2026-09-12T16:00:00.000Z',
      locationName: 'Rock Island Bridge, Kansas City',
      sourceUrl: 'https://www.cmfkc.com/',
    };
    const hubB = {
      id: '2',
      title: 'The Campground Concerts',
      eventStartsAt: '2026-09-12T15:00:00.000Z',
      locationName: 'The Campground, Kansas City',
      sourceUrl: 'https://www.cmfkc.com/',
    };
    const collapsed = collapseDiscoverFeedItems([hubA, hubB]);
    assert.equal(collapsed.length, 1);
    assert.equal(collapsed[0]?.id, '2');
  });
});

describe('discover trust and recommendation state', () => {
  it('stale or implausible dates are suppressed', () => {
    assert.equal(
      isImplausibleDiscoverDate(
        NEXT_YEAR,
        NOW,
        'Discover the Ultimate Guide to Kansas City’s Concert Scene this month.',
      ),
      true,
    );
    const trust = evaluateDiscoverTrust(
      {
        title: 'Kansas City Royals',
        summary: 'Discover the Ultimate Guide to Kansas City’s Concert Scene this month.',
        locationName: 'Kauffman Stadium',
        sourceUrl: 'https://kansascity.events/concerts/july?utm_source=openai',
        eventStartsAt: NEXT_YEAR,
      },
      'Live Music',
      'Kauffman Stadium · Wed, Jun 30',
      NOW,
    );
    assert.equal(trust.visible, false);
    assert.equal(trust.hideReason, 'stale_or_implausible_date');
  });

  it('recurring-event skip identity is occurrence-specific', () => {
    const wed = computeSkipMatchIdentity({
      title: 'Free live music on the Rock Island Bridge',
      eventDate: '2026-09-03T00:00:00.000Z',
      locationName: 'Kansas City, MO',
    });
    const nextWed = computeSkipMatchIdentity({
      title: 'Free live music on the Rock Island Bridge',
      eventDate: '2026-09-10T00:00:00.000Z',
      locationName: 'Kansas City, MO',
    });
    assert.ok(wed && nextWed);
    assert.notEqual(wed.key, nextWed.key);
  });

  it('honest Pitch vs Contact needed', () => {
    const thin = discoverPitchReadiness({
      title: 'Neighborhood boutique partnership',
      metadata: { opportunityCategory: 'Sponsor Lead' },
    });
    assert.equal(thin.pitchReady, false);
    assert.equal(thin.label, 'Contact needed');
    const action = discoverPrimaryActionForState('Sponsor Lead', { title: 'Neighborhood boutique partnership' }, NOW);
    assert.equal(action.key, 'pitch');
    assert.equal(action.label, 'Contact needed');
    assert.equal(action.label.includes('Pitch ready'), false);
  });

  it('exactly one primary action per visible recommendation', () => {
    const timely = discoverRecommendationState(
      'Things To Do',
      { title: 'White Linen Party', eventStartsAt: THIS_WEEK, locationName: 'Kansas City' },
      NOW,
    );
    const later = discoverRecommendationState(
      'Things To Do',
      { title: 'Vintage expo', eventStartsAt: NEXT_MONTH, locationName: 'Kansas City' },
      NOW,
    );
    const pitch = discoverRecommendationState('Creator Program', { title: 'National UGC program' }, NOW);
    assert.equal(timely, 'post_now');
    assert.equal(later, 'save');
    assert.equal(pitch, 'pitch');
    const keys = [timely, later, pitch];
    assert.ok(keys.every((key) => key === 'post_now' || key === 'pitch' || key === 'save' || key === 'skip'));
    const post = discoverPrimaryAction('Nightlife / Event', {
      title: 'HOT 103 Jamz White Linen Party',
      eventStartsAt: THIS_WEEK,
      locationName: 'Kansas City',
    }, NOW);
    assert.equal(post.key, 'post_now');
    assert.equal(discoverLaneIsCompatible('Nightlife / Event', post), true);
  });

  it('raw scraper text and trade conferences are not dressed up', () => {
    assert.equal(looksLikeRawScraperText('* 🍻 **Drink Local'), true);
    assert.equal(looksLikeRawScraperText('_[SantaCaliGon Days]( takes over Historic Independence Square'), true);
    assert.equal(isTradeConference('AREMA 2026 Annual Conference & Exposition - Kansas City Convention Center'), true);
    assert.equal(isTradeConference('Jamf JNUC 2026 - Kansas City Convention Center'), true);
    const raw = evaluateDiscoverTrust(
      { title: '* **Come One', locationName: 'Independence, MO', eventStartsAt: THIS_WEEK },
      'Things To Do',
      'Independence, MO · Thu, Sep 3',
      NOW,
    );
    assert.equal(raw.visible, false);
    assert.equal(raw.hideReason, 'raw_scraper_text');
    const hours = evaluateDiscoverTrust(
      { title: 'Operational Hours', sourceUrl: 'https://igckc.com/?utm_source=openai' },
      'Things To Do',
      'Kansas City',
      NOW,
    );
    assert.equal(hours.visible, false);
    const hyvee = evaluateDiscoverTrust(
      {
        title: 'Hy-Vee Daily Deals Duration',
        sourceUrl: 'https://www.hy-vee.com/corporate/news-events/promotions/2026-hyvee-daily-deals',
        eventStartsAt: NEXT_MONTH,
      },
      'Things To Do',
      'Kansas City · Tue, Sep 29',
      NOW,
    );
    assert.equal(hyvee.visible, false);
    const juneteenth = evaluateDiscoverTrust(
      { title: 'Juneteenth Celebration', sourceUrl: 'https://www.prairiefireop.com/happenings/juneteenth-op' },
      'Things To Do',
      null,
      NOW,
    );
    assert.equal(juneteenth.visible, false);
    assert.equal(juneteenth.hideReason, 'stale_or_implausible_date');
    const hubSku = evaluateDiscoverTrust(
      {
        title: 'Birthday Party Package - Supersized',
        summary: 'Discover Bubbles&Goo, the ultimate Children Museum in Kansas City.',
        sourceUrl: 'https://www.bubblesandgoo.com/?utm_source=openai',
      },
      'Things To Do',
      'Kansas City',
      NOW,
    );
    assert.equal(hubSku.visible, false);
    assert.equal(hubSku.hideReason, 'hub_listing_without_entity');
    const datedHubChild = evaluateDiscoverTrust(
      {
        title: 'Come From Away',
        summary: 'Come From Away plays Spencer Theatre at Kansas City Repertory Theatre.',
        sourceUrl: 'https://kansascity.events/family-shows?utm_source=openai',
        eventStartsAt: THIS_WEEK,
        locationName: 'Spencer Theatre',
      },
      'Things To Do',
      'Spencer Theatre · Sun, Sep 6',
      NOW,
    );
    assert.equal(datedHubChild.visible, true);
  });

  it('useful source attribution stays on the card model inputs', () => {
    const trust = evaluateDiscoverTrust(
      {
        title: 'The 21st HOT 103 Jamz White Linen Party',
        summary: 'KPRS HOT 103 Jamz brings the White Linen Party to Municipal Auditorium.',
        locationName: 'Kansas City',
        sourceUrl: 'https://kcconvention.com/event/hot103jamz-21st-white-linen-party/',
        eventStartsAt: THIS_WEEK,
      },
      'Things To Do',
      'Kansas City · Sun, Sep 6',
      NOW,
    );
    assert.equal(trust.visible, true);
    assert.match(trust.whyItMatters ?? '', /White Linen Party|Municipal Auditorium/i);
    assert.doesNotMatch(trust.whyItMatters ?? '', /strong social media potential/i);
    assert.equal(trust.trustLabel, 'Listing looks current');
  });

  it('title/summary mismatch from mixed research dumps is hidden', () => {
    const trust = evaluateDiscoverTrust(
      {
        title: 'Kansas City Symphony - Orchestra Event Tickets',
        summary: '## [Cleo Club](https://maps.google.com) Cleo Club is a sultry speakeasy',
        locationName: 'Kansas City',
        sourceUrl: 'https://www.kcsymphony.org/?utm_source=openai',
        eventStartsAt: NEXT_MONTH,
      },
      'Food & Drink',
      'Kansas City · Tue, Sep 29',
      NOW,
    );
    assert.equal(trust.visible, false);
    assert.equal(trust.hideReason, 'title_summary_mismatch');
  });
});
