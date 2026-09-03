import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  extractInfluencerFormFields,
  extractJsonLdOffers,
  extractLoewsPressContacts,
} from './extract.js';

describe('extractInfluencerFormFields', () => {
  it('reads named required inputs', () => {
    const html = `
      <form>
        <label>Followers<input name="followers" required type="text" /></label>
        <label>Media kit<input name="media_kit" type="file" /></label>
        <input type="hidden" name="csrf" value="x" />
        <button type="submit">Send</button>
      </form>`;
    const fields = extractInfluencerFormFields(html);
    assert.ok(fields.some((f) => f.name === 'followers' && f.required));
    assert.ok(fields.some((f) => f.name === 'media_kit'));
    assert.ok(!fields.some((f) => f.name === 'csrf'));
  });
});

describe('extractJsonLdOffers', () => {
  it('parses Offer nodes', () => {
    const html = `<script type="application/ld+json">{"@type":"Offer","name":"Staycation Package","description":"Two nights"}</script>`;
    const offers = extractJsonLdOffers(html);
    assert.equal(offers.length, 1);
    assert.equal(offers[0]!.title, 'Staycation Package');
  });
});

describe('extractLoewsPressContacts', () => {
  it('prefers smurov when present', () => {
    const html = `
      <p>Sarah Murov Press smurov@loewshotels.com</p>
      <p>Other other@loewshotels.com</p>`;
    const contacts = extractLoewsPressContacts(html);
    assert.ok(contacts.some((c) => c.email === 'smurov@loewshotels.com'));
  });
});
