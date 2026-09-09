import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MOBILE_DRAWER_PINNED } from './nav-config.ts';
import {
  KC_ASK_TYPE_LABELS,
  KC_COMPENSATION_ACCESS_LABELS,
  KC_HUB_VIEW_LABELS,
  KC_HUB_VIEWS,
} from './contact-intelligence-ui.ts';

describe('Contacts & Programs nav', () => {
  it('pins Contacts & Programs in mobile More drawer', () => {
    const item = MOBILE_DRAWER_PINNED.find((i) => i.href === '/contacts-programs');
    assert.ok(item);
    assert.equal(item?.label, 'Contacts & Programs');
  });

  it('exposes all primary hub views', () => {
    assert.deepEqual([...KC_HUB_VIEWS], [
      'recommended_now',
      'verified_contacts',
      'programs_applications',
      'needs_verification',
      'follow_ups',
      'recently_changed',
    ]);
    for (const view of KC_HUB_VIEWS) {
      assert.ok(KC_HUB_VIEW_LABELS[view].length > 0);
    }
  });

  it('keeps unknown compensation and media-access labels honest', () => {
    assert.equal(KC_COMPENSATION_ACCESS_LABELS.unknown, 'Unknown');
    assert.match(KC_COMPENSATION_ACCESS_LABELS.media_access_not_paid, /not paid/i);
    assert.equal(KC_ASK_TYPE_LABELS.unknown, 'Unknown — do not invent');
  });
});
