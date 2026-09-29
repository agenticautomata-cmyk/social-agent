import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authorizeMuseIngest } from './auth.js';
import { decideEventAdmission, stripMuseUrl } from './contract.js';
import { ingestMusePayload } from './ingest.js';
import { createMemoryMuseIngestStore } from './memory-store.js';

const PROVENANCE = {
  found_via: 'places_search',
  found_at: '2026-09-29T10:15:00-05:00',
};

function event(overrides: Record<string, unknown> = {}) {
  return {
    type: 'event_finding',
    source: 'muse-agent',
    fingerprint: 'muse:test:kauffman-recital',
    title: 'Sample Recital',
    venue: 'Kauffman Center',
    city: 'Kansas City',
    state: 'MO',
    canonical_url: 'https://www.kauffmancenter.org/events/sample-recital?utm_source=muse&fbclid=abc',
    starts_at: '2026-11-14T20:00:00-06:00',
    provenance: PROVENANCE,
    ...overrides,
  };
}

describe('muse ingest auth', () => {
  it('rejects a missing or mismatched key', () => {
    const prior = process.env.MUSE_INGEST_KEY;
    process.env.MUSE_INGEST_KEY = 'muse-test-only-key';
    try {
      assert.equal(authorizeMuseIngest(undefined).ok, false);
      assert.equal(authorizeMuseIngest('').ok, false);
      assert.equal(authorizeMuseIngest('wrong-key').ok, false);
      assert.equal(authorizeMuseIngest('muse-test-only-key').ok, true);
    } finally {
      if (prior === undefined) delete process.env.MUSE_INGEST_KEY;
      else process.env.MUSE_INGEST_KEY = prior;
    }
  });

  it('rejects every key when the env var is unset', () => {
    const prior = process.env.MUSE_INGEST_KEY;
    delete process.env.MUSE_INGEST_KEY;
    try {
      assert.equal(authorizeMuseIngest('muse-test-only-key').ok, false);
    } finally {
      if (prior === undefined) delete process.env.MUSE_INGEST_KEY;
      else process.env.MUSE_INGEST_KEY = prior;
    }
  });
});

describe('muse ingest contract', () => {
  it('strips tracking parameters from canonical URLs', () => {
    assert.equal(
      stripMuseUrl('https://www.kauffmancenter.org/events/sample-recital?utm_source=muse&fbclid=abc'),
      'https://www.kauffmancenter.org/events/sample-recital',
    );
  });

  it('quarantines an event that lacks KC-geo evidence', () => {
    const store = createMemoryMuseIngestStore();
    const decision = decideEventAdmission(
      {
        type: 'event_finding',
        source: 'muse-agent',
        fingerprint: 'muse:test:no-geo',
        provenance: { found_via: 'places_search', found_at: '2026-09-29T10:15:00-05:00', evidence_urls: [] },
        raw: event({
          fingerprint: 'muse:test:no-geo',
          venue: undefined,
          city: undefined,
          state: undefined,
          location: undefined,
        }),
      },
      new Date('2026-09-29T15:00:00.000Z'),
    );
    assert.equal(decision.disposition, 'quarantined');
    assert.match(decision.reason, /location_unverified/);
    assert.equal(store.writes.length, 0);
  });
});

