import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  looksLikeUnsanitizedArtifact,
  sanitizeScrapedText,
  sanitizeScrapedTitle,
} from './sanitize-scraped-text.js';

describe('sanitizeScrapedText', () => {
  it('decodes the exact reported HTML entities', () => {
    assert.equal(sanitizeScrapedTitle("Unforked&#8217;s new location"), "Unforked\u2019s new location");
    assert.equal(sanitizeScrapedText('Coffee &#038; Pastries'), 'Coffee & Pastries');
  });

  it('strips the exact reported CSS selector artifact', () => {
    const input =
      'Join us this Saturday for the ribbon cutting. #lcs_slide_out_button13044 > img { transform: rotate(-90deg) !important; }';
    const result = sanitizeScrapedText(input);
    assert.ok(!result.includes('lcs_slide_out_button'));
    assert.ok(!result.includes('!important'));
    assert.ok(result.includes('ribbon cutting'));
  });

  it('strips <style> and <script> blocks including their inner text', () => {
    const input =
      '<style>.hero { color: red; }</style><p>Grand opening Saturday</p><script>function track(){ ga("send"); }</script>';
    const result = sanitizeScrapedText(input);
    assert.equal(result, 'Grand opening Saturday');
  });

  it('preserves legitimate event text', () => {
    const input = '<p>The KC Streetcar Extension opens to riders on <strong>August 15</strong>.</p>';
    const result = sanitizeScrapedText(input);
    assert.equal(result, 'The KC Streetcar Extension opens to riders on August 15 .');
  });

  it('decodes double-encoded and named entities seen in production', () => {
    assert.equal(sanitizeScrapedText('giveaways &amp;amp; more'), 'giveaways & more');
    assert.equal(sanitizeScrapedText('Block 15 will close &mdash; they&rsquo;re closing out'), 'Block 15 will close \u2014 they\u2019re closing out');
  });

  it('strips embedded newsletter/email CSS soup and media queries', () => {
    const input =
      "Discover Zanna Bi Boutique's Bestsellers /* Desktop column classes need to be on top */ .one-col .two-col .three-col @media screen and (max-width:480px) { u~div div>u~div .button-narrow, .one-col .two-col { width:100% !important; } } Shop now.";
    const result = sanitizeScrapedText(input);
    assert.ok(!result.includes('@media'));
    assert.ok(!result.includes('!important'));
    assert.ok(result.includes("Discover Zanna Bi Boutique's Bestsellers"));
    assert.ok(result.includes('Shop now.'));
  });

  it('removes tracking-parameter autolinks', () => {
    const input =
      'Come by <https://vinestbrewing.com/?ss_source=sscampaigns&ss_campaign_id=abc123&ss_email_id=def456> this Friday.';
    const result = sanitizeScrapedText(input);
    assert.ok(!result.includes('ss_campaign_id'));
    assert.ok(result.includes('this Friday.'));
  });

  it('collapses repeated whitespace and boilerplate nav text', () => {
    const input = 'Skip to main content\n\n\nGrand   opening   this   weekend.   Share on Facebook';
    const result = sanitizeScrapedText(input);
    assert.equal(result, 'Grand opening this weekend.');
  });
});

describe('looksLikeUnsanitizedArtifact', () => {
  it('flags leftover entities and CSS as still-dirty', () => {
    assert.equal(looksLikeUnsanitizedArtifact("Unforked&#8217;s"), true);
    assert.equal(looksLikeUnsanitizedArtifact('#foo > img { transform: rotate(-90deg) !important; }'), true);
    assert.equal(looksLikeUnsanitizedArtifact('<div>hi</div>'), true);
  });

  it('does not flag clean text', () => {
    assert.equal(looksLikeUnsanitizedArtifact('Grand opening this weekend at the Plaza'), false);
  });
});
