import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  decodeCloudflareEmail,
  deobfuscateEmails,
  extractCrossroadsEvents,
  extractLabelledContacts,
  extractTribeEvents,
  htmlToText,
  resolvePublishedDate,
  upcomingEvents,
} from './extract.js';

/**
 * Markup copied from the live pages on 2026-09-03, trimmed to the parts that matter.
 * The `data-cfemail` values are the real ones Crossroads publishes.
 */
const CROSSROADS_CONTACT_HTML = `
<div class="contact">
  <p>Email</p>
  <p>Media <a href="/cdn-cgi/l/email-protection#543931303d351437263b2727263b3530273c3b2031383f377a373b39"><span class="__cf_email__" data-cfemail="046961606d654467766b7777766b6560776c6b7061686f672a676b69">[email&#160;protected]</span></a></p>
  <p>Sales <a href="#"><span class="__cf_email__" data-cfemail="acdfcdc0c9dfeccfdec3dfdfdec3cdc8dfc4c3d8c9c0c7cf82cfc3c1">[email&#160;protected]</span></a></p>
  <p>House Keeping <a href="#"><span class="__cf_email__" data-cfemail="234b4c565046484646534a4d446340514c5050514c4247504b4c57464f48400d404c4e">[email&#160;protected]</span></a></p>
  <p>Call (816)-897-8100</p>
  <p>Email: <a href="#"><span class="__cf_email__" data-cfemail="0861666e67486b7a677b7b7a67696c7b60677c6d64636b266b6765">[email&#160;protected]</span></a></p>
</div>
`;

const CROSSROADS_EVENTS_HTML = `
<div class="events-archive--grid">
<article class='event-card' data-category='crossroads'>
  <div class='event-card--body'>
    <div class='title'><span class='event-category'>Crossroads</span><h3 class='h3'>Haus of Rhythm</h3></div>
    <div class='details'>
      <div class='dates'><p><b>Date: </b>Sept 4th</p><time><b>Time: </b>7:00pm-11:00pm</time></div>
      <p class='event-excerpt'>Every Friday the Percheron rooftop transforms into Haus of Rhythm making for one of KC&rsquo;s hottest stop for good music and top-notch drinks.</p>
      <div class='button-wrapper'><a class='theme-button border primary' href='https://crossroadshotelkc.com/events/haus-of-rhythm-2/'>Details</a></div>
    </div>
  </div>
</article>
<article class='event-card' data-category='crossroads'>
  <div class='event-card--body'>
    <div class='title'><span class='event-category'>Crossroads</span><h3 class='h3'>Second Company Showcase</h3></div>
    <div class='details'>
      <div class='dates'><p><b>Date: </b>Sept 5th</p><time><b>Time: </b>6:30PM</time></div>
      <p class='event-excerpt'>Kansas City Ballet&rsquo;s Second Company is back in the stunning Crossroads Hotel, bringing contemporary ballet to the heart of the city with a performance free to the public.</p>
      <div class='button-wrapper'><a class='theme-button border primary' href='https://crossroadshotelkc.com/events/second-company-showcase/'>Details</a></div>
    </div>
  </div>
</article>
</div>
`;

describe('Cloudflare email de-obfuscation', () => {
  it('decodes the real media address Crossroads publishes', () => {
    assert.equal(
      decodeCloudflareEmail('046961606d654467766b7777766b6560776c6b7061686f672a676b69'),
      'media@crossroadshotelkc.com',
    );
  });

  it('rejects garbage rather than returning a broken address', () => {
    assert.equal(decodeCloudflareEmail('zz'), null);
    assert.equal(decodeCloudflareEmail(''), null);
    assert.equal(decodeCloudflareEmail('0469'), null);
  });

  it('replaces obfuscated spans so the address appears in the page text', () => {
    const text = htmlToText(deobfuscateEmails(CROSSROADS_CONTACT_HTML));
    assert.ok(text.includes('media@crossroadshotelkc.com'));
    assert.ok(!text.includes('[email protected]'));
  });
});

describe('labelled contact extraction', () => {
  const contacts = extractLabelledContacts(CROSSROADS_CONTACT_HTML);

  it('finds the media inbox and keeps the published label', () => {
    const media = contacts.find((c) => c.email === 'media@crossroadshotelkc.com');
    assert.ok(media, 'the media inbox must be found despite the obfuscation');
    assert.equal(media.label, 'media');
  });

  it('does not mistake housekeeping or sales for a partnerships contact', () => {
    assert.equal(
      contacts.find((c) => c.email === 'housekeeping@crossroadshotelkc.com')?.label,
      'house keeping',
    );
    assert.equal(contacts.find((c) => c.email === 'sales@crossroadshotelkc.com')?.label, 'sales');
  });

  it('finds every published address exactly once', () => {
    assert.equal(contacts.length, 4);
    assert.equal(new Set(contacts.map((c) => c.email)).size, 4);
  });
});

