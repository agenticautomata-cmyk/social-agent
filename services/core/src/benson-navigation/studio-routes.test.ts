import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { STUDIO_ROUTES } from './studio-routes.js';

describe('studio My Info routes', () => {
  it('lists Creator Assets under My Info', () => {
    const route = STUDIO_ROUTES.find((r) => r.href === '/creator-assets');
    assert.ok(route);
    assert.equal(route?.label, 'Creator Assets');
    assert.equal(route?.section, 'My Info');
  });

  it('labels media kits as Media Kit Library', () => {
    const route = STUDIO_ROUTES.find((r) => r.href === '/media-kits');
    assert.ok(route);
    assert.equal(route?.label, 'Media Kit Library');
    assert.equal(route?.section, 'My Info');
  });
});
