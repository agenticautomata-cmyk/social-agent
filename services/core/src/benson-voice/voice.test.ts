import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chunkSpeechText } from './chunk-text.js';
import {
  isLongAnswer,
  isShortAnswer,
  shouldAutoPlay,
  transformAnswerToSpeechText,
} from './speech-text.js';
import { sanitizeVoiceError, DEFAULT_VOICE_SETTINGS } from './constants.js';
import { hashSpeechInputs } from './hash.js';

describe('benson-voice speech-text', () => {
  it('strips markdown and reads summary for structured answers', () => {
    const text = `Summary:
Your calendar is clear Saturday afternoon.

Recommended Action:
Enjoy the free time.`;
    const spoken = transformAnswerToSpeechText(text, 'summary');
    assert.match(spoken, /calendar is clear Saturday afternoon/i);
    assert.doesNotMatch(spoken, /\*\*/);
  });

  it('detects short and long answers', () => {
    assert.equal(isShortAnswer('one two three four'), true);
    assert.equal(isLongAnswer(`${'word '.repeat(130)}`), true);
  });

  it('respects auto-play modes', () => {
    assert.equal(shouldAutoPlay('off', 'hello world'), false);
    assert.equal(shouldAutoPlay('all', 'hello world'), true);
    assert.equal(shouldAutoPlay('short_only', 'one two three'), true);
  });
});

describe('benson-voice chunk-text', () => {
  it('preserves order without dropping sentences', () => {
    const paragraph = Array.from({ length: 8 }, (_, i) => `Sentence number ${i + 1} continues calmly.`).join(' ');
    const chunks = chunkSpeechText(paragraph, 120);
    assert.ok(chunks.length > 1);
    const joined = chunks.join(' ');
    for (let i = 1; i <= 8; i++) {
      assert.match(joined, new RegExp(`Sentence number ${i}`));
    }
  });
});

describe('benson-voice settings defaults', () => {
  it('defaults to studio voice with ask-before-long', () => {
    assert.equal(DEFAULT_VOICE_SETTINGS.voiceMode, 'studio');
    assert.equal(DEFAULT_VOICE_SETTINGS.autoPlay, 'off');
    assert.equal(DEFAULT_VOICE_SETTINGS.longAnswerMode, 'ask');
  });

  it('dedup hash is stable', () => {
    const a = hashSpeechInputs({
      spokenText: 'Hello',
      voiceProfile: 'Benson Studio',
      engine: 'kokoro',
      playbackSpeed: 1,
    });
    const b = hashSpeechInputs({
      spokenText: 'Hello',
      voiceProfile: 'Benson Studio',
      engine: 'kokoro',
      playbackSpeed: 1,
    });
    assert.equal(a, b);
  });
});

describe('benson-voice sanitize errors', () => {
  it('does not leak raw python errors', () => {
    assert.equal(sanitizeVoiceError(new Error('ECONNREFUSED')), 'Studio Voice service unavailable');
    assert.equal(sanitizeVoiceError('CUDA OOM'), 'Studio Voice temporarily overloaded');
  });
});
