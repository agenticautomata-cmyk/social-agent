import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { sanitizeGoogleCalendarError } from './errors.js';
import { BENSON_DEDICATED_CALENDAR_NAME } from './constants.js';
import {
  hasRequiredGoogleCalendarScopes,
  parseGrantedGoogleCalendarScopes,
} from './scopes.js';

const here = dirname(fileURLToPath(import.meta.url));

function readModuleSource(name: string): string {
  return readFileSync(join(here, name), 'utf8');
}

describe('google calendar narrow-scope provisioning', () => {
  it('sanitizes insufficient scope errors without exposing raw Google text', () => {
    const msg = sanitizeGoogleCalendarError('Request had insufficient authentication scopes.');
    assert.equal(msg.includes('insufficient authentication scopes'), false);
    assert.ok(msg.includes('dedicated calendar'));
  });

  it('provisioning and verify never call calendarList.list', () => {
    for (const file of ['provisioning.ts', 'verify.ts', 'oauth.ts']) {
      const src = readModuleSource(file);
      assert.equal(src.includes('/users/me/calendarList'), false, `${file} must not use calendarList.list`);
      assert.equal(src.includes('calendar.readonly'), false, `${file} must not request calendar.readonly`);
      assert.equal(src.includes('calendar.events'), false, `${file} must not request calendar.events`);
    }
  });

  it('provisioning uses Calendars.insert for dedicated calendar bootstrap', () => {
    const src = readModuleSource('provisioning.ts');
    assert.ok(src.includes("method: 'POST'"));
    assert.ok(src.includes('/calendars'));
    assert.ok(src.includes(BENSON_DEDICATED_CALENDAR_NAME));
    assert.ok(src.includes('America/Chicago'));
  });

  it('stored calendar ID path uses Calendars.get before insert', () => {
    const src = readModuleSource('provisioning.ts');
    assert.ok(src.includes('getAppCreatedCalendarById'));
    assert.ok(src.includes('/calendars/${encodeURIComponent(calendarId)}'));
    assert.equal(src.includes('listWritableGoogleCalendars'), false);
  });

  it('oauth callback stores tokens before provisioning and uses completeGoogleCalendarProvisioning', () => {
    const src = readModuleSource('oauth.ts');
    assert.ok(src.includes('authorized_provisioning'));
    assert.ok(src.includes('upsertGoogleCalendarConnection'));
    assert.ok(src.includes('completeGoogleCalendarProvisioning'));
    assert.equal(src.includes('calendarList'), false);
  });

  it('connections preserve tokens on provisioning failure', () => {
    const src = readModuleSource('connections.ts');
    assert.ok(src.includes('authorized_setup_failed'));
    assert.ok(src.includes('markGoogleCalendarProvisioningFailed'));
    assert.ok(src.includes('retryGoogleCalendarProvisioning'));
  });
});

describe('OAuth callback scope handling', () => {
  it('requires calendar.app.created and calendar.freebusy only', () => {
    const granted = parseGrantedGoogleCalendarScopes(
      'https://www.googleapis.com/auth/calendar.app.created https://www.googleapis.com/auth/calendar.freebusy',
    );
    assert.equal(hasRequiredGoogleCalendarScopes(granted), true);
    assert.equal(granted.some((s) => s.includes('calendar.events')), false);
    assert.equal(granted.some((s) => s.includes('calendar.readonly')), false);
    assert.equal(granted.some((s) => s.includes('calendar.calendarlist')), false);
  });
});

describe('freebusy narrow-scope usage', () => {
  it('uses primary target without listing calendars', () => {
    const src = readModuleSource('sync.ts');
    assert.ok(src.includes("'primary'"));
    assert.ok(src.includes('/freeBusy'));
    assert.equal(src.includes('/users/me/calendarList'), false);
  });
});
