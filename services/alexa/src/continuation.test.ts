import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONTINUATION_ATTR } from './continuation.js';
import { createSkill } from './handlers.js';
import { SPEECH } from './speech.js';
import {
  intentEnvelope,
  renderDocumentDirective,
  spokenText,
  testConfig,
  outputSsml,
  decodedSsmlSpeech,
} from './test-helpers.js';
import type { BensonVoiceItem, HttpTransport } from './benson-client.js';

function recordingTransport(impl: HttpTransport) {
  const calls: Array<{ url: string }> = [];
  const transport: HttpTransport = async (input) => {
    calls.push({ url: input.url });
    return impl(input);
  };
  return { transport, calls };
}

function items(n: number): BensonVoiceItem[] {
  return Array.from({ length: n }, (_, i) => ({
    title: `Event ${i + 1}`,
    day: 'Friday',
    time: '6:00 PM',
    venue: `Venue ${i + 1}`,
  }));
}

function calendarSpeech(count: number): string {
  const noun = count === 1 ? 'thing' : 'things';
  const listed =
    count === 1
      ? 'Event 1 at Venue 1'
      : count === 2
        ? 'Event 1 at Venue 1 and Event 2 at Venue 2'
        : 'Event 1 at Venue 1, Event 2 at Venue 2, and Event 3 at Venue 3';
  const more = count > 3 ? ' Ask for more if you want the rest.' : '';
  return `Benson found ${count} ${noun} this weekend. The first few are ${listed}.${more}`;
}

function listSpeech(count: number): string {
  const listed = 'Event 1 at Venue 1, Event 2 at Venue 2, and Event 3 at Venue 3';
  const more = count > 3 ? ' Ask for more if you want the rest.' : '';
  return `There are ${count} items on the weekend list. They are ${listed}.${more}`;
}

function okPayload(speech: string, list: BensonVoiceItem[]) {
  return { status: 200, bodyText: JSON.stringify({ ok: true, speech, items: list }) };
}

function continuationFrom(out: { sessionAttributes?: Record<string, unknown> }) {
  return out.sessionAttributes?.[CONTINUATION_ATTR];
}

