import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { isBensonVoiceAuthorized, parseBearerToken, voiceUnauthorizedMessage } from './auth.js';

const ORIGINAL = process.env.BENSON_VOICE_API_KEY;
const CONTROL = process.env.BENSON_CONTROL_TOWER_KEY;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.BENSON_VOICE_API_KEY;
  else process.env.BENSON_VOICE_API_KEY = ORIGINAL;
  if (CONTROL === undefined) delete process.env.BENSON_CONTROL_TOWER_KEY;
  else process.env.BENSON_CONTROL_TOWER_KEY = CONTROL;
});

describe('benson voice auth', () => {
  it('rejects missing key when secret is configured', () => {
    process.env.BENSON_VOICE_API_KEY = 'voice-secret-test';
    assert.equal(isBensonVoiceAuthorized(undefined), false);
    assert.equal(isBensonVoiceAuthorized(''), false);
  });

  it('rejects wrong key', () => {
    process.env.BENSON_VOICE_API_KEY = 'voice-secret-test';
    assert.equal(isBensonVoiceAuthorized('Bearer other-secret'), false);
    assert.equal(isBensonVoiceAuthorized('Bearer voice-secret-tes'), false);
  });

  it('allows valid bearer key', () => {
    process.env.BENSON_VOICE_API_KEY = 'voice-secret-test';
    assert.equal(isBensonVoiceAuthorized('Bearer voice-secret-test'), true);
  });

  it('rejects when voice key is unset', () => {
    delete process.env.BENSON_VOICE_API_KEY;
    assert.equal(isBensonVoiceAuthorized('Bearer anything'), false);
  });

  it('does not accept the Control Tower key', () => {
    process.env.BENSON_VOICE_API_KEY = 'voice-secret-test';
    process.env.BENSON_CONTROL_TOWER_KEY = 'control-tower-secret';
    assert.equal(isBensonVoiceAuthorized('Bearer control-tower-secret'), false);
  });

  it('rejects malformed authorization', () => {
    process.env.BENSON_VOICE_API_KEY = 'voice-secret-test';
    assert.equal(parseBearerToken('Basic voice-secret-test'), null);
    assert.equal(isBensonVoiceAuthorized('Basic voice-secret-test'), false);
    assert.equal(isBensonVoiceAuthorized('voice-secret-test'), false);
    assert.equal(isBensonVoiceAuthorized('Bearer'), false);
  });

  it('does not mention the secret in the unauthorized message', () => {
    assert.doesNotMatch(voiceUnauthorizedMessage(), /BENSON_VOICE_API_KEY|secret|key/i);
  });
});
