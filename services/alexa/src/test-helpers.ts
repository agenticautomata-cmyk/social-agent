import assert from 'node:assert/strict';
import type { RequestEnvelope, SessionEndedError } from 'ask-sdk-model';
import type { AlexaAdapterConfig } from './config.js';
import { HTTP_TIMEOUT_MS } from './speech.js';

export function testConfig(overrides: Partial<AlexaAdapterConfig> = {}): AlexaAdapterConfig {
  return {
    voiceBaseUrl: 'https://alexa.kckellie.com',
    voiceApiKey: 'voice-secret-test-key',
    cfAccessClientId: 'cf-client-id-test',
    cfAccessClientSecret: 'cf-client-secret-test',
    allowedUserIds: ['amzn1.ask.account.ALLOWED'],
    httpTimeoutMs: HTTP_TIMEOUT_MS,
    ...overrides,
  };
}

export function intentEnvelope(input: {
  intent: string;
  requestId?: string;
  userId?: string;
  apl?: boolean;
  sessionAttributes?: Record<string, unknown>;
  newSession?: boolean;
}): RequestEnvelope {
  const requestId = input.requestId ?? 'alexa-req-test-001';
  const userId = input.userId ?? 'amzn1.ask.account.ALLOWED';
  return {
    version: '1.0',
    session: {
      new: input.newSession ?? true,
      sessionId: 'amzn1.echo-api.session.test',
      application: { applicationId: 'amzn1.ask.skill.test' },
      user: { userId },
      attributes: input.sessionAttributes ?? {},
    },
    context: {
      System: {
        application: { applicationId: 'amzn1.ask.skill.test' },
        user: { userId },
        device: {
          deviceId: 'amzn1.ask.device.test',
          supportedInterfaces: input.apl ? { 'Alexa.Presentation.APL': {} } : {},
        },
        apiEndpoint: 'https://api.amazonalexa.com',
      },
    },
    request: {
      type: 'IntentRequest',
      requestId,
      timestamp: '2026-08-16T12:00:00Z',
      locale: 'en-US',
      dialogState: 'COMPLETED',
      intent: { name: input.intent, confirmationStatus: 'NONE' },
    },
  };
}

export function launchEnvelope(input: { requestId?: string; userId?: string; apl?: boolean } = {}): RequestEnvelope {
  const envelope = intentEnvelope({
    intent: 'AMAZON.HelpIntent',
    requestId: input.requestId,
    userId: input.userId,
    apl: input.apl,
  });
  envelope.request = {
    type: 'LaunchRequest',
    requestId: input.requestId ?? 'alexa-req-test-001',
    timestamp: '2026-08-16T12:00:00Z',
    locale: 'en-US',
  };
  return envelope;
}

export function spokenText(response: { response?: { outputSpeech?: { type?: string; text?: string; ssml?: string } } }): string {
  const speech = response.response?.outputSpeech;
  if (!speech) return '';
  if (speech.type === 'SSML' && speech.ssml) {
    return speech.ssml.replace(/<\/?speak>/g, '').trim();
  }
  return (speech.text ?? '').trim();
}

export function outputSsml(response: {
  response?: { outputSpeech?: { type?: string; ssml?: string } };
}): string | undefined {
  const speech = response.response?.outputSpeech;
  if (!speech || speech.type !== 'SSML') return undefined;
  return speech.ssml;
}

/** Asserts outputSpeech SSML is a single <speak> document with no raw &/< />, and returns decoded inner text. */
export function decodedSsmlSpeech(ssml: string): string {
  assert.equal(ssml.startsWith('<speak>'), true, 'SSML must start with <speak>');
  assert.equal(ssml.endsWith('</speak>'), true, 'SSML must end with </speak>');
  const inner = ssml.slice('<speak>'.length, -'</speak>'.length);
  const withoutEntities = inner.replace(/&(amp|lt|gt|quot|apos);/g, '');
  assert.doesNotMatch(withoutEntities, /[<>]/);
  assert.doesNotMatch(withoutEntities, /&/);
  return inner
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function sessionEndedEnvelope(input: {
  requestId?: string;
  userId?: string;
  reason?: 'USER_INITIATED' | 'ERROR' | 'EXCEEDED_MAX_REPROMPTS';
  error?: SessionEndedError;
} = {}): RequestEnvelope {
  const requestId = input.requestId ?? 'alexa-session-ended-001';
  const userId = input.userId ?? 'amzn1.ask.account.ALLOWED';
  return {
    version: '1.0',
    session: {
      new: false,
      sessionId: 'amzn1.echo-api.session.test',
      application: { applicationId: 'amzn1.ask.skill.test' },
      user: { userId },
    },
    context: {
      System: {
        application: { applicationId: 'amzn1.ask.skill.test' },
        user: { userId },
        device: {
          deviceId: 'amzn1.ask.device.test',
          supportedInterfaces: {},
        },
        apiEndpoint: 'https://api.amazonalexa.com',
      },
    },
    request: {
      type: 'SessionEndedRequest',
      requestId,
      timestamp: '2026-08-16T12:00:00Z',
      locale: 'en-US',
      reason: input.reason ?? 'ERROR',
      ...(input.error ? { error: input.error } : {}),
    },
  };
}

export function renderDocumentDirective(response: {
  response?: { directives?: Array<{ type?: string; token?: string; document?: unknown; datasources?: unknown }> };
}) {
  return (response.response?.directives ?? []).find((d) => d.type === 'Alexa.Presentation.APL.RenderDocument');
}

export function canFulfillEnvelope(input: {
  intent: string;
  requestId?: string;
  userId?: string | null;
  session?: boolean;
  apl?: boolean;
}): RequestEnvelope {
  const requestId = input.requestId ?? 'alexa-cfir-test-001';
  const includeSession = input.session !== false;
  const includeUserId = input.userId !== null;
  const userId = input.userId || 'amzn1.ask.account.ALLOWED';
  const envelope: RequestEnvelope = {
    version: '1.0',
    context: {
      System: {
        application: { applicationId: 'amzn1.ask.skill.test' },
        user: includeUserId ? { userId } : { userId: '' },
        device: {
          deviceId: 'amzn1.ask.device.test',
          supportedInterfaces: input.apl ? { 'Alexa.Presentation.APL': {} } : {},
        },
        apiEndpoint: 'https://api.amazonalexa.com',
      },
    },
    request: {
      type: 'CanFulfillIntentRequest',
      requestId,
      timestamp: '2026-08-16T12:00:00Z',
      locale: 'en-US',
      intent: { name: input.intent, confirmationStatus: 'NONE' },
    },
  };
  if (includeSession) {
    envelope.session = {
      new: true,
      sessionId: 'amzn1.echo-api.session.test',
      application: { applicationId: 'amzn1.ask.skill.test' },
      user: includeUserId ? { userId } : { userId: '' },
    };
  }
  return envelope;
}

export function canFulfillValue(response: {
  response?: { canFulfillIntent?: { canFulfill?: string } };
}): string | undefined {
  return response.response?.canFulfillIntent?.canFulfill;
}
