import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGoogleCalendarOAuthState,
  resetOAuthStateConsumptionForTests,
  verifyGoogleCalendarOAuthState,
} from './oauth-state.js';

describe('google-calendar OAuth state', () => {
  it('validates signed state and rejects replay', () => {
    resetOAuthStateConsumptionForTests();
    const state = createGoogleCalendarOAuthState();
    const payload = verifyGoogleCalendarOAuthState(state);
    assert.ok(payload.nonce.length > 8);
    assert.throws(() => verifyGoogleCalendarOAuthState(state), /already used/);
  });

  it('rejects tampered state', () => {
    resetOAuthStateConsumptionForTests();
    const state = createGoogleCalendarOAuthState();
    assert.throws(() => verifyGoogleCalendarOAuthState(`${state}x`), /Invalid OAuth state/);
  });
});
