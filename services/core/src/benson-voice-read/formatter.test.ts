import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatWeekendCalendarSpeech,
  formatWeekendListSpeech,
  speakClockTime,
  speakWeekday,
  stripVoiceUnsafeText,
} from './formatter.js';
import { VOICE_SPEECH_MAX_CHARS, WEEKEND_CALENDAR_EMPTY_SPEECH, WEEKEND_LIST_EMPTY_SPEECH } from './types.js';

describe('voice spoken formatter', () => {
  it('strips URLs', () => {
    assert.equal(
      stripVoiceUnsafeText('See https://kcparks.org/hike and www.example.com/x'),
      'See and',
    );
  });

  it('strips UUIDs', () => {
    assert.equal(
      stripVoiceUnsafeText('Event 6783e2ac-7f62-4776-93e0-837a437477ce tonight'),
      'Event tonight',
    );
  });

  it('strips markdown', () => {
    assert.equal(stripVoiceUnsafeText('**Panda Fest** at _Legends Field_'), 'Panda Fest at Legends Field');
  });

  it('strips confidence percentages and jargon', () => {
    const out = stripVoiceUnsafeText('Panda Fest 87% confidence content_item evidence ledger');
    assert.doesNotMatch(out, /87%|confidence|content_item|evidence ledger/i);
    assert.match(out, /Panda Fest/);
  });

  it('speaks natural Chicago dates and times', () => {
    const iso = '2026-08-15T15:00:00.000Z'; // Saturday 10:00 AM CDT
    assert.equal(speakWeekday(iso, 'America/Chicago'), 'Saturday');
    assert.equal(speakClockTime(iso, 'America/Chicago'), '10:00 AM');
    assert.equal(speakClockTime(iso, 'America/Chicago', true), null);
  });

  it('returns truthful empty calendar copy', () => {
    assert.equal(formatWeekendCalendarSpeech({ count: 0, items: [] }), WEEKEND_CALENDAR_EMPTY_SPEECH);
  });

  it('returns truthful empty weekend list copy', () => {
    assert.equal(formatWeekendListSpeech({ count: 0, items: [] }), WEEKEND_LIST_EMPTY_SPEECH);
  });

  it('speaks at most three calendar items with a continuation hint', () => {
    const speech = formatWeekendCalendarSpeech({
      count: 18,
      items: [
        { title: 'Melon Summer Smash', venue: 'the Kansas City Zoo' },
        { title: 'Panda Fest', venue: 'Legends Field' },
        { title: 'Hike with a Naturalist', venue: 'Lakeside Nature Center' },
        { title: 'Should not be spoken', venue: 'Nowhere' },
      ],
    });
    assert.match(speech, /Benson found 18 things this weekend/);
    assert.match(speech, /Melon Summer Smash at the Kansas City Zoo/);
    assert.match(speech, /Panda Fest at Legends Field/);
    assert.match(speech, /Hike with a Naturalist at Lakeside Nature Center/);
    assert.doesNotMatch(speech, /Should not be spoken/);
    assert.match(speech, /The first few are/);
    assert.doesNotMatch(speech, /strongest/i);
    assert.match(speech, /Ask for more if you want the rest/);
    assert.ok(speech.length <= VOICE_SPEECH_MAX_CHARS);
  });

  it('uses first-is wording for a single chronological item', () => {
    const speech = formatWeekendCalendarSpeech({
      count: 1,
      items: [{ title: 'Hike with a Naturalist', venue: 'Lakeside Nature Center' }],
    });
    assert.match(speech, /The first is Hike with a Naturalist at Lakeside Nature Center/);
    assert.doesNotMatch(speech, /strongest/i);
  });

  it('does not exceed a reasonable spoken length', () => {
    const speech = formatWeekendCalendarSpeech({
      count: 40,
      items: Array.from({ length: 40 }, (_, i) => ({
        title: `Very long festival name number ${i} with extra words`,
        venue: 'A very long venue name in Kansas City Missouri',
      })),
    });
    assert.ok(speech.length <= VOICE_SPEECH_MAX_CHARS);
    assert.doesNotMatch(speech, /https?:\/\//);
  });
});
