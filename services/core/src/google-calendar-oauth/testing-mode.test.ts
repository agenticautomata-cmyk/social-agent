import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTestingModeRefreshTokenWarnings,
  computeRefreshTokenExpiresAt,
  GOOGLE_OAUTH_TESTING_REFRESH_TOKEN_TTL_DAYS,
} from './testing-mode.js';

describe('google calendar testing mode', () => {
  it('expires refresh tokens after 7 days in testing mode', () => {
    const connectedAt = new Date('2026-07-26T12:00:00Z');
    const expires = computeRefreshTokenExpiresAt(connectedAt);
    assert.ok(expires);
    const days =
      (expires!.getTime() - connectedAt.getTime()) / (24 * 60 * 60 * 1000);
    assert.equal(days, GOOGLE_OAUTH_TESTING_REFRESH_TOKEN_TTL_DAYS);
  });

  it('warns before testing-mode refresh token expiry', () => {
    const connectedAt = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const refreshTokenExpiresAt = computeRefreshTokenExpiresAt(connectedAt)!;
    const warnings = buildTestingModeRefreshTokenWarnings({ connectedAt, refreshTokenExpiresAt });
    assert.ok(warnings.some((w) => w.includes('expires') || w.includes('Testing')));
  });
});