describe('muse ingest routing', () => {
  const now = new Date('2026-09-29T15:00:00.000Z');

  it('returns the original disposition on an identical fingerprint re-POST and writes once', async () => {
    const store = createMemoryMuseIngestStore();
    const first = await ingestMusePayload(event(), store, now);
    const second = await ingestMusePayload(event(), store, now);
    assert.equal(first.items.length, 1);
    assert.equal(second.items[0]?.disposition, first.items[0]?.disposition);
    assert.equal(second.items[0]?.reason, first.items[0]?.reason);
    assert.equal(store.writes.length, 1);
    assert.equal(store.items.length, 1);
    assert.equal(store.runs.length, 2);
    assert.equal(store.runs[1]?.rawPayload && typeof store.runs[1]?.rawPayload, 'object');
  });

  it('merges a different fingerprint that shares a canonical URL', async () => {
    const store = createMemoryMuseIngestStore();
    const body = {
      items: [
        event({ fingerprint: 'muse:test:first' }),
        event({ fingerprint: 'muse:test:second', title: 'Sample Recital Late Show' }),
      ],
    };
    const result = await ingestMusePayload(body, store, now);
    assert.equal(result.items[0]?.disposition, 'accepted');
    assert.equal(result.items[1]?.disposition, 'merged_duplicate');
    assert.equal(result.items[1]?.reason, 'canonical_url_match');
    assert.equal(store.writes.length, 1);
  });

  it('rejects an unknown type and keeps the raw payload', async () => {
    const store = createMemoryMuseIngestStore();
    const body = {
      type: 'rumor',
      source: 'muse-agent',
      fingerprint: 'muse:test:rumor',
      provenance: PROVENANCE,
    };
    const result = await ingestMusePayload(body, store, now);
    assert.deepEqual(result.items[0], {
      fingerprint: 'muse:test:rumor',
      disposition: 'rejected',
      reason: 'unknown_type',
    });
    assert.equal(store.writes.length, 0);
    assert.equal(store.runs[0]?.rawPayload && (store.runs[0]?.rawPayload as { type?: string }).type, 'rumor');
    assert.equal(store.items[0]?.disposition, 'rejected');
  });

  it('routes a weakly located event to quarantine', async () => {
    const store = createMemoryMuseIngestStore();
    const result = await ingestMusePayload(
      event({
        fingerprint: 'muse:test:no-geo',
        venue: undefined,
        city: undefined,
        state: undefined,
      }),
      store,
      now,
    );
    assert.equal(result.items[0]?.disposition, 'quarantined');
    assert.match(result.items[0]?.reason ?? '', /location_unverified/);
    assert.equal(store.writes[0]?.kind, 'calendar');
    if (store.writes[0]?.kind === 'calendar') {
      assert.equal(store.writes[0].lifecycle, 'quarantined');
      assert.equal(store.writes[0].autoOutreach, false);
      assert.equal(
        store.writes[0].canonicalUrl,
        'https://www.kauffmancenter.org/events/sample-recital',
      );
    }
  });

  it('rejects a prose date instead of repairing it', async () => {
    const store = createMemoryMuseIngestStore();
    const result = await ingestMusePayload(event({ starts_at: 'November 14' }), store, now);
    assert.equal(result.items[0]?.disposition, 'rejected');
    assert.equal(result.items[0]?.reason, 'invalid_starts_at');
    assert.equal(store.writes.length, 0);
  });

  it('queues a dossier for review and never starts outreach', async () => {
    const store = createMemoryMuseIngestStore();
    const result = await ingestMusePayload(
      {
        type: 'opportunity_dossier',
        source: 'muse-agent',
        fingerprint: 'muse:dossier:veronica-beard-plaza',
        business: 'Veronica Beard — Country Club Plaza',
        facts: [
          {
            claim: 'Opened September 2026',
            evidence_url: 'https://example.com/story?utm_campaign=muse',
            verified: true,
          },
        ],
        contact_routes: [{ type: 'contact_form', url: 'https://example.com/contact', label: 'general contact' }],
        fit_assessment: 'Strong overlap',
        provenance: PROVENANCE,
      },
      store,
      now,
    );
    assert.equal(result.items[0]?.disposition, 'accepted');
    assert.equal(result.items[0]?.reason, 'queued_for_review');
    const write = store.writes[0];
    assert.equal(write?.kind, 'opportunity');
    if (write?.kind === 'opportunity') {
      assert.equal(write.outreachTriggered, false);
      assert.equal(write.autoOutreach, false);
      assert.equal(write.facts[0]?.evidence_url, 'https://example.com/story');
      assert.equal(write.facts[0]?.verified, true);
      assert.equal(write.contactRoutes[0]?.url, 'https://example.com/contact');
    }
  });

  it('stores an opening with provenance and a stripped evidence URL', async () => {
    const store = createMemoryMuseIngestStore();
    const result = await ingestMusePayload(
      {
        type: 'opening_establishment',
        source: 'muse-agent',
        fingerprint: 'muse:substack:flower-child',
        business: 'Flower Child',
        location: 'Crossroads, Kansas City',
        stage: 'announced',
        evidence_url: 'https://kcinsiders.substack.com/p/flower-child?utm_source=email',
        projected_open: '2026-12-01',
        provenance: PROVENANCE,
      },
      store,
      now,
    );
    assert.equal(result.items[0]?.disposition, 'accepted');
    assert.equal(result.items[0]?.reason, 'openings_radar');
    const write = store.writes[0];
    assert.equal(write?.kind, 'opening');
    if (write?.kind === 'opening') {
      assert.equal(write.evidenceUrl, 'https://kcinsiders.substack.com/p/flower-child');
      assert.equal(write.foundVia, 'places_search');
      assert.equal(write.foundAt, '2026-09-29T10:15:00-05:00');
      assert.equal(write.location, 'Crossroads, Kansas City');
      assert.equal(write.autoOutreach, false);
    }
  });

  it('merges a second opening fingerprint onto the same location', async () => {
    const store = createMemoryMuseIngestStore();
    const opening = {
      type: 'opening_establishment',
      source: 'muse-agent',
      business: 'Flower Child',
      location: 'Crossroads, Kansas City',
      stage: 'announced',
      evidence_url: 'https://kcinsiders.substack.com/p/flower-child',
      provenance: PROVENANCE,
    };
    const result = await ingestMusePayload(
      [
        { ...opening, fingerprint: 'muse:open:1' },
        { ...opening, fingerprint: 'muse:open:2' },
      ],
      store,
      now,
    );
    assert.equal(result.items[1]?.disposition, 'merged_duplicate');
    assert.equal(result.items[1]?.reason, 'canonical_location_match');
    assert.equal(store.writes.length, 1);
  });
});
