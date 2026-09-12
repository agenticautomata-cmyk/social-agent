import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectSubmittedUrl } from './url-inspect.js';
import {
  detectDostuffCapability,
  dostuffJsonUrlFor,
  extractDostuffEventsFromHtml,
  extractDostuffEventsFromJson,
  isDostuffWatchUrl,
  stripDostuffTrackingParams,
  unwrapAffiliateTicketUrl,
} from './dostuff-extract.js';
import {
  detectMeetupCapability,
  extractMeetupEventsFromHtml,
  isMeetupWatchUrl,
  meetupCollectionHintsFromUrl,
  scoreMeetupRelevance,
} from './meetup-extract.js';
import { isDirectoryWatchSource } from '../curator-watchlist/watchlist-state.js';

const here = dirname(fileURLToPath(import.meta.url));
const dostuffHtml = readFileSync(join(here, 'fixtures/dostuff-blackeventsinkc.fixture.html'), 'utf8');
const dostuffJsonText = readFileSync(join(here, 'fixtures/dostuff-blackeventsinkc.fixture.json'), 'utf8');
const dostuffEmpty = readFileSync(join(here, 'fixtures/dostuff-empty-listing.fixture.html'), 'utf8');
const meetupHtml = readFileSync(join(here, 'fixtures/meetup-kc-african-american.fixture.html'), 'utf8');
const meetupBlocked = readFileSync(join(here, 'fixtures/meetup-blocked.fixture.html'), 'utf8');

describe('DoStuff / Do816 extraction', () => {
  it('classifies do816 curated paths as dostuff_events', () => {
    const url = 'https://do816.com/blackeventsinkc';
    assert.equal(isDostuffWatchUrl(url), true);
    assert.equal(dostuffJsonUrlFor(url), 'https://do816.com/blackeventsinkc.json');
    const inspect = inspectSubmittedUrl(url);
    assert.equal(inspect.sourceType, 'event_directory');
    assert.equal(inspect.extractionMethod, 'dostuff_events');
    assert.equal(inspect.canonicalUrl, url);
    assert.equal(
      isDirectoryWatchSource({
        adapterType: 'dostuff_events',
        extractionMethod: 'dostuff_events',
        sourceUrl: url,
        sourceCategory: 'event_directory',
      }),
      true,
    );
  });

  it('extracts public JSON payload with title/date/venue/canonical link', () => {
    const pageUrl = 'https://do816.com/blackeventsinkc';
    const extracted = extractDostuffEventsFromJson(dostuffJsonText, pageUrl);
    assert.equal(extracted.method, 'dostuff_json');
    assert.ok(extracted.events.length >= 6);
    const dax = extracted.events.find((e) => /dax/i.test(e.title));
    assert.ok(dax);
    assert.equal(dax!.verificationState, 'verified');
    assert.equal(dax!.startDate, '2026-09-17');
    assert.match(dax!.venue ?? '', /Truman/i);
    assert.match(dax!.eventUrl, /do816\.com\/events\/2026\/9\/17\/dax-tickets/);
  });

  it('SSR HTML fallback extracts microdata cards', () => {
    const pageUrl = 'https://do816.com/blackeventsinkc';
    const capability = detectDostuffCapability(dostuffHtml, pageUrl);
    assert.equal(capability.looksLikeDostuffListing, true);
    assert.equal(capability.hasEventCards, true);
    const extracted = extractDostuffEventsFromHtml(dostuffHtml, pageUrl);
    assert.ok(['dostuff_ssr_cards', 'dostuff_html'].includes(extracted.method));
    assert.ok(extracted.events.length >= 6);
    const dax = extracted.events.find((e) => /dax/i.test(e.title));
    assert.ok(dax);
    assert.equal(dax!.startDate, '2026-09-17');
  });

  it('empty listing chrome is empty_listing, not incomplete shell', () => {
    const extracted = extractDostuffEventsFromHtml(dostuffEmpty, 'https://do816.com/blackeventsinkc');
    assert.equal(extracted.events.length, 0);
    assert.equal(extracted.pagination.emptyListing, true);
    assert.equal(extracted.pagination.incompleteRender, false);
    assert.ok(extracted.rejectionReasons.includes('empty_dostuff_listing'));
  });

  it('strips tracking params and unwraps affiliate ticket hops', () => {
    const cleaned = stripDostuffTrackingParams(
      'https://www.axs.com/events/1451113/dax-tickets?skin=trumankc&cid=usaffdostuff&utm_source=do816',
    );
    assert.equal(cleaned.includes('utm_source'), false);
    assert.equal(cleaned.includes('cid='), false);
    const unwrapped = unwrapAffiliateTicketUrl(
      'https://ticketmaster.evyy.net/c/253185/264167/4272?SharedId=DoStuff&u=https%3A%2F%2Fwww.ticketmaster.com%2Fthe-temptations-kansas-city-missouri-10-02-2026%2Fevent%2F06006430ED2F50E1',
    );
    assert.match(unwrapped ?? '', /ticketmaster\.com\/the-temptations/);
  });
});

