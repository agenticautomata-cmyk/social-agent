import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateScoutPromoteEligibility,
  isCollectionRootEventUrl,
  isWithinPromoteWindow,
  scoutListingStartAt,
} from './scout-promote.js';

const NOW = new Date('2026-09-12T17:00:00.000Z');

function scoutRow(overrides: {
  id?: string;
  itemUrl?: string;
  captionText?: string | null;
  verificationStatus?: string;
  relevanceExplanation?: Record<string, unknown>;
  itemType?: string;
}) {
  return {
    id: overrides.id ?? '00000000-0000-4000-8000-000000000901',
    itemUrl: overrides.itemUrl ?? 'https://www.fantasyloungekc.com/event-details/friday-night/recABC',
    captionText: overrides.captionText ?? 'Fantasy Lounge Friday Night',
    verificationStatus: overrides.verificationStatus ?? 'extracted',
    relevanceExplanation: overrides.relevanceExplanation ?? {
      source: 'event_listing',
      platform: 'wix',
      verificationState: 'verified',
      startDate: '2026-09-18',
      startTimeLocal: '9:00 PM',
      venue: 'Fantasy Lounge',
      city: 'Kansas City',
      eventUrl: 'https://www.fantasyloungekc.com/event-details/friday-night/recABC',
      reviewOnly: true,
    },
    itemType: overrides.itemType ?? 'event_listing',
  };
}

describe('scout-promote eligibility', () => {
  it('accepts a verified Fantasy Lounge night with a detail URL', () => {
    const result = evaluateScoutPromoteEligibility(scoutRow({}), NOW);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.match(result.candidate.eventUrl, /event-details/);
      assert.equal(result.candidate.venue, 'Fantasy Lounge');
    }
  });

  it('rejects collection root / hub URLs', () => {
    assert.equal(isCollectionRootEventUrl('https://www.fantasyloungekc.com/'), true);
    assert.equal(isCollectionRootEventUrl('https://kansascity.events/concerts/july'), true);
    assert.equal(
      isCollectionRootEventUrl('https://www.eventbrite.com/d/mo--kansas-city/events/'),
      true,
    );
    assert.equal(
      isCollectionRootEventUrl('https://www.eventbrite.com/e/kc-nerd-con-tickets-12345678901'),
      false,
    );
  });

  it('rejects meetup not_relevant / quarantine', () => {
    const notRelevant = evaluateScoutPromoteEligibility(
      scoutRow({
        relevanceExplanation: {
          source: 'meetup_directory',
          verificationState: 'verified',
          relevance: 'not_relevant',
          startDate: '2026-09-19',
          eventUrl: 'https://www.meetup.com/kc-group/events/123456789/',
        },
      }),
      NOW,
    );
    assert.equal(notRelevant.ok, false);
    if (!notRelevant.ok) assert.equal(notRelevant.reason, 'meetup_not_relevant');

    const quarantine = evaluateScoutPromoteEligibility(
      scoutRow({
        relevanceExplanation: {
          source: 'meetup_directory',
          verificationState: 'verified',
          needsReview: true,
          startDate: '2026-09-19',
          eventUrl: 'https://www.meetup.com/kc-group/events/123456789/',
        },
      }),
      NOW,
    );
    assert.equal(quarantine.ok, false);
    if (!quarantine.ok) assert.equal(quarantine.reason, 'meetup_quarantine');
  });

  it('rejects events outside the 21-day promote window', () => {
    const far = evaluateScoutPromoteEligibility(
      scoutRow({
        relevanceExplanation: {
          source: 'event_listing',
          verificationState: 'verified',
          startDate: '2026-11-01',
          eventUrl: 'https://www.kcreggaefest.com/tickets/2026-november-special',
          venue: 'KC',
        },
      }),
      NOW,
    );
    assert.equal(far.ok, false);
    if (!far.ok) assert.equal(far.reason, 'outside_window');
  });

  it('parses Chicago wall-clock start from startDate + startTimeLocal', () => {
    const start = scoutListingStartAt({
      startDate: '2026-09-18',
      startTimeLocal: '9:00 PM',
    });
    assert.ok(start);
    const hour = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      hour: 'numeric',
      hour12: false,
    }).format(start!);
    assert.equal(Number(hour), 21);
  });

  it('isWithinPromoteWindow covers Sep 18 from Sep 12', () => {
    assert.equal(isWithinPromoteWindow(new Date('2026-09-18T17:00:00.000Z'), NOW), true);
    assert.equal(isWithinPromoteWindow(new Date('2026-10-20T17:00:00.000Z'), NOW), false);
  });

  it('rejects undated Eventbrite catalog stubs', () => {
    const result = evaluateScoutPromoteEligibility(
      scoutRow({
        itemUrl: 'https://www.eventbrite.com/e/something-12345678901',
        verificationStatus: 'extracted',
        relevanceExplanation: {
          source: 'eventbrite_directory',
          eventUrl: 'https://www.eventbrite.com/e/something-12345678901',
          title: 'Something',
        },
      }),
      NOW,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'no_start');
  });
});
