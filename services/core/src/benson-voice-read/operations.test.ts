import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { BENSON_VOICE_OPERATIONS, BENSON_VOICE_ROUTES } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('benson voice operation allowlist', () => {
  it('supports weekend ops plus what_should_kellie_post', () => {
    assert.deepEqual(
      [...BENSON_VOICE_OPERATIONS],
      ['weekend_calendar', 'weekend_list', 'what_should_kellie_post'],
    );
    assert.equal(BENSON_VOICE_ROUTES.weekendCalendar, '/weekend-calendar');
    assert.equal(BENSON_VOICE_ROUTES.weekendList, '/weekend-list');
    assert.equal(BENSON_VOICE_ROUTES.whatShouldKelliePost, '/what-should-kellie-post');
  });

  it('API route is explicit GETs only — no arbitrary query proxy', () => {
    const src = readFileSync(
      resolve(here, '../../../api/src/routes/benson-voice.ts'),
      'utf8',
    );
    assert.match(src, /\.get\('\/weekend-calendar'/);
    assert.match(src, /\.get\('\/weekend-list'/);
    assert.match(src, /\.get\('\/what-should-kellie-post'/);
    assert.doesNotMatch(src, /\.post\(/);
    assert.doesNotMatch(src, /\/query/);
    assert.doesNotMatch(src, /ask-benson|listCalendarItems|ensureCalendarInventoryProjections/);
  });
});
