import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOOGLE_CALENDAR_APP_CREATED_SCOPE,
  GOOGLE_CALENDAR_FREEBUSY_SCOPE,
  GOOGLE_CALENDAR_OAUTH_SCOPES,
  googleCalendarScopesString,
  hasRequiredGoogleCalendarScopes,
  isGmailOnlyGoogleAuth,
} from './scopes.js';

const GMAIL_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
] as const;

describe('google-calendar-oauth scopes', () => {
  it('requests only consent-configured Calendar scopes', () => {
    assert.deepEqual(GOOGLE_CALENDAR_OAUTH_SCOPES, [
      GOOGLE_CALENDAR_APP_CREATED_SCOPE,
      GOOGLE_CALENDAR_FREEBUSY_SCOPE,
    ]);
    const scopeParam = googleCalendarScopesString();
    assert.ok(scopeParam.includes('calendar.app.created'));
    assert.ok(scopeParam.includes('calendar.freebusy'));
    assert.equal(scopeParam.includes('calendar.events'), false);
    assert.equal(scopeParam.includes('calendar.readonly'), false);
    assert.equal(scopeParam.includes('gmail'), false);
    assert.equal(scopeParam.includes('userinfo.email'), false);
    assert.equal(scopeParam.includes('openid'), false);
  });

  it('Gmail scopes alone do not satisfy Calendar requirements', () => {
    assert.equal(hasRequiredGoogleCalendarScopes([...GMAIL_OAUTH_SCOPES]), false);
    assert.equal(isGmailOnlyGoogleAuth([...GMAIL_OAUTH_SCOPES]), true);
  });

  it('app.created + freebusy satisfy export requirements', () => {
    assert.equal(hasRequiredGoogleCalendarScopes([...GOOGLE_CALENDAR_OAUTH_SCOPES]), true);
    assert.equal(isGmailOnlyGoogleAuth([...GOOGLE_CALENDAR_OAUTH_SCOPES]), false);
  });
});
