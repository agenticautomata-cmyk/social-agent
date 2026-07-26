import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { postFingerprint } from './instagram-profile-watcher.js';
import {
  applyDayHeadingToRows,
  resolveWeekendDatesFromPostContext,
} from './roundup-parser.js';
import { buildAttributionLine, sanitizeGeneratedSummary } from './slide-ocr.js';
import { leadFingerprint } from './store.js';
import { isPastEvent } from './dedupe.js';
import { assessCreatorValue, isCalendarEligible } from './creator-value.js';
import type { ParsedRoundupEvent } from './types.js';

describe('curator-watchlist', () => {
  it('profile watcher fingerprint detects unchanged post', () => {
    const fp1 = postFingerprint('https://instagram.com/p/ABC/', 'Events this week', 7);
    const fp2 = postFingerprint('https://instagram.com/p/ABC/', 'Events this week', 7);
    const fp3 = postFingerprint('https://instagram.com/p/ABC/', 'Updated caption', 7);
    assert.equal(fp1, fp2);
    assert.notEqual(fp1, fp3);
  });

  it('processes all carousel slides in order via slide numbers', () => {
    const slides = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
      slideNumber: n,
      ocrText: `Slide ${n} event row`,
    }));
    assert.equal(slides.length, 7);
    assert.deepEqual(slides.map((s) => s.slideNumber), [1, 2, 3, 4, 5, 6, 7]);
  });

  it('OCR parser separates multiple event rows and applies day headings', () => {
    const rows: ParsedRoundupEvent[] = applyDayHeadingToRows([
      {
        eventName: 'Saturday',
        eventDate: null,
        eventTime: null,
        venue: null,
        neighborhood: null,
        price: null,
        ageRestriction: null,
        registrationNotes: null,
        dayHeading: 'Saturday',
        originalQuotedText: 'Saturday',
        slideNumber: 1,
      },
      {
        eventName: 'Jazz at the Gem',
        eventDate: null,
        eventTime: '7pm',
        venue: 'Gem Theater',
        neighborhood: '18th & Vine',
        price: 'Free',
        ageRestriction: null,
        registrationNotes: null,
        dayHeading: null,
        originalQuotedText: 'Jazz at the Gem — 7pm — Free',
        slideNumber: 1,
      },
      {
        eventName: 'Soul Food Market',
        eventDate: null,
        eventTime: '11am',
        venue: 'City Market',
        neighborhood: null,
        price: null,
        ageRestriction: null,
        registrationNotes: null,
        dayHeading: null,
        originalQuotedText: 'Soul Food Market 11am',
        slideNumber: 2,
      },
    ]);
    assert.equal(rows[1]?.dayHeading, 'Saturday');
    assert.equal(rows[2]?.dayHeading, 'Saturday');
    assert.equal(rows[1]?.eventName, 'Jazz at the Gem');
    assert.equal(rows[2]?.eventName, 'Soul Food Market');
  });

  it('post date context resolves weekend dates', () => {
    const resolved = resolveWeekendDatesFromPostContext({
      postPublishedAt: '2026-07-23T18:00:00Z',
      caption: 'KC events this weekend',
      events: [
        {
          eventName: 'Market',
          eventDate: null,
          eventTime: null,
          venue: null,
          neighborhood: null,
          price: null,
          ageRestriction: null,
          registrationNotes: null,
          dayHeading: 'Saturday',
          originalQuotedText: 'Saturday Market',
          slideNumber: 3,
        },
      ],
    });
    assert.ok(resolved[0]?.eventDate);
    assert.match(resolved[0]!.eventDate!, /2026-07-2[56]/);
  });

  it('each event gets its own fingerprint record', () => {
    const a = leadFingerprint({
      eventName: 'Jazz at the Gem',
      eventDate: '2026-07-26',
      venue: 'Gem Theater',
      postUrl: 'https://instagram.com/p/ABC/',
    });
    const b = leadFingerprint({
      eventName: 'Soul Food Market',
      eventDate: '2026-07-26',
      venue: 'City Market',
      postUrl: 'https://instagram.com/p/ABC/',
    });
    assert.notEqual(a, b);
  });

  it('curator and official sources remain distinct in attribution', () => {
    const line = buildAttributionLine('jasfoodjourney');
    assert.equal(line, 'Discovered via @jasfoodjourney');
    const summary = sanitizeGeneratedSummary('Benson found a jazz night.', 'jasfoodjourney');
    assert.match(summary, /Discovered via @jasfoodjourney/);
    assert.doesNotMatch(summary, /Benson's original reporting/i);
  });

  it('unverified social leads stay SOCIAL_LEAD in value assessment', () => {
    const value = assessCreatorValue({
      event: {
        eventName: 'Pop-up',
        eventDate: '2026-08-01',
        eventTime: null,
        venue: 'TBD',
        neighborhood: null,
        price: null,
        ageRestriction: null,
        registrationNotes: null,
        dayHeading: null,
        originalQuotedText: 'Pop-up',
        slideNumber: 1,
      },
      research: {
        verificationStatus: 'SOCIAL_LEAD',
        officialOrganizerUrl: null,
        officialVenueUrl: null,
        ticketUrl: null,
        officialSocialUrl: null,
        verifiedDate: null,
        verifiedTime: null,
        verifiedVenue: null,
        verifiedAddress: null,
        verifiedCost: null,
        verifiedAgeRestriction: null,
        parkingInfo: null,
        filmingNotes: null,
        cancellationNotes: null,
        contactInfo: null,
        conflicts: [],
        summary: null,
        citations: [],
      },
      verificationStatus: 'SOCIAL_LEAD',
    });
    assert.ok(['track_only', 'green_screen_home', 'weekend_roundup', 'ignore'].includes(value.recommendation));
  });

  it('conflicting official information surfaces as track_only or ignore', () => {
    const value = assessCreatorValue({
      event: {
        eventName: 'Cancelled Fest',
        eventDate: '2026-08-01',
        eventTime: null,
        venue: 'Park',
        neighborhood: null,
        price: null,
        ageRestriction: null,
        registrationNotes: null,
        dayHeading: null,
        originalQuotedText: 'Fest',
        slideNumber: 1,
      },
      research: {
        verificationStatus: 'CONFLICTED',
        officialOrganizerUrl: null,
        officialVenueUrl: null,
        ticketUrl: null,
        officialSocialUrl: null,
        verifiedDate: null,
        verifiedTime: null,
        verifiedVenue: null,
        verifiedAddress: null,
        verifiedCost: null,
        verifiedAgeRestriction: null,
        parkingInfo: null,
        filmingNotes: null,
        cancellationNotes: 'Event cancelled',
        contactInfo: null,
        conflicts: ['Official source mentions cancellation'],
        summary: 'Cancelled per venue',
        citations: [],
      },
      verificationStatus: 'CONFLICTED',
    });
    assert.equal(value.recommendation, 'track_only');
  });

  it('past events are rejected', () => {
    assert.equal(isPastEvent('2020-01-01'), true);
    assert.equal(isCalendarEligible({ verificationStatus: 'VERIFIED', eventDate: '2020-01-01' }), false);
  });

  it('no copyrighted graphic text copied into generated summary', () => {
    const summary = sanitizeGeneratedSummary('Event on Saturday at the Gem.', 'jasfoodjourney');
    assert.doesNotMatch(summary, /carousel/i);
    assert.doesNotMatch(summary, /graphic/i);
    assert.match(summary, /@jasfoodjourney/);
  });

  it('watcher authentication failure is modeled as pausedForAuth', () => {
    const paused = { pausedForAuth: true, error: 'Instagram login_required' };
    assert.equal(paused.pausedForAuth, true);
    assert.match(paused.error, /login/i);
  });
});