describe('Crossroads event extraction', () => {
  const now = new Date('2026-09-03T05:00:00Z');
  const events = extractCrossroadsEvents(CROSSROADS_EVENTS_HTML, now);

  it('extracts each event card with its published date and time', () => {
    assert.equal(events.length, 2);
    const ballet = events.find((e) => e.title === 'Second Company Showcase');
    assert.ok(ballet);
    assert.equal(ballet.dateText, 'Sept 5th');
    assert.equal(ballet.resolvedDate, '2026-09-05');
    assert.equal(ballet.timeText, '6:30PM');
    assert.equal(ballet.detailUrl, 'https://crossroadshotelkc.com/events/second-company-showcase/');
    assert.equal(ballet.category, 'Crossroads');
  });

  it('decodes entities in the excerpt rather than leaking &rsquo;', () => {
    const ballet = events.find((e) => e.title === 'Second Company Showcase');
    assert.ok(ballet?.excerpt?.includes('Kansas City Ballet\u2019s'));
    assert.ok(!ballet?.excerpt?.includes('&rsquo;'));
  });

  it('marks a weekly event as recurring but still resolves its next date', () => {
    const haus = events.find((e) => e.title === 'Haus of Rhythm');
    assert.ok(haus);
    assert.equal(haus.recurring, true);
    // The specific date is what makes a pitch concrete, so it must survive.
    assert.equal(haus.resolvedDate, '2026-09-04');
  });
});

/** Markup from raphaelkc.com on 2026-09-03 — The Events Calendar plugin output. */
const TRIBE_EVENTS_HTML = `
<div class="tribe-events-calendar-list__event-wrapper tribe-common-g-col">
<article class="tribe-events-calendar-list__event tribe-common-g-row post-7209 tribe_events">
  <div class="tribe-events-calendar-list__event-details tribe-common-g-col">
    <header class="tribe-events-calendar-list__event-header">
      <h4 class="tribe-events-calendar-list__event-title tribe-common-h6">
        <a href="https://raphaelkc.com/event-calendar/jackie-myers-duo-17/" title="Jackie Myers Duo" rel="bookmark" class="tribe-events-calendar-list__event-title-link tribe-common-anchor-thin" > Jackie Myers Duo </a>
      </h4>
      <div class="tribe-events-calendar-list__event-datetime-wrapper tribe-common-b2">
        <time class="tribe-events-calendar-list__event-datetime" datetime="2026-09-03">
          <span class="tribe-event-date-start">September 3 @ 6:00 pm</span> - <span class="tribe-event-time">10:00 pm</span>
        </time>
      </div>
      <address class="tribe-events-calendar-list__event-venue tribe-common-b2">
        <span class="tribe-events-calendar-list__event-venue-title tribe-common-b2--bold"> Chaz Restaurant </span>
        <span class="tribe-events-calendar-list__event-venue-address"> 325 Ward Parkway, Kansas City, United States </span>
      </address>
    </header>
    <div class="tribe-events-calendar-list__event-description tribe-common-b2"><p>Pianist-vocalist Jackie Myers has been splitting her time between Austin and KC.</p></div>
  </div>
</article>
</div>
`;

describe('The Events Calendar extraction', () => {
  const events = extractTribeEvents(TRIBE_EVENTS_HTML);

  it('uses the published datetime attribute rather than inferring a date', () => {
    assert.equal(events.length, 1);
    assert.equal(events[0]!.resolvedDate, '2026-09-03');
  });

  it('captures the title, venue, time range and detail link', () => {
    const event = events[0]!;
    assert.equal(event.title, 'Jackie Myers Duo');
    // For a hotel the venue is the outlet inside the property, which is the useful part.
    assert.equal(event.category, 'Chaz Restaurant');
    assert.match(event.timeText ?? '', /6:00 pm/);
    assert.match(event.timeText ?? '', /10:00 pm/);
    assert.equal(
      event.detailUrl,
      'https://raphaelkc.com/event-calendar/jackie-myers-duo-17/',
    );
    assert.match(event.excerpt ?? '', /Pianist-vocalist Jackie Myers/);
  });

  it('returns nothing for markup it does not recognise, rather than guessing', () => {
    assert.deepEqual(extractTribeEvents('<div><p>Some other hotel page</p></div>'), []);
  });
});

describe('published date resolution', () => {
  const now = new Date('2026-09-03T05:00:00Z');

  it('resolves a year-less date to the nearest upcoming occurrence', () => {
    assert.equal(resolvePublishedDate('Sept 5th', now), '2026-09-05');
    assert.equal(resolvePublishedDate('October 12', now), '2026-10-12');
  });

  it('reads a long-past month as next year rather than as an event that already happened', () => {
    assert.equal(resolvePublishedDate('Jan 10th', now), '2027-01-10');
  });

  it('honors an explicit year', () => {
    assert.equal(resolvePublishedDate('March 4, 2027', now), '2027-03-04');
  });

  it('returns null rather than guessing when the text is not a date', () => {
    assert.equal(resolvePublishedDate('Every Friday', now), null);
    assert.equal(resolvePublishedDate('Ongoing', now), null);
    assert.equal(resolvePublishedDate(null, now), null);
    assert.equal(resolvePublishedDate('Febtober 40th', now), null);
  });
});

describe('upcoming events filter', () => {
  const now = new Date('2026-09-10T05:00:00Z');

  it('drops events that have already happened', () => {
    const events = extractCrossroadsEvents(CROSSROADS_EVENTS_HTML, new Date('2026-09-03T05:00:00Z'));
    const upcoming = upcomingEvents(events, now);
    // Sept 5th is past as of Sept 10th; the recurring Friday series is not.
    assert.ok(!upcoming.some((e) => e.title === 'Second Company Showcase'));
    assert.ok(upcoming.some((e) => e.title === 'Haus of Rhythm'));
  });

  it('keeps an event happening today', () => {
    const events = extractCrossroadsEvents(CROSSROADS_EVENTS_HTML, new Date('2026-09-03T05:00:00Z'));
    const upcoming = upcomingEvents(events, new Date('2026-09-05T12:00:00Z'));
    assert.ok(upcoming.some((e) => e.title === 'Second Company Showcase'));
  });
});
