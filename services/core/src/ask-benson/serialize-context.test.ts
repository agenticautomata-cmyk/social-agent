import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCacheKey,
  buildSnapshotVersion,
  normalizeAskMessage,
} from './context.js';
import {
  hashNormalizedParts,
  normalizeHashPart,
  serializeAskBensonValue,
  toPostgresTimestamp,
} from './serialize-context.js';

const MICROPHONE_QUESTION =
  'What color should the light on the microphone be when charging the Lark microphone?';

describe('normalizeHashPart', () => {
  it('converts Date values to ISO 8601', () => {
    const date = new Date('2026-07-21T18:48:00.000Z');
    assert.equal(normalizeHashPart(date), '2026-07-21T18:48:00.000Z');
  });

  it('handles null and undefined', () => {
    assert.equal(normalizeHashPart(null), '');
    assert.equal(normalizeHashPart(undefined), '');
  });

  it('stringifies numbers and booleans', () => {
    assert.equal(normalizeHashPart(42), '42');
    assert.equal(normalizeHashPart(true), 'true');
  });

  it('stable-json stringifies nested objects', () => {
    const left = normalizeHashPart({ b: 1, a: new Date('2026-01-02T03:04:05.000Z') });
    const right = normalizeHashPart({ a: '2026-01-02T03:04:05.000Z', b: 1 });
    assert.equal(left, right);
  });
});

describe('buildSnapshotVersion', () => {
  it('accepts Date fields from database hydration', () => {
    const date = new Date('2026-07-21T18:48:00.000Z');
    const fromDates = buildSnapshotVersion({
      postingComputedAt: date,
      dataThrough: date,
      lastSync: date,
      briefingCreatedAt: date,
      totalVideos: 12,
      mediaKitUpdatedAt: date,
      preferencesUpdatedAt: date,
      progressBriefCreatedAt: date,
    });
    const fromIso = buildSnapshotVersion({
      postingComputedAt: date.toISOString(),
      dataThrough: date.toISOString(),
      lastSync: date.toISOString(),
      briefingCreatedAt: date.toISOString(),
      totalVideos: 12,
      mediaKitUpdatedAt: date.toISOString(),
      preferencesUpdatedAt: date.toISOString(),
      progressBriefCreatedAt: date.toISOString(),
    });
    assert.equal(fromDates, fromIso);
  });
});

describe('buildCacheKey', () => {
  it('is stable for the Lark microphone charging question', () => {
    const normalized = normalizeAskMessage(MICROPHONE_QUESTION);
    const snapshot = buildSnapshotVersion({
      postingComputedAt: new Date('2026-07-21T18:00:00.000Z'),
      dataThrough: null,
      lastSync: null,
      briefingCreatedAt: null,
      totalVideos: 0,
    });
    const keyA = buildCacheKey(normalized, snapshot, null, null);
    const keyB = buildCacheKey(normalized, snapshot, null, null);
    assert.equal(keyA, keyB);
    assert.match(keyA, /^[a-f0-9]{16}$/);
  });
});