describe('Meetup directory extraction', () => {
  it('classifies Meetup find URLs as meetup_directory', () => {
    const url = 'https://www.meetup.com/find/us--mo--kansas-city/african-american/';
    assert.equal(isMeetupWatchUrl(url), true);
    const inspect = inspectSubmittedUrl(url);
    assert.equal(inspect.extractionMethod, 'meetup_directory');
    assert.equal(inspect.sourceType, 'event_directory');
  });

  it('extracts Apollo SSR events with organizer, location, attendance, canonical link', () => {
    const pageUrl = 'https://www.meetup.com/find/us--mo--kansas-city/african-american/';
    const capability = detectMeetupCapability(meetupHtml, pageUrl);
    assert.equal(capability.hasApolloState, true);
    const extracted = extractMeetupEventsFromHtml(meetupHtml, pageUrl);
    assert.equal(extracted.method, 'meetup_apollo_ssr');
    assert.ok(extracted.events.length >= 1);
    assert.equal(extracted.pagination.furtherPagesNotFetched, extracted.pagination.hasNextPage);

    const book = extracted.events.find((e) => /Water Dancer/i.test(e.title));
    assert.ok(book);
    assert.equal(book!.verificationState, 'verified');
    assert.match(book!.organizer ?? '', /African American Literature/i);
    assert.match(book!.venue ?? '', /Vine Street/i);
    assert.match(book!.eventUrl, /meetup\.com\/.*\/events\/316308435/);
    assert.equal(book!.attendanceCount, 5);
    assert.equal(book!.relevance, 'verified_relevant');
    assert.equal(book!.needsReview, false);
  });

  it('relevance comes from content, never collection URL alone', () => {
    const hints = meetupCollectionHintsFromUrl(
      'https://www.meetup.com/find/us--mo--kansas-city/african-american/',
    );
    assert.ok(hints.some((h) => /african american/i.test(h)));

    const collectionOnly = scoreMeetupRelevance({
      title: 'Generic Networking Mixer',
      description: 'Come meet people downtown.',
      organizer: 'KC Professionals',
      venue: 'WeWork',
      collectionHints: hints,
    });
    assert.equal(collectionOnly.relevance, 'possibly_relevant');
    assert.equal(collectionOnly.needsReview, true);

    const strong = scoreMeetupRelevance({
      title: 'Juneteenth Community Picnic',
      description: 'Celebrate with neighbors.',
      organizer: '18th & Vine Cultural Society',
      venue: '18th and Vine',
      collectionHints: hints,
    });
    assert.equal(strong.relevance, 'verified_relevant');

    const offtopic = scoreMeetupRelevance({
      title: 'KC Microsoft Fabric & Power BI User Group',
      description: 'Learn Fabric lakehouses.',
      organizer: 'KC Microsoft Fabric UG',
      venue: 'Microsoft Office',
      collectionHints: hints,
    });
    assert.equal(offtopic.relevance, 'not_relevant');
  });

  it('blocked challenge HTML yields no events', () => {
    const extracted = extractMeetupEventsFromHtml(meetupBlocked, 'https://www.meetup.com/find/');
    assert.equal(extracted.events.length, 0);
    assert.equal(extracted.method, 'none');
  });
});
