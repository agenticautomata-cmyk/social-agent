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
  hasPostNowSourceEvidence,
  isFragmentaryDiscoverTitle,
  isPlaceOnlyDiscoverTitle,
  isUndatedVenueOnlyListing,
  isSeoLeftoverDiscover,
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
      {
        title: 'White Linen Party',
        eventStartsAt: THIS_WEEK,
        locationName: 'Kansas City',
        sourceUrl: 'https://kcconvention.com/event/hot103jamz-21st-white-linen-party/',
      },
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
      sourceUrl: 'https://kcconvention.com/event/hot103jamz-21st-white-linen-party/',
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

  it('fragmentary newsletter headings and place-only titles are hidden', () => {
    assert.equal(isFragmentaryDiscoverTitle('Caption: KC Daily'), true);
    assert.equal(isFragmentaryDiscoverTitle('Participating Vendors'), true);
    assert.equal(isFragmentaryDiscoverTitle('Tuesday and Wednesday Lunch'), true);
    assert.equal(isFragmentaryDiscoverTitle('Grad Party'), true);
    assert.equal(isFragmentaryDiscoverTitle('Catering and Small Events'), true);
    assert.equal(isFragmentaryDiscoverTitle('Participating Vendor: Luxxe Apparel'), true);
    assert.equal(isFragmentaryDiscoverTitle('Visit The Cleo Club'), true);
    assert.equal(isFragmentaryDiscoverTitle('Stop scrolling go outside'), true);
    assert.equal(isFragmentaryDiscoverTitle('Donation Center - Big Brothers Big Sisters'), true);
    assert.equal(isFragmentaryDiscoverTitle('Special Events'), true);
    assert.equal(isFragmentaryDiscoverTitle('Community Experiences'), true);
    assert.equal(isFragmentaryDiscoverTitle('Our Events'), true);
    assert.equal(isFragmentaryDiscoverTitle('Events Calendar'), true);
    assert.equal(isFragmentaryDiscoverTitle('Artist Activations'), true);
    assert.equal(isFragmentaryDiscoverTitle('A Taste of Leawood'), false);
    assert.equal(isUndatedVenueOnlyListing('Savers Thrift Store'), true);
    assert.equal(isUndatedVenueOnlyListing('Nelson-Atkins Museum of Art'), true);
    assert.equal(isUndatedVenueOnlyListing('The Cleo Club'), true);
    assert.equal(isUndatedVenueOnlyListing('The Cleo Club', THIS_WEEK), false);
    assert.equal(isUndatedVenueOnlyListing('Sip & Paint Bachelorette Party'), false);
    assert.equal(isUndatedVenueOnlyListing('Arts and Craft Workshops'), false);
    assert.equal(isPlaceOnlyDiscoverTitle('Leawood City Hall'), true);
    assert.equal(isPlaceOnlyDiscoverTitle('Leawood City Park'), true);
    assert.equal(isPlaceOnlyDiscoverTitle('Park Place Leawood'), true);
    assert.equal(isPlaceOnlyDiscoverTitle('Park Place Holiday Market'), false);
    for (const title of [
      'Caption: KC Daily',
      'Participating Vendors',
      'Tuesday and Wednesday Lunch',
      'Leawood City Hall',
    ]) {
      const trust = evaluateDiscoverTrust({ title, locationName: 'Kansas City', eventStartsAt: THIS_WEEK }, 'Things To Do', 'Kansas City · Sun, Sep 6', NOW);
      assert.equal(trust.visible, false, title);
    }
    const club = evaluateDiscoverTrust(
      { title: 'Earn Style Points', sourceUrl: 'https://overlandparkks.clothesmentor.com/pages/club-cm' },
      'Things To Do',
      'Overland Park, KS',
      NOW,
    );
    assert.equal(club.visible, false);
    const taste = evaluateDiscoverTrust(
      {
        title: 'A Taste of Leawood',
        locationName: 'Kansas City',
        eventStartsAt: THIS_WEEK,
        sourceUrl: 'https://leawood.org/taste',
      },
      'Things To Do',
      'Kansas City · Sun, Sep 6',
      NOW,
    );
    assert.equal(taste.visible, true);
    for (const title of [
      'Special Events',
      'Community Experiences',
      'Savers Thrift Store',
      'Nelson-Atkins Museum of Art',
      'The Cleo Club',
    ]) {
      const hidden = evaluateDiscoverTrust(
        { title, locationName: 'Kansas City', sourceUrl: 'https://example.com/place' },
        'Things To Do',
        'Kansas City',
        NOW,
      );
      assert.equal(hidden.visible, false, title);
    }
    const birthdayPerks = evaluateDiscoverTrust(
      {
        title: 'Birthday Perks - Exclusive Discount',
        sourceUrl: 'https://overlandparkks.clothesmentor.com/pages/club-cm?utm_source=openai',
      },
      'Things To Do',
      'Overland Park, KS',
      NOW,
    );
    assert.equal(birthdayPerks.visible, false);
    const datedClub = evaluateDiscoverTrust(
      {
        title: 'The Cleo Club Jazz Night',
        summary: 'Live jazz at The Cleo Club this Friday.',
        locationName: 'Kansas City',
        sourceUrl: 'https://example.com/cleo-jazz',
        eventStartsAt: THIS_WEEK,
      },
      'Food & Drink',
      'Kansas City · Sun, Sep 6',
      NOW,
    );
    assert.equal(datedClub.visible, true);
  });

  it('SEO leftovers and official-site boilerplate are hidden', () => {
    assert.equal(
      isSeoLeftoverDiscover(
        'Mecum Auto Auction Kansas City Results at Lois Horning blog',
        'https://storage.googleapis.com/dkfqgfjkqndqxe/mecum-auto-auction-kansas-city-results.html',
      ),
      true,
    );
    assert.equal(
      isSeoLeftoverDiscover('Kansas City Farmers Market', 'https://www.kccommercialrealty.com/property/city-market'),
      true,
    );
    assert.equal(
      isSeoLeftoverDiscover('Kansas City Hotel Offers & Deals | Crossroads Hotel', 'https://crossroadshotelkc.com/offers'),
      true,
    );
    const mecum = evaluateDiscoverTrust(
      {
        title: 'Mecum Auto Auction Kansas City Results at Lois Horning blog',
        sourceUrl: 'https://storage.googleapis.com/dkfqgfjkqndqxe/mecum.html',
        locationName: 'Kansas City',
      },
      'Things To Do',
      'Kansas City',
      NOW,
    );
    assert.equal(mecum.visible, false);
    assert.equal(mecum.hideReason, 'seo_leftover');
    const official = evaluateDiscoverTrust(
      {
        title: 'Sporting Kansas City II vs. Whitecaps FC 2',
        summary: 'Official site for Sporting Kansas City, with news, photos, highlights, tickets, roster, schedule, and more.',
        sourceUrl: 'https://www.sportingkc.com/?utm_source=openai',
        eventStartsAt: THIS_WEEK,
        locationName: 'TBD',
      },
      'Things To Do',
      'TBD · Sun, Sep 6',
      NOW,
    );
    assert.equal(official.visible, false);
  });

  it('Post now requires a real source URL; title-only dated fragments stay Save', () => {
    assert.equal(
      hasPostNowSourceEvidence({ title: 'A Taste of Leawood', eventStartsAt: THIS_WEEK }),
      false,
    );
    const titleOnly = discoverRecommendationState(
      'Things To Do',
      { title: 'A Taste of Leawood', eventStartsAt: THIS_WEEK, locationName: 'Kansas City' },
      NOW,
    );
    assert.equal(titleOnly, 'save');
    const sourced = discoverRecommendationState(
      'Things To Do',
      {
        title: 'A Taste of Leawood',
        eventStartsAt: THIS_WEEK,
        locationName: 'Kansas City',
        sourceUrl: 'https://leawood.org/taste-of-leawood',
      },
      NOW,
    );
    assert.equal(sourced, 'post_now');
    const place = discoverRecommendationState(
      'Things To Do',
      {
        title: 'Park Place Leawood',
        eventStartsAt: THIS_WEEK,
        sourceUrl: 'https://example.com/park-place',
      },
      NOW,
    );
    assert.equal(place, 'save');
    const merch = discoverRecommendationState(
      'Shopping Find',
      {
        title: 'Limited Edition 2026 CMF Tee',
        eventStartsAt: THIS_WEEK,
        sourceUrl: 'https://www.cmfkc.com/tee',
      },
      NOW,
    );
    assert.equal(merch, 'save');
    const homepageMerch = discoverRecommendationState(
      'Things To Do',
      {
        title: 'Limited Edition 2026 CMF Tee',
        eventStartsAt: THIS_WEEK,
        sourceUrl: 'https://www.cmfkc.com/',
      },
      NOW,
    );
    assert.equal(homepageMerch, 'save');
    const warehouse = discoverRecommendationState(
      'Shopping Find',
      {
        title: 'In Person West Bottoms Warehouse Sale',
        eventStartsAt: THIS_WEEK,
        sourceUrl: 'https://www.estatesales.net/MO/Kansas-City/64105/5057967',
      },
      NOW,
    );
    assert.equal(warehouse, 'post_now');
  });
});