describe('serializeAskBensonValue', () => {
  it('normalizes early signal and opportunity-like records', () => {
    const signalDate = new Date('2026-07-20T12:00:00.000Z');
    const eventDate = new Date('2026-07-25T19:00:00.000Z');
    const serialized = serializeAskBensonValue({
      earlySignals: [
        {
          title: 'Permit filed',
          detectedAt: signalDate,
          evidence: [{ observedAt: signalDate, url: 'https://example.com' }],
          score: 0.82,
          dismissed: null,
        },
      ],
      topOpportunities: [
        {
          title: 'New cafe opening',
          eventDate,
          location: 'Crossroads',
          why: null,
        },
      ],
    }) as Record<string, unknown>;

    const signals = serialized.earlySignals as Array<Record<string, unknown>>;
    assert.equal(signals[0]?.detectedAt, signalDate.toISOString());
    const evidence = signals[0]?.evidence as Array<Record<string, unknown>>;
    assert.equal(evidence[0]?.observedAt, signalDate.toISOString());

    const opportunities = serialized.topOpportunities as Array<Record<string, unknown>>;
    assert.equal(opportunities[0]?.eventDate, eventDate.toISOString());
    assert.equal(opportunities[0]?.why, null);
  });

  it('normalizes message history timestamps', () => {
    const createdAt = new Date('2026-07-21T18:48:00.000Z');
    const serialized = serializeAskBensonValue({
      history: [
        { role: 'user', content: MICROPHONE_QUESTION, createdAt },
        { role: 'assistant', content: 'Solid green.', createdAt, evidence: undefined },
      ],
    }) as Record<string, unknown>;

    const history = serialized.history as Array<Record<string, unknown>>;
    assert.equal(history.length, 2);
    assert.equal(history[0]?.createdAt, createdAt.toISOString());
    assert.equal('evidence' in history[1]!, false);
  });

  it('handles arrays, nested objects, null, and undefined', () => {
    const serialized = serializeAskBensonValue({
      tags: ['gear', null, { updatedAt: new Date('2026-01-01T00:00:00.000Z') }],
      meta: { note: undefined, count: 3, active: true },
    }) as Record<string, unknown>;

    const tags = serialized.tags as unknown[];
    assert.deepEqual(tags[0], 'gear');
    assert.equal(tags[1], null);
    assert.equal((tags[2] as Record<string, unknown>).updatedAt, '2026-01-01T00:00:00.000Z');
    const meta = serialized.meta as Record<string, unknown>;
    assert.equal(meta.count, 3);
    assert.equal(meta.active, true);
    assert.equal('note' in meta, false);
  });

  it('serializes grounded context with and without early signals', () => {
    const withSignals = serializeAskBensonValue({
      snapshotVersion: 'abc123',
      earlySignals: [{ firstSeenAt: new Date('2026-07-01T00:00:00.000Z') }],
    });
    const withoutSignals = serializeAskBensonValue({
      snapshotVersion: 'abc123',
      earlySignals: null,
    });
    assert.doesNotThrow(() => JSON.stringify(withSignals));
    assert.doesNotThrow(() => JSON.stringify(withoutSignals));
  });
});

describe('toPostgresTimestamp', () => {
  it('returns ISO strings suitable for postgres.js binds', () => {
    const date = new Date('2026-07-21T18:48:00.000Z');
    assert.equal(toPostgresTimestamp(date), '2026-07-21T18:48:00.000Z');
    assert.equal(toPostgresTimestamp(date.getTime()), '2026-07-21T18:48:00.000Z');
    assert.equal(toPostgresTimestamp('2026-07-21T18:48:00.000Z'), '2026-07-21T18:48:00.000Z');
  });

  it('matches llm-spend cache-window pattern', () => {
    const sinceIso = toPostgresTimestamp(new Date(Date.now() - 60 * 60 * 1000));
    assert.match(sinceIso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.doesNotThrow(() => hashNormalizedParts([sinceIso, 'cache-key']));
  });
});

describe('microphone question regression', () => {
  it('builds cache inputs without throwing for Date-heavy snapshot parts', () => {
    const normalized = normalizeAskMessage(MICROPHONE_QUESTION);
    const snapshot = buildSnapshotVersion({
      postingComputedAt: new Date(),
      dataThrough: new Date(),
      lastSync: new Date(),
      briefingCreatedAt: new Date(),
      totalVideos: 99,
      mediaKitUpdatedAt: new Date(),
      preferencesUpdatedAt: new Date(),
      progressBriefCreatedAt: new Date(),
    });
    const cacheKey = buildCacheKey(normalized, snapshot, null, null);
    const payload = serializeAskBensonValue({
      question: MICROPHONE_QUESTION,
      creatorData: {
        snapshotVersion: snapshot,
        topOpportunities: [{ eventDate: new Date() }],
        bensonLearnings: { updatedAt: new Date() },
      },
      cacheKey,
    });

    assert.doesNotThrow(() => JSON.stringify(payload));
    assert.match(cacheKey, /^[a-f0-9]{16}$/);
  });
});
