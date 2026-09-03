import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LOEWS_INFLUENCER_FORM_URL,
  LOEWS_RIGHTS_WARNING,
  formatLoewsPacketAsDraftBody,
  type LoewsFormPacket,
} from './loews-form-packet.js';

describe('Loews form packet', () => {
  it('never claims Benson will submit the form', () => {
    const packet: LoewsFormPacket = {
      formUrl: LOEWS_INFLUENCER_FORM_URL,
      property: 'Loews Kansas City Hotel',
      bensonMustNotSubmit: true,
      humanSubmits: true,
      rightsWarning: LOEWS_RIGHTS_WARNING,
      answers: [{ field: 'Platform', value: 'TikTok only' }],
      mediaKitUrl: 'https://benson.kckellie.com/media-kit/kellie-hotel',
      readiness: 'review_ready_form_only',
      summary: 'Form-only',
    };
    const body = formatLoewsPacketAsDraftBody(packet);
    assert.match(body, /FORM ONLY/i);
    assert.match(body, /will not submit/i);
    assert.match(body, /RIGHTS WARNING/i);
    assert.equal(packet.bensonMustNotSubmit, true);
    assert.equal(packet.readiness, 'review_ready_form_only');
  });
});
