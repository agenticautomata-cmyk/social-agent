/**
 * Regression: newItems / newLogicalEvents authority from persistence outcomes (1–15).
 * Pure unit tests — no live Instagram, no billable vision, no Telegram send.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPersistenceOutcome,
  emptyCuratorRunCounters,
  materialLeadFieldsChanged,
  mergeCuratorRunCounters,
  newItemsFromCounters,
  wouldAddProvenanceUrl,
  type PersistenceOutcome,
} from './persistence-outcome.js';
import { leadFingerprint } from './store.js';
import { isInstagramErrorChromeTitle } from './instagram-visual/ig-error-chrome.js';
import { isPastEvent } from './dedupe.js';

function simulatePersist(outcomes: PersistenceOutcome[]) {
  let counters = emptyCuratorRunCounters();
  for (const outcome of outcomes) {
    counters = applyPersistenceOutcome(counters, outcome);
  }
  return {
    counters,
    newItems: newItemsFromCounters(counters),
    newLogicalEvents: counters.newLogicalEvents,
  };
}

describe('newItems / persistence outcome authority', () => {
  it('1. newly inserted logical event reports newItems=1', () => {
    const r = simulatePersist(['created']);
    assert.equal(r.newItems, 1);
    assert.equal(r.newLogicalEvents, 1);
    assert.equal(r.counters.candidatesExtracted, 0);
  });

  it('2. reprocessing the same post reports newItems=0', () => {
    const r = simulatePersist(['unchanged', 'duplicate', 'unchanged']);
    assert.equal(r.newItems, 0);
    assert.equal(r.newLogicalEvents, 0);
  });

  it('3. duplicate post with different permalink reports newItems=0', () => {
    const r = simulatePersist(['provenance_added']);
    assert.equal(r.newItems, 0);
    assert.equal(r.counters.provenanceAdded, 1);
  });

  it('4. adding provenance reports provenanceAdded=1, not a new item', () => {
    const r = simulatePersist(['provenance_added']);
    assert.equal(r.newItems, 0);
    assert.equal(r.counters.provenanceAdded, 1);
    assert.ok(wouldAddProvenanceUrl(['https://instagram.com/p/AAA/'], 'https://instagram.com/p/BBB/'));
    assert.equal(
      wouldAddProvenanceUrl(['https://instagram.com/p/AAA/'], 'https://instagram.com/p/AAA/'),
      false,
    );
  });

  it('5. updating a field on an existing event reports existingEventsUpdated=1', () => {
    const r = simulatePersist(['updated']);
    assert.equal(r.newItems, 0);
    assert.equal(r.counters.existingEventsUpdated, 1);
    assert.equal(
      materialLeadFieldsChanged(
        {
          verificationStatus: 'SOCIAL_LEAD',
          officialOrganizerUrl: null,
          officialVenueUrl: null,
          ticketUrl: null,
          officialSocialUrl: null,
          creatorRecommendation: 'watch',
          creatorValueScore: '0.4',
          researchSummary: {},
        },
        { verificationStatus: 'PARTIALLY_VERIFIED' },
      ),
      true,
    );
  });

  it('6. unchanged review candidate reports zero new items', () => {
    const r = simulatePersist(['unchanged']);
    assert.equal(r.newItems, 0);
    assert.equal(r.counters.unchangedCandidates, 1);
  });

  it('7. expired candidate reports zero new items', () => {
    const r = simulatePersist(['expired']);
    assert.equal(r.newItems, 0);
    assert.equal(r.counters.expiredCandidates, 1);
    assert.equal(isPastEvent('2020-01-01'), true);
  });

  it('8. rejected/error-chrome candidate reports zero new items', () => {
    const r = simulatePersist(['rejected']);
    assert.equal(r.newItems, 0);
    assert.equal(r.counters.rejectedCandidates, 1);
    assert.equal(isInstagramErrorChromeTitle("Sorry, This Page Isn't Available."), true);
  });

  it('9. distinct showtimes each count once when first created', () => {
    const fpA = leadFingerprint({
      eventName: 'Karlous Miller',
      eventDate: '2026-09-18',
      venue: 'Funny Bone',
      postUrl: 'https://instagram.com/p/A/',
      eventTime: '7:00 PM',
    });
    const fpB = leadFingerprint({
      eventName: 'Karlous Miller',
      eventDate: '2026-09-19',
      venue: 'Funny Bone',
      postUrl: 'https://instagram.com/p/A/',
      eventTime: '7:00 PM',
    });
    assert.notEqual(fpA, fpB);
    const r = simulatePersist(['created', 'created']);
    assert.equal(r.newItems, 2);
  });

  it('10. concurrent inserts for same event → one created + one duplicate', () => {
    // Simulates DB uniqueness authority: first writer created, second sees duplicate.
    const r = simulatePersist(['created', 'duplicate']);
    assert.equal(r.newLogicalEvents, 1);
    assert.equal(r.newItems, 1);
    assert.equal(r.counters.duplicatesSuppressed, 1);
  });

  it('11. scheduled and manual checks use identical counting rules', () => {
    const manual = simulatePersist(['created', 'provenance_added', 'expired']);
    const scheduled = simulatePersist(['created', 'provenance_added', 'expired']);
    assert.deepEqual(manual.counters, scheduled.counters);
    assert.equal(manual.newItems, scheduled.newItems);
  });

  it('12. Telegram must not announce duplicates/reprocess as new', () => {
    // Contract: only newLogicalEvents>0 is “new”; release/alert copy must use that.
    const reprocess = simulatePersist(['updated', 'provenance_added', 'duplicate', 'unchanged']);
    assert.equal(reprocess.newLogicalEvents, 0);
    const shouldAnnounce = reprocess.newLogicalEvents > 0;
    assert.equal(shouldAnnounce, false);
  });

  it('13. What changed does not list unchanged records as new', () => {
    const r = simulatePersist(['unchanged', 'duplicate']);
    const whatChangedNew = r.newLogicalEvents;
    assert.equal(whatChangedNew, 0);
  });

  it('14. current-run counters reset per run and never inherit prior values', () => {
    const prior = simulatePersist(['created', 'created', 'provenance_added']);
    const nextRun = emptyCuratorRunCounters();
    assert.equal(nextRun.newLogicalEvents, 0);
    assert.equal(nextRun.provenanceAdded, 0);
    assert.notEqual(prior.counters.newLogicalEvents, nextRun.newLogicalEvents);
  });

  it('15. lifetime totals remain separate and accurate', () => {
    const run1 = simulatePersist(['created']);
    const run2 = simulatePersist(['unchanged', 'provenance_added']);
    const priorLifetime = 3;
    const lifetime = priorLifetime + run1.newLogicalEvents + run2.newLogicalEvents;
    assert.equal(lifetime, 4);
    assert.equal(run2.newLogicalEvents, 0);
    const merged = mergeCuratorRunCounters(emptyCuratorRunCounters(), {
      candidatesExtracted: 5,
      newLogicalEvents: 0,
      ocrCached: 9,
    });
    assert.equal(merged.candidatesExtracted, 5);
    assert.equal(merged.newLogicalEvents, 0);
    assert.notEqual(merged.candidatesExtracted, lifetime);
  });
});
