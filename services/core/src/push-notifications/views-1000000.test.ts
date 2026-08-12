import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VIEWS_1000000_TARGET,
  NEAR_MILESTONE_VIEWS,
  VIEWS_1000000_MILESTONE,
} from './constants.js';
import { formatViews1000000TelegramCaption } from './milestone-content.js';

describe('views_1000000 milestone', () => {
  it('uses a 1M target with a silent near threshold', () => {
    assert.equal(VIEWS_1000000_TARGET, 1_000_000);
    assert.equal(NEAR_MILESTONE_VIEWS, 900_000);
    assert.equal(VIEWS_1000000_MILESTONE, 'views_1000000');
    assert.ok(NEAR_MILESTONE_VIEWS < VIEWS_1000000_TARGET);
  });

  it('telegram caption has no celebration deep link or teaser CTA', () => {
    const caption = formatViews1000000TelegramCaption(1_002_345);
    assert.match(caption, /1 MILLION VIEWS/i);
    assert.match(caption, /1,002,345/);
    assert.doesNotMatch(caption, /celebrate=/i);
    assert.doesNotMatch(caption, /Open the celebration/i);
    assert.doesNotMatch(caption, /almost there|coming soon|approaching/i);
  });
});
