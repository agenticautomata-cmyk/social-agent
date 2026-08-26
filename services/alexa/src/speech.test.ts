import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { escapeSsmlText } from './speech.js';

describe('escapeSsmlText', () => {
  it('escapes dynamic title and venue characters once', () => {
    assert.equal(escapeSsmlText('Food & Wine Festival'), 'Food &amp; Wine Festival');
    assert.equal(escapeSsmlText("Smith's Bar & Grill"), 'Smith&apos;s Bar &amp; Grill');
    assert.equal(escapeSsmlText('KC <After Dark>'), 'KC &lt;After Dark&gt;');
    assert.equal(escapeSsmlText('The "Best" Room'), 'The &quot;Best&quot; Room');
  });
});
