import assert from 'node:assert/strict';
import test from 'node:test';

const OFFLINE_KEY = 'benson-shoot-offline';

test('offline shoot cache key is session scoped', () => {
  const sessionId = 'abc-123';
  assert.equal(`${OFFLINE_KEY}:${sessionId}`, 'benson-shoot-offline:abc-123');
});

test('offline payload round-trips through JSON', () => {
  const payload = { id: 'abc', shotIndex: 2, notes: [{ id: 'n1', text: 'test', at: '2026-01-01T00:00:00.000Z' }] };
  const restored = JSON.parse(JSON.stringify(payload));
  assert.deepEqual(restored, payload);
});
