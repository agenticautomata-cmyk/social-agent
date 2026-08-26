import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APL_DOCUMENT_TOKEN, KCKELLIE_HERO_IMAGE_URL, formatItemDetail, toAplItems } from './apl.js';
import { createSkill } from './handlers.js';
import { SPEECH } from './speech.js';
import {
  intentEnvelope,
  launchEnvelope,
  renderDocumentDirective,
  spokenText,
  testConfig,
} from './test-helpers.js';
import type { HttpTransport } from './benson-client.js';

function recordingTransport(impl: HttpTransport) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
  const transport: HttpTransport = async (input) => {
    calls.push({ url: input.url, method: input.method, headers: input.headers });
    return impl(input);
  };
  return { transport, calls };
}

const CALENDAR_SPEECH =
  'Benson found 2 things this weekend. The first few are Zoo Fest at the Kansas City Zoo, and Panda Fest at Legends Field.';
const LIST_SPEECH = 'There are 2 items on the weekend list. They are 816 Day at Power and Light, and Hike with a Naturalist at Lakeside Nature Center.';

function findAplImage(node: unknown): { source?: string; scale?: string } | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const value = node as Record<string, unknown>;
  if (value.type === 'Image') return { source: String(value.source ?? ''), scale: String(value.scale ?? '') };
  for (const child of Object.values(value)) {
    const found = findAplImage(child);
    if (found) return found;
  }
  return undefined;
}