describe('weekend result continuation', () => {
  it('7 calendar results page 3 + 3 + 1, then session closes', async () => {
    const { transport, calls } = recordingTransport(async () => okPayload(calendarSpeech(7), items(7)));
    const skill = createSkill({ config: testConfig(), transport });
    const first = await skill.invoke(intentEnvelope({ intent: 'WeekendCalendarIntent' }));
    assert.equal(calls.length, 1);
    assert.equal(
      spokenText(first),
      'Benson found 7 things this weekend. The first few are Event 1 at Venue 1, Event 2 at Venue 2, and Event 3 at Venue 3. Want to hear more?',
    );
    assert.equal(first.response.shouldEndSession, false);
    assert.equal(first.response.reprompt?.outputSpeech?.type, 'SSML');
    const state1 = continuationFrom(first) as { type: string; offset: number; items: unknown[] };
    assert.equal(state1.type, 'weekend_calendar');
    assert.equal(state1.offset, 3);
    assert.equal(state1.items.length, 7);
    assert.doesNotMatch(JSON.stringify(state1), /http|Bearer|verification|requestId|userId/i);

    const second = await skill.invoke(
      intentEnvelope({
        intent: 'MoreResultsIntent',
        newSession: false,
        sessionAttributes: first.sessionAttributes,
      }),
    );
    assert.equal(calls.length, 1);
    assert.equal(
      spokenText(second),
      'The next few are Event 4 at Venue 4, Event 5 at Venue 5, and Event 6 at Venue 6. Want to hear more?',
    );
    assert.equal(second.response.shouldEndSession, false);
    assert.equal((continuationFrom(second) as { offset: number }).offset, 6);

    const third = await skill.invoke(
      intentEnvelope({
        intent: 'MoreResultsIntent',
        newSession: false,
        sessionAttributes: second.sessionAttributes,
      }),
    );
    assert.equal(calls.length, 1);
    assert.equal(spokenText(third), 'The last one is Event 7 at Venue 7. That\'s the rest.');
    assert.equal(third.response.shouldEndSession, true);
    assert.equal(continuationFrom(third), undefined);
  });

  it('exactly 3 calendar results closes the session without inviting more', async () => {
    const { transport, calls } = recordingTransport(async () => okPayload(calendarSpeech(3), items(3)));
    const skill = createSkill({ config: testConfig(), transport });
    const out = await skill.invoke(intentEnvelope({ intent: 'WeekendCalendarIntent' }));
    assert.equal(calls.length, 1);
    assert.equal(spokenText(out), calendarSpeech(3));
    assert.doesNotMatch(spokenText(out), /Want to hear more/);
    assert.equal(out.response.shouldEndSession, true);
    assert.equal(continuationFrom(out), undefined);
  });

  it('Weekend List continuation works the same way', async () => {
    const { transport, calls } = recordingTransport(async () => okPayload(listSpeech(7), items(7)));
    const skill = createSkill({ config: testConfig(), transport });
    const first = await skill.invoke(intentEnvelope({ intent: 'WeekendListIntent' }));
    assert.equal(calls.length, 1);
    assert.match(spokenText(first), /Want to hear more\?$/);
    assert.equal(first.response.shouldEndSession, false);
    assert.equal((continuationFrom(first) as { type: string }).type, 'weekend_list');

    const second = await skill.invoke(
      intentEnvelope({
        intent: 'MoreResultsIntent',
        newSession: false,
        sessionAttributes: first.sessionAttributes,
      }),
    );
    assert.equal(calls.length, 1);
    assert.match(spokenText(second), /The next few are Event 4/);
    const third = await skill.invoke(
      intentEnvelope({
        intent: 'MoreResultsIntent',
        newSession: false,
        sessionAttributes: second.sessionAttributes,
      }),
    );
    assert.equal(calls.length, 1);
    assert.match(spokenText(third), /That's the rest/);
    assert.equal(third.response.shouldEndSession, true);
  });

  it('MoreResultsIntent with no continuation state is safe and makes zero HTTP calls', async () => {
    const { transport, calls } = recordingTransport(async () => {
      throw new Error('no HTTP');
    });
    const skill = createSkill({ config: testConfig(), transport });
    const out = await skill.invoke(intentEnvelope({ intent: 'MoreResultsIntent' }));
    assert.equal(calls.length, 0);
    assert.equal(spokenText(out), SPEECH.moreWithoutContext);
    assert.equal(out.response.shouldEndSession, true);
  });

  it('unauthorized MoreResults does not leak session items', async () => {
    const { transport, calls } = recordingTransport(async () => okPayload(calendarSpeech(7), items(7)));
    const skill = createSkill({ config: testConfig(), transport });
    const first = await skill.invoke(intentEnvelope({ intent: 'WeekendCalendarIntent' }));
    const out = await skill.invoke(
      intentEnvelope({
        intent: 'MoreResultsIntent',
        userId: 'amzn1.ask.account.STRANGER',
        newSession: false,
        sessionAttributes: first.sessionAttributes,
      }),
    );
    assert.equal(calls.length, 1);
    assert.equal(spokenText(out), SPEECH.household);
    assert.doesNotMatch(spokenText(out), /Event 4|Venue 4/);
    assert.equal(renderDocumentDirective(out), undefined);
  });

  it('APL updates to the current spoken page only', async () => {
    const { transport } = recordingTransport(async () => okPayload(calendarSpeech(7), items(7)));
    const skill = createSkill({ config: testConfig(), transport });
    const first = await skill.invoke(intentEnvelope({ intent: 'WeekendCalendarIntent', apl: true }));
    const data1 = (
      renderDocumentDirective(first)?.datasources as {
        bensonData?: { items?: Array<{ title: string }> };
      }
    )?.bensonData;
    assert.deepEqual(data1?.items?.map((item) => item.title), ['Event 1', 'Event 2', 'Event 3']);
    const second = await skill.invoke(
      intentEnvelope({
        intent: 'MoreResultsIntent',
        apl: true,
        newSession: false,
        sessionAttributes: first.sessionAttributes,
      }),
    );
    const data2 = (
      renderDocumentDirective(second)?.datasources as {
        bensonData?: { items?: Array<{ title: string }> };
      }
    )?.bensonData;
    assert.deepEqual(data2?.items?.map((item) => item.title), ['Event 4', 'Event 5', 'Event 6']);
  });

  it('non-APL continuation has no RenderDocument', async () => {
    const { transport } = recordingTransport(async () => okPayload(calendarSpeech(7), items(7)));
    const skill = createSkill({ config: testConfig(), transport });
    const first = await skill.invoke(intentEnvelope({ intent: 'WeekendCalendarIntent' }));
    const more = await skill.invoke(
      intentEnvelope({
        intent: 'MoreResultsIntent',
        newSession: false,
        sessionAttributes: first.sessionAttributes,
      }),
    );
    assert.equal(renderDocumentDirective(first), undefined);
    assert.equal(renderDocumentDirective(more), undefined);
    assert.equal(first.response.shouldEndSession, false);
  });

  it('escapes dynamic title/venue SSML on MoreResults without changing APL text', async () => {
    const special: BensonVoiceItem[] = [
      { title: 'Event 1', day: 'Friday', time: '6:00 PM', venue: 'Venue 1' },
      { title: 'Event 2', day: 'Friday', time: '6:00 PM', venue: 'Venue 2' },
      { title: 'Event 3', day: 'Friday', time: '6:00 PM', venue: 'Venue 3' },
      { title: 'Food & Wine Festival', day: 'Saturday', time: '1:00 PM', venue: 'Crown Center' },
      { title: "Smith's Bar & Grill", day: 'Saturday', time: '6:00 PM', venue: null },
      { title: 'KC <After Dark>', day: 'Saturday', time: '9:00 PM', venue: 'Power & Light' },
      { title: 'Event 7', day: 'Sunday', time: '2:00 PM', venue: 'Venue 7' },
    ];
    const { transport, calls } = recordingTransport(async () =>
      okPayload(calendarSpeech(7), special),
    );
    const skill = createSkill({ config: testConfig(), transport });
    const first = await skill.invoke(
      intentEnvelope({ intent: 'WeekendCalendarIntent', apl: true }),
    );
    const more = await skill.invoke(
      intentEnvelope({
        intent: 'MoreResultsIntent',
        apl: true,
        newSession: false,
        sessionAttributes: first.sessionAttributes,
      }),
    );
    assert.equal(calls.length, 1);
    const ssml = outputSsml(more);
    assert.ok(ssml);
    const decoded = decodedSsmlSpeech(ssml);
    assert.equal(
      decoded,
      "The next few are Food & Wine Festival at Crown Center, Smith's Bar & Grill, and KC <After Dark> at Power & Light. Want to hear more?",
    );
    assert.match(ssml, /Food &amp; Wine Festival/);
    assert.match(ssml, /Smith&apos;s Bar &amp; Grill/);
    assert.match(ssml, /KC &lt;After Dark&gt;/);
    assert.match(ssml, /Power &amp; Light/);
    assert.doesNotMatch(ssml, /Food & Wine/);
    const data = (
      renderDocumentDirective(more)?.datasources as {
        bensonData?: { items?: Array<{ title: string; detail: string }> };
      }
    )?.bensonData;
    assert.deepEqual(
      data?.items?.map((item) => item.title),
      ['Food & Wine Festival', "Smith's Bar & Grill", 'KC <After Dark>'],
    );

    const last = await skill.invoke(
      intentEnvelope({
        intent: 'MoreResultsIntent',
        newSession: false,
        sessionAttributes: more.sessionAttributes,
      }),
    );
    assert.equal(calls.length, 1);
    assert.equal(decodedSsmlSpeech(outputSsml(last)!), 'The last one is Event 7 at Venue 7. That\'s the rest.');
  });
});

describe('post recommendation continuation', () => {
  const POST_SPEECH =
    "Kellie's strongest post today is Bags and Shoes painting workshop. Timely, visual, and fits her Kansas City discovery lane. I have two more if you want them.";

  function postItems(): BensonVoiceItem[] {
    return [
      {
        title: 'Bags and Shoes painting workshop',
        day: 'Timely, visual, and fits her Kansas City discovery lane.',
        time: 'Today',
        venue: 'Crossroads',
        reason: 'Timely, visual, and fits her Kansas City discovery lane.',
      },
      {
        title: 'Plaza boutique pop-up',
        day: 'Strong shopping film.',
        time: 'Tonight',
        venue: 'Plaza',
        reason: 'Strong shopping film.',
      },
      {
        title: 'Riverside thrift haul',
        day: 'Visual discovery pick.',
        time: null,
        venue: 'Riverside',
        reason: 'Visual discovery pick.',
      },
    ];
  }

  it('initial post intent offers more and keeps compact session context', async () => {
    const { transport, calls } = recordingTransport(async () =>
      okPayload(POST_SPEECH, postItems()),
    );
    const skill = createSkill({ config: testConfig(), transport });
    const first = await skill.invoke(intentEnvelope({ intent: 'WhatShouldKelliePostIntent' }));
    assert.equal(calls.length, 1);
    assert.equal(spokenText(first), POST_SPEECH);
    assert.equal(first.response.shouldEndSession, false);
    const state = continuationFrom(first) as {
      type: string;
      offset: number;
      items: Array<{ title: string; reason?: string }>;
    };
    assert.equal(state.type, 'post_recommendations');
    assert.equal(state.offset, 1);
    assert.equal(state.items.length, 3);
    assert.doesNotMatch(JSON.stringify(state), /http|Bearer|contentItemId|uuid|score/i);
  });

  it('MoreResultsIntent speaks remaining post recommendations without a second HTTP call', async () => {
    const { transport, calls } = recordingTransport(async () =>
      okPayload(POST_SPEECH, postItems()),
    );
    const skill = createSkill({ config: testConfig(), transport });
    const first = await skill.invoke(intentEnvelope({ intent: 'WhatShouldKelliePostIntent' }));
    const more = await skill.invoke(
      intentEnvelope({
        intent: 'MoreResultsIntent',
        newSession: false,
        sessionAttributes: first.sessionAttributes,
      }),
    );
    assert.equal(calls.length, 1);
    assert.match(spokenText(more), /Also consider Plaza boutique pop-up/);
    assert.match(spokenText(more), /Riverside thrift haul/);
    assert.match(spokenText(more), /That's the rest/);
    assert.equal(more.response.shouldEndSession, true);
    assert.equal(continuationFrom(more), undefined);
  });

  it('post recommendation MoreResults does not break weekend continuation', async () => {
    const { transport, calls } = recordingTransport(async () => okPayload(calendarSpeech(7), items(7)));
    const skill = createSkill({ config: testConfig(), transport });
    const first = await skill.invoke(intentEnvelope({ intent: 'WeekendCalendarIntent' }));
    const more = await skill.invoke(
      intentEnvelope({
        intent: 'MoreResultsIntent',
        newSession: false,
        sessionAttributes: first.sessionAttributes,
      }),
    );
    assert.equal(calls.length, 1);
    assert.match(spokenText(more), /The next few are Event 4/);
    assert.equal((continuationFrom(first) as { type: string }).type, 'weekend_calendar');
  });

  it('APL-capable post intent shows recommendations and voice-only omits APL', async () => {
    const { transport } = recordingTransport(async () => okPayload(POST_SPEECH, postItems()));
    const skill = createSkill({ config: testConfig(), transport });
    const apl = await skill.invoke(
      intentEnvelope({ intent: 'WhatShouldKelliePostIntent', apl: true }),
    );
    const voiceOnly = await skill.invoke(intentEnvelope({ intent: 'WhatShouldKelliePostIntent' }));
    assert.equal(spokenText(apl), POST_SPEECH);
    assert.equal(spokenText(voiceOnly), POST_SPEECH);
    const data = (
      renderDocumentDirective(apl)?.datasources as {
        bensonData?: { title?: string; items?: Array<{ title: string }> };
      }
    )?.bensonData;
    assert.equal(data?.title, 'What Kellie Should Post');
    assert.deepEqual(data?.items?.map((item) => item.title), [
      'Bags and Shoes painting workshop',
      'Plaza boutique pop-up',
      'Riverside thrift haul',
    ]);
    assert.equal(renderDocumentDirective(voiceOnly), undefined);
  });
});
