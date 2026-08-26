import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { INTERACTION_MODEL_INTENTS, canFulfillForIntent } from './can-fulfill.js';
import { createSkill } from './handlers.js';
import type { HttpTransport } from './benson-client.js';
import {
  canFulfillEnvelope,
  canFulfillValue,
  renderDocumentDirective,
  spokenText,
  testConfig,
} from './test-helpers.js';

function recordingTransport(impl: HttpTransport) {
  const calls: Array<{ url: string }> = [];
  const transport: HttpTransport = async (input) => {
    calls.push({ url: input.url });
    return impl(input);
  };
  return { transport, calls };
}

async function invokeCfir(intent: string, extras: Parameters<typeof canFulfillEnvelope>[0] extends infer T ? Omit<T, 'intent'> : never = {}) {
  const { transport, calls } = recordingTransport(async () => {
    throw new Error('CFIR must not call Benson');
  });
  const logs: string[] = [];
  const skill = createSkill({
    config: testConfig({ allowedUserIds: [] }),
    transport,
    writeLog: (line) => logs.push(line),
  });
  const out = await skill.invoke(canFulfillEnvelope({ intent, ...extras }));
  return { out, calls, logs };
}

describe('CanFulfillIntentRequest', () => {
  it('WeekendCalendarIntent CFIR is YES with zero HTTP', async () => {
    const { out, calls } = await invokeCfir('WeekendCalendarIntent');
    assert.equal(canFulfillValue(out), 'YES');
    assert.equal(calls.length, 0);
    assert.equal(spokenText(out), '');
    assert.equal(renderDocumentDirective(out), undefined);
  });

  it('WeekendListIntent CFIR is YES with zero HTTP', async () => {
    const { out, calls } = await invokeCfir('WeekendListIntent');
    assert.equal(canFulfillValue(out), 'YES');
    assert.equal(calls.length, 0);
    assert.equal(spokenText(out), '');
    assert.equal(renderDocumentDirective(out), undefined);
  });

  it('WhatShouldKelliePostIntent CFIR is YES with zero HTTP', async () => {
    const { out, calls } = await invokeCfir('WhatShouldKelliePostIntent');
    assert.equal(canFulfillValue(out), 'YES');
    assert.equal(calls.length, 0);
    assert.equal(spokenText(out), '');
    assert.equal(renderDocumentDirective(out), undefined);
  });

  it('Help CFIR is NO with zero HTTP', async () => {
    const { out, calls } = await invokeCfir('AMAZON.HelpIntent');
    assert.equal(canFulfillValue(out), 'NO');
    assert.equal(calls.length, 0);
  });

  it('Stop CFIR is NO with zero HTTP', async () => {
    const { out, calls } = await invokeCfir('AMAZON.StopIntent');
    assert.equal(canFulfillValue(out), 'NO');
    assert.equal(calls.length, 0);
  });

  it('Cancel CFIR is NO with zero HTTP', async () => {
    const { out, calls } = await invokeCfir('AMAZON.CancelIntent');
    assert.equal(canFulfillValue(out), 'NO');
    assert.equal(calls.length, 0);
  });

  it('unknown intent CFIR is NO with zero HTTP', async () => {
    const { out, calls } = await invokeCfir('AnalyticsIntent');
    assert.equal(canFulfillValue(out), 'NO');
    assert.equal(calls.length, 0);
  });

  it('works with no session', async () => {
    const { out, calls } = await invokeCfir('WeekendCalendarIntent', { session: false });
    assert.equal(canFulfillValue(out), 'YES');
    assert.equal(calls.length, 0);
    assert.equal(spokenText(out), '');
    assert.equal(renderDocumentDirective(out), undefined);
  });

  it('works with no userId', async () => {
    const { out, calls } = await invokeCfir('WeekendListIntent', { userId: null, session: false });
    assert.equal(canFulfillValue(out), 'YES');
    assert.equal(calls.length, 0);
  });

  it('does not attach APL or speech even on an APL-capable device', async () => {
    const { out, calls, logs } = await invokeCfir('WeekendCalendarIntent', { apl: true, session: false, userId: null });
    assert.equal(canFulfillValue(out), 'YES');
    assert.equal(calls.length, 0);
    assert.equal(spokenText(out), '');
    assert.equal(renderDocumentDirective(out), undefined);
    assert.equal(logs.length, 0);
  });

  it('MoreResultsIntent CFIR is YES with zero HTTP', async () => {
    const { out, calls } = await invokeCfir('MoreResultsIntent');
    assert.equal(canFulfillValue(out), 'YES');
    assert.equal(calls.length, 0);
  });

  it('covers every interaction-model intent exhaustively', () => {
    assert.equal(canFulfillForIntent('WeekendCalendarIntent'), 'YES');
    assert.equal(canFulfillForIntent('WeekendListIntent'), 'YES');
    assert.equal(canFulfillForIntent('WhatShouldKelliePostIntent'), 'YES');
    for (const intent of INTERACTION_MODEL_INTENTS) {
      const expected =
        intent === 'WeekendCalendarIntent' ||
        intent === 'WeekendListIntent' ||
        intent === 'WhatShouldKelliePostIntent' ||
        intent === 'MoreResultsIntent'
          ? 'YES'
          : 'NO';
      assert.equal(canFulfillForIntent(intent), expected, intent);
    }
    assert.equal(canFulfillForIntent('MoreResultsIntent'), 'YES');
    assert.equal(canFulfillForIntent('AMAZON.FallbackIntent'), 'NO');
  });
});
