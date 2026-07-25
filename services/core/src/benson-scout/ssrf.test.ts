import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertScoutUrlAllowed } from './ssrf.js';

describe('benson-scout SSRF', () => {
  it('blocks localhost URLs', async () => {
    await assert.rejects(() => assertScoutUrlAllowed('http://localhost:4000/admin'), /not allowed/);
    await assert.rejects(() => assertScoutUrlAllowed('http://127.0.0.1/'), /not allowed/);
  });

  it('allows public HTTPS URLs', async () => {
    await assert.doesNotReject(() => assertScoutUrlAllowed('https://unionstation.org/events/'));
  });
});
