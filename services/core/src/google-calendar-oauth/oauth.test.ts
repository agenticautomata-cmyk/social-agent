import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildGoogleCalendarOAuthStart } from './oauth.js';
import { GOOGLE_CALENDAR_OAUTH_REDIRECT_URI_CANONICAL } from './constants.js';

describe('google-calendar OAuth start URL', () => {
  it('requests consent-configured scopes with offline access', async () => {
    if (!process.env.GMAIL_CLIENT_ID && !process.env.GOOGLE_CALENDAR_CLIENT_ID) {
      return;
    }

    const result = await buildGoogleCalendarOAuthStart();
    if (result.mode === 'error') return;

    const url = new URL(result.authorizationUrl);
    assert.equal(url.searchParams.get('access_type'), 'offline');
    assert.equal(url.searchParams.get('include_granted_scopes'), 'true');
    assert.equal(url.searchParams.get('prompt'), 'consent');
    assert.equal(url.searchParams.get('redirect_uri'), GOOGLE_CALENDAR_OAUTH_REDIRECT_URI_CANONICAL);

    const scope = url.searchParams.get('scope') ?? '';
    assert.ok(scope.includes('calendar.app.created'));
    assert.ok(scope.includes('calendar.freebusy'));
    assert.equal(scope.includes('calendar.events'), false);
    assert.equal(scope.includes('calendar.readonly'), false);
    assert.equal(scope.includes('userinfo.email'), false);
    assert.equal(scope.includes('openid'), false);
    assert.ok(result.state.includes('.'));
  });
});
