import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INTENT_TO_PATH, type HttpTransport } from './benson-client.js';
import { createSkill } from './handlers.js';
import { SPEECH } from './speech.js';
import { intentEnvelope, sessionEndedEnvelope, spokenText, testConfig } from './test-helpers.js';

function recordingTransport(impl: HttpTransport) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
  const transport: HttpTransport = async (input) => {
    calls.push({ url: input.url, method: input.method, headers: input.headers });
    return impl(input);
  };
  return { transport, calls };
}

function okBody(speech: string) {
  return { status: 200, bodyText: JSON.stringify({ ok: true, speech }) };
}

describe('alexa adapter', () => {
  it('WeekendCalendarIntent uses the hardcoded GET and four headers, and speaks Benson speech unchanged', async () => {
    const logs: string[] = [];
    const { transport, calls } = recordingTransport(async () =>
      okBody('Benson found 2 things this weekend. The first few are Zoo Fest at the Kansas City Zoo, and Panda Fest at Legends Field.'),
    );
    const skill = createSkill({
      config: testConfig(),
      transport,
      writeLog: (line) => logs.push(line),
    });
    const requestId = 'alexa-req-cal-14';
    const out = await skill.invoke(
      intentEnvelope({ intent: 'WeekendCalendarIntent', requestId }),
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, 'GET');
    assert.equal(calls[0]?.url, `https://alexa.kckellie.com${INTENT_TO_PATH.WeekendCalendarIntent}`);
    assert.equal(calls[0]?.headers.Authorization, 'Bearer voice-secret-test-key');
    assert.equal(calls[0]?.headers['CF-Access-Client-Id'], 'cf-client-id-test');
    assert.equal(calls[0]?.headers['CF-Access-Client-Secret'], 'cf-client-secret-test');
    assert.equal(calls[0]?.headers['x-benson-request-id'], requestId);
    assert.equal(
      spokenText(out),
      'Benson found 2 things this weekend. The first few are Zoo Fest at the Kansas City Zoo, and Panda Fest at Legends Field.',
    );
    assert.match(logs.join('\n'), /"resultClass":"ok"/);
    assert.match(logs.join('\n'), /"operation":"weekend_calendar"/);
  });

  it('WeekendListIntent uses the list GET and leaves speech unchanged', async () => {
    const { transport, calls } = recordingTransport(async () =>
      okBody('There are 3 items on the weekend list. They are 816 Day at Power and Light.'),
    );
    const skill = createSkill({ config: testConfig(), transport });
    const out = await skill.invoke(intentEnvelope({ intent: 'WeekendListIntent' }));
    assert.equal(calls[0]?.url, `https://alexa.kckellie.com${INTENT_TO_PATH.WeekendListIntent}`);
    assert.equal(
      spokenText(out),
      'There are 3 items on the weekend list. They are 816 Day at Power and Light.',
    );
  });

  it('WhatShouldKelliePostIntent maps to the exact GET and sends four production auth headers', async () => {
    const logs: string[] = [];
    const speech =
      "Kellie's strongest post today is the Bags and Shoes painting workshop. It's timely, visual, and fits her Kansas City discovery lane. I have two more if you want them.";
    const { transport, calls } = recordingTransport(async () => ({
      status: 200,
      bodyText: JSON.stringify({
        ok: true,
        speech,
        items: [
          {
            title: 'Bags and Shoes painting workshop',
            reason: "It's timely, visual, and fits her Kansas City discovery lane.",
            when: 'Today',
            area: 'Crossroads',
            day: "It's timely, visual, and fits her Kansas City discovery lane.",
            time: 'Today',
            venue: 'Crossroads',
          },
          {
            title: 'Plaza boutique pop-up',
            reason: 'Strong shopping film.',
            when: 'Tonight',
            area: 'Plaza',
            day: 'Strong shopping film.',
            time: 'Tonight',
            venue: 'Plaza',
          },
          {
            title: 'Riverside thrift haul',
            reason: 'Visual discovery pick.',
            when: null,
            area: 'Riverside',
            day: 'Visual discovery pick.',
            time: null,
            venue: 'Riverside',
          },
        ],
      }),
    }));
    const skill = createSkill({
      config: testConfig(),
      transport,
      writeLog: (line) => logs.push(line),
    });
    const requestId = 'alexa-req-post-01';
    const out = await skill.invoke(
      intentEnvelope({ intent: 'WhatShouldKelliePostIntent', requestId }),
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, 'GET');
    assert.equal(
      calls[0]?.url,
      `https://alexa.kckellie.com${INTENT_TO_PATH.WhatShouldKelliePostIntent}`,
    );
    assert.equal(calls[0]?.headers.Authorization, 'Bearer voice-secret-test-key');
    assert.equal(calls[0]?.headers['CF-Access-Client-Id'], 'cf-client-id-test');
    assert.equal(calls[0]?.headers['CF-Access-Client-Secret'], 'cf-client-secret-test');
    assert.equal(calls[0]?.headers['x-benson-request-id'], requestId);
    assert.equal(spokenText(out), speech);
    assert.equal(out.response.shouldEndSession, false);
    assert.match(logs.join('\n'), /"operation":"what_should_kellie_post"/);
  });

  it('unauthorized WhatShouldKelliePostIntent leaks no recommendation', async () => {
    const { transport, calls } = recordingTransport(async () =>
      okBody("Kellie's strongest post today is Secret Workshop."),
    );
    const skill = createSkill({ config: testConfig(), transport });
    const out = await skill.invoke(
      intentEnvelope({
        intent: 'WhatShouldKelliePostIntent',
        userId: 'amzn1.ask.account.STRANGER',
      }),
    );
    assert.equal(calls.length, 0);
    assert.equal(spokenText(out), SPEECH.household);
    assert.doesNotMatch(spokenText(out), /Secret Workshop|strongest post/i);
  });

  it('Help is static and makes zero HTTP calls', async () => {
    const { transport, calls } = recordingTransport(async () => okBody('nope'));
    const skill = createSkill({ config: testConfig(), transport });
    const out = await skill.invoke(intentEnvelope({ intent: 'AMAZON.HelpIntent' }));
    assert.equal(calls.length, 0);
    assert.equal(spokenText(out), SPEECH.help);
  });

  it('Stop and Cancel close without HTTP', async () => {
    const { transport, calls } = recordingTransport(async () => okBody('nope'));
    const skill = createSkill({ config: testConfig(), transport });
    const stop = await skill.invoke(intentEnvelope({ intent: 'AMAZON.StopIntent' }));
    const cancel = await skill.invoke(intentEnvelope({ intent: 'AMAZON.CancelIntent' }));
    assert.equal(calls.length, 0);
    assert.equal(spokenText(stop), SPEECH.stop);
    assert.equal(spokenText(cancel), SPEECH.stop);
  });

  it('unknown intent is static help with zero HTTP calls', async () => {
    const { transport, calls } = recordingTransport(async () => okBody('nope'));
    const skill = createSkill({ config: testConfig(), transport });
    const out = await skill.invoke(intentEnvelope({ intent: 'AnalyticsIntent' }));
    assert.equal(calls.length, 0);
    assert.equal(spokenText(out), SPEECH.help);
  });

  it('allowed user proceeds to Benson', async () => {
    const { transport, calls } = recordingTransport(async () => okBody('ok speech'));
    const skill = createSkill({ config: testConfig(), transport });
    await skill.invoke(intentEnvelope({ intent: 'WeekendListIntent', userId: 'amzn1.ask.account.ALLOWED' }));
    assert.equal(calls.length, 1);
  });

  it('unknown user is refused with zero Benson calls', async () => {
    const { transport, calls } = recordingTransport(async () => okBody('nope'));
    const skill = createSkill({ config: testConfig(), transport });
    const out = await skill.invoke(
      intentEnvelope({ intent: 'WeekendCalendarIntent', userId: 'amzn1.ask.account.STRANGER' }),
    );
    assert.equal(calls.length, 0);
    assert.equal(spokenText(out), SPEECH.household);
  });

  it('empty allowlist fails closed, speaks setup copy, and logs userId only then', async () => {
    const logs: string[] = [];
    const { transport, calls } = recordingTransport(async () => okBody('nope'));
    const skill = createSkill({
      config: testConfig({ allowedUserIds: [] }),
      transport,
      writeLog: (line) => logs.push(line),
    });
    const out = await skill.invoke(
      intentEnvelope({ intent: 'WeekendListIntent', userId: 'amzn1.ask.account.SETUP' }),
    );
    assert.equal(calls.length, 0);
    assert.equal(spokenText(out), SPEECH.setup);
    assert.match(logs.join('\n'), /setup_required/);
    assert.match(logs.join('\n'), /amzn1\.ask\.account\.SETUP/);
  });

  it('populated allowlist does not log complete user IDs', async () => {
    const logs: string[] = [];
    const { transport } = recordingTransport(async () => okBody('ok speech'));
    const skill = createSkill({
      config: testConfig(),
      transport,
      writeLog: (line) => logs.push(line),
    });
    await skill.invoke(intentEnvelope({ intent: 'WeekendListIntent' }));
    const blob = logs.join('\n');
    assert.doesNotMatch(blob, /amzn1\.ask\.account\.ALLOWED/);
    assert.match(blob, /"authorized":true/);
  });

  it('Benson timeout uses timeout speech', async () => {
    const { transport } = recordingTransport(async ({ signal }) => {
      await new Promise<void>((_, reject) => {
        signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
      return okBody('late');
    });
    const skill = createSkill({
      config: testConfig({ httpTimeoutMs: 20 }),
      transport,
    });
    const out = await skill.invoke(intentEnvelope({ intent: 'WeekendCalendarIntent' }));
    assert.equal(spokenText(out), SPEECH.timeout);
  });

  it('network failure uses unreachable speech', async () => {
    const { transport } = recordingTransport(async () => {
      throw new Error('ECONNREFUSED');
    });
    const skill = createSkill({ config: testConfig(), transport });
    const out = await skill.invoke(intentEnvelope({ intent: 'WeekendListIntent' }));
    assert.equal(spokenText(out), SPEECH.unreachable);
  });

  it('401 and 403 use unreachable speech', async () => {
    for (const status of [401, 403]) {
      const { transport } = recordingTransport(async () => ({ status, bodyText: 'no' }));
      const skill = createSkill({ config: testConfig(), transport });
      const out = await skill.invoke(intentEnvelope({ intent: 'WeekendListIntent' }));
      assert.equal(spokenText(out), SPEECH.unreachable);
    }
  });

  it('500 uses unreachable speech', async () => {
    const { transport } = recordingTransport(async () => ({ status: 500, bodyText: 'err' }));
    const skill = createSkill({ config: testConfig(), transport });
    const out = await skill.invoke(intentEnvelope({ intent: 'WeekendCalendarIntent' }));
    assert.equal(spokenText(out), SPEECH.unreachable);
  });

  it('malformed Benson JSON uses unreachable speech and benson_error class', async () => {
    const logs: string[] = [];
    const { transport } = recordingTransport(async () => ({ status: 200, bodyText: '{not-json' }));
    const skill = createSkill({
      config: testConfig(),
      transport,
      writeLog: (line) => logs.push(line),
    });
    const out = await skill.invoke(intentEnvelope({ intent: 'WeekendListIntent' }));
    assert.equal(spokenText(out), SPEECH.unreachable);
    assert.match(logs.join('\n'), /"resultClass":"benson_error"/);
  });

  it('forwards the exact Alexa requestId as x-benson-request-id', async () => {
    const { transport, calls } = recordingTransport(async () => okBody('ok'));
    const skill = createSkill({ config: testConfig(), transport });
    const requestId = 'amzn1.echo-api.request.exact-correlation-id';
    await skill.invoke(intentEnvelope({ intent: 'WeekendCalendarIntent', requestId }));
    assert.equal(calls[0]?.headers['x-benson-request-id'], requestId);
  });

  it('does not log secrets', async () => {
    const logs: string[] = [];
    const { transport } = recordingTransport(async () => okBody('ok'));
    const config = testConfig();
    const skill = createSkill({
      config,
      transport,
      writeLog: (line) => logs.push(line),
    });
    await skill.invoke(intentEnvelope({ intent: 'WeekendListIntent' }));
    const blob = logs.join('\n');
    assert.doesNotMatch(blob, /voice-secret-test-key/);
    assert.doesNotMatch(blob, /cf-client-id-test/);
    assert.doesNotMatch(blob, /cf-client-secret-test/);
    assert.doesNotMatch(blob, /Bearer /);
  });

  it('localhost-style config omits Cloudflare headers without changing production header set', async () => {
    const { transport, calls } = recordingTransport(async () => okBody('local ok'));
    const skill = createSkill({
      config: testConfig({
        voiceBaseUrl: 'http://127.0.0.1:4000',
        cfAccessClientId: '',
        cfAccessClientSecret: '',
      }),
      transport,
    });
    await skill.invoke(intentEnvelope({ intent: 'WeekendListIntent' }));
    assert.equal(calls[0]?.headers.Authorization, 'Bearer voice-secret-test-key');
    assert.equal(calls[0]?.headers['x-benson-request-id'], 'alexa-req-test-001');
    assert.equal(calls[0]?.headers['CF-Access-Client-Id'], undefined);
    assert.equal(calls[0]?.headers['CF-Access-Client-Secret'], undefined);
  });

  it('SessionEndedRequest returns no speech, APL, or HTTP and logs reason/error safely', async () => {
    const logs: string[] = [];
    const { transport, calls } = recordingTransport(async () => okBody('nope'));
    const skill = createSkill({
      config: testConfig(),
      transport,
      writeLog: (line) => logs.push(line),
    });
    const out = await skill.invoke(
      sessionEndedEnvelope({
        requestId: 'alexa-session-ended-err',
        reason: 'ERROR',
        error: {
          type: 'INVALID_RESPONSE',
          message: 'Invalid SSML in outputSpeech voice-secret-test-key',
        },
      }),
    );
    assert.equal(calls.length, 0);
    assert.equal(out.response.outputSpeech, undefined);
    assert.equal(out.response.reprompt, undefined);
    assert.ok(!out.response.directives || out.response.directives.length === 0);
    const blob = logs.join('\n');
    assert.match(blob, /"service":"benson-alexa-adapter"/);
    assert.match(blob, /"message":"alexa_adapter"/);
    assert.match(blob, /"requestId":"alexa-session-ended-err"/);
    assert.match(blob, /"reason":"ERROR"/);
    assert.match(blob, /"type":"INVALID_RESPONSE"/);
    assert.match(blob, /Invalid SSML in outputSpeech/);
    assert.doesNotMatch(blob, /voice-secret-test-key/);
  });
});