describe('alexa APL visuals', () => {
  it('APL-capable LaunchRequest gets RenderDocument and keeps existing help speech', async () => {
    const { transport, calls } = recordingTransport(async () => {
      throw new Error('launch must not call Benson');
    });
    const skill = createSkill({ config: testConfig(), transport });
    const out = await skill.invoke(launchEnvelope({ apl: true }));
    assert.equal(calls.length, 0);
    assert.equal(spokenText(out), SPEECH.help);
    assert.equal(out.response.shouldEndSession, false);
    const directive = renderDocumentDirective(out);
    assert.equal(directive?.type, 'Alexa.Presentation.APL.RenderDocument');
    assert.equal(directive?.token, APL_DOCUMENT_TOKEN);
    const data = (directive?.datasources as { bensonData?: { brand?: string; title?: string; heroImageUrl?: string; hasHero?: boolean } })?.bensonData;
    assert.equal(data?.brand, 'KCKellie');
    assert.equal(data?.title, 'Benson');
    assert.equal(data?.heroImageUrl, KCKELLIE_HERO_IMAGE_URL);
    assert.equal(data?.hasHero, true);
    assert.equal(KCKELLIE_HERO_IMAGE_URL, 'https://benson.kckellie.com/icons/benson-kellie-alexa-hero.png');
    const image = findAplImage(directive?.document);
    assert.equal(image?.source, '${payload.bensonData.heroImageUrl}');
    assert.equal(image?.scale, 'best-fit');
  });

  it('APL-capable WeekendCalendarIntent gets RenderDocument and identical Benson speech', async () => {
    const { transport } = recordingTransport(async () => ({
      status: 200,
      bodyText: JSON.stringify({
        ok: true,
        speech: CALENDAR_SPEECH,
        items: [
          { title: 'Zoo Fest', day: 'Friday', time: '6:00 PM', venue: 'Kansas City Zoo' },
          { title: 'Panda Fest', day: 'Saturday', time: '2:00 PM', venue: 'Legends Field' },
        ],
      }),
    }));
    const skill = createSkill({ config: testConfig(), transport });
    const out = await skill.invoke(intentEnvelope({ intent: 'WeekendCalendarIntent', apl: true }));
    assert.equal(spokenText(out), CALENDAR_SPEECH);
    assert.equal(out.response.shouldEndSession, true);
    const directive = renderDocumentDirective(out);
    assert.ok(directive);
    const data = (
      directive?.datasources as {
        bensonData?: {
          title?: string;
          heroImageUrl?: string;
          hasHero?: boolean;
          items?: Array<{ title: string; detail: string }>;
        };
      }
    )?.bensonData;
    assert.equal(data?.title, "What's Happening This Weekend");
    assert.equal(data?.heroImageUrl, KCKELLIE_HERO_IMAGE_URL);
    assert.equal(data?.hasHero, true);
    assert.equal(data?.items?.[0]?.title, 'Zoo Fest');
    assert.equal(data?.items?.[0]?.detail, 'Friday  ·  6:00 PM  ·  Kansas City Zoo');
    assert.equal(data?.items?.[1]?.title, 'Panda Fest');
  });

  it('APL-capable WeekendListIntent gets RenderDocument and identical Benson speech', async () => {
    const { transport } = recordingTransport(async () => ({
      status: 200,
      bodyText: JSON.stringify({
        ok: true,
        speech: LIST_SPEECH,
        items: [
          { title: '816 Day', day: 'Saturday', time: null, venue: 'Power and Light' },
          { title: 'Hike with a Naturalist', day: 'Sunday', time: '10:00 AM', venue: 'Lakeside Nature Center' },
        ],
      }),
    }));
    const skill = createSkill({ config: testConfig(), transport });
    const out = await skill.invoke(intentEnvelope({ intent: 'WeekendListIntent', apl: true }));
    assert.equal(spokenText(out), LIST_SPEECH);
    const directive = renderDocumentDirective(out);
    assert.ok(directive);
    const data = (
      directive?.datasources as {
        bensonData?: { title?: string; heroImageUrl?: string; items?: Array<{ title: string }> };
      }
    )?.bensonData;
    assert.equal(data?.title, 'Weekend List');
    assert.equal(data?.heroImageUrl, KCKELLIE_HERO_IMAGE_URL);
    assert.equal(data?.items?.[0]?.title, '816 Day');
    assert.equal(data?.items?.[1]?.title, 'Hike with a Naturalist');
  });

  it('non-APL device gets no RenderDocument and the existing voice response', async () => {
    const { transport } = recordingTransport(async () => ({
      status: 200,
      bodyText: JSON.stringify({ ok: true, speech: CALENDAR_SPEECH, items: [{ title: 'Zoo Fest' }] }),
    }));
    const skill = createSkill({ config: testConfig(), transport });
    const intentOut = await skill.invoke(intentEnvelope({ intent: 'WeekendCalendarIntent' }));
    const launchOut = await skill.invoke(launchEnvelope());
    assert.equal(spokenText(intentOut), CALENDAR_SPEECH);
    assert.equal(intentOut.response.shouldEndSession, true);
    assert.equal(renderDocumentDirective(intentOut), undefined);
    assert.equal(spokenText(launchOut), SPEECH.help);
    assert.equal(launchOut.response.shouldEndSession, false);
    assert.equal(renderDocumentDirective(launchOut), undefined);
  });

  it('unauthorized APL device keeps fail-closed speech and does not leak Benson items', async () => {
    const { transport, calls } = recordingTransport(async () => ({
      status: 200,
      bodyText: JSON.stringify({
        ok: true,
        speech: 'secret weekend speech',
        items: [{ title: 'Private Event', venue: 'Secret Venue' }],
      }),
    }));
    const skill = createSkill({ config: testConfig(), transport });
    const out = await skill.invoke(
      intentEnvelope({
        intent: 'WeekendCalendarIntent',
        userId: 'amzn1.ask.account.STRANGER',
        apl: true,
      }),
    );
    assert.equal(calls.length, 0);
    assert.equal(spokenText(out), SPEECH.household);
    assert.equal(renderDocumentDirective(out), undefined);
    const blob = JSON.stringify(out);
    assert.doesNotMatch(blob, /Private Event|Secret Venue|secret weekend speech/);
    assert.doesNotMatch(blob, /127\.0\.0\.1|Bearer |voice-secret-test-key|cf-client/);
  });

  it('APL hero URL is the public HTTPS artwork and contains no secrets', async () => {
    const { transport } = recordingTransport(async () => ({
      status: 200,
      bodyText: JSON.stringify({ ok: true, speech: CALENDAR_SPEECH, items: [{ title: 'Zoo Fest' }] }),
    }));
    const skill = createSkill({ config: testConfig(), transport });
    const out = await skill.invoke(intentEnvelope({ intent: 'WeekendCalendarIntent', apl: true }));
    const directive = renderDocumentDirective(out);
    const data = (directive?.datasources as { bensonData?: Record<string, unknown> })?.bensonData;
    assert.equal(data?.heroImageUrl, 'https://benson.kckellie.com/icons/benson-kellie-alexa-hero.png');
    assert.equal(data?.hasHero, true);
    const blob = JSON.stringify(directive);
    assert.doesNotMatch(blob, /Bearer |voice-secret|cf-client|alexa\.kckellie\.com|127\.0\.0\.1/);
    assert.match(blob, /best-fit/);
  });

  it('formats display details from Benson fields without inventing values', () => {
    assert.equal(
      formatItemDetail({ title: 'Zoo Fest', day: 'Friday', time: '6:00 PM', venue: 'Kansas City Zoo' }),
      'Friday  ·  6:00 PM  ·  Kansas City Zoo',
    );
    assert.equal(toAplItems([{ title: 'Only Title', day: '', time: null, venue: null }])[0]?.detail, '');
    assert.equal(toAplItems(Array.from({ length: 8 }, (_, i) => ({ title: `E${i + 1}` }))).length, 5);
  });
});
