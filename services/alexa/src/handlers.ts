import { getIntentName, getRequestType, SkillBuilders } from 'ask-sdk-core';
import type { HandlerInput, RequestHandler, Skill } from 'ask-sdk-core';
import type { Response, SessionEndedRequest } from 'ask-sdk-model';
import { decideAllowlist } from './allowlist.js';
import {
  calendarScreen,
  deviceSupportsApl,
  launchScreen,
  postRecommendationsScreen,
  renderDocumentDirective,
  weekendListScreen,
  type AplScreenData,
} from './apl.js';
import { createCanFulfillHandler } from './can-fulfill.js';
import {
  CONTINUATION_ATTR,
  readContinuationState,
  startContinuation,
  pageFromItems,
  type ContinuationKind,
  type ContinuationState,
} from './continuation.js';
import {
  callBensonVoice,
  INTENT_TO_OPERATION,
  INTENT_TO_PATH,
  type CustomVoiceIntent,
  type HttpTransport,
} from './benson-client.js';
import type { AlexaAdapterConfig } from './config.js';
import { logAdapterEvent, type ResultClass } from './logging.js';
import { SPEECH } from './speech.js';

function requestIdOf(input: HandlerInput): string {
  return input.requestEnvelope.request.requestId;
}

function userIdOf(input: HandlerInput): string | undefined {
  return input.requestEnvelope.context.System.user.userId;
}

function speak(input: HandlerInput, text: string, endSession = false): Response {
  return input.responseBuilder.speak(text).withShouldEndSession(endSession).getResponse();
}

function sessionAttributesOf(input: HandlerInput): Record<string, unknown> {
  try {
    const current = input.attributesManager.getSessionAttributes();
    return current && typeof current === 'object' ? { ...current } : {};
  } catch {
    return {};
  }
}

function continuationKindFor(
  operation: 'weekend_calendar' | 'weekend_list' | 'what_should_kellie_post',
): ContinuationKind {
  if (operation === 'what_should_kellie_post') return 'post_recommendations';
  return operation;
}

function screenForKind(kind: ContinuationKind, items: ContinuationState['items']): AplScreenData {
  if (kind === 'weekend_calendar') return calendarScreen(items);
  if (kind === 'post_recommendations') return postRecommendationsScreen(items);
  return weekendListScreen(items);
}

function respond(
  input: HandlerInput,
  text: string,
  endSession: boolean,
  screen: AplScreenData | null,
  continuation: ContinuationState | null,
): Response {
  const builder = input.responseBuilder.speak(text);
  if (screen && deviceSupportsApl(input.requestEnvelope)) {
    builder.addDirective(renderDocumentDirective(screen));
  }
  const attrs = sessionAttributesOf(input);
  if (continuation) attrs[CONTINUATION_ATTR] = continuation;
  else delete attrs[CONTINUATION_ATTR];
  try {
    input.attributesManager.setSessionAttributes(attrs);
  } catch {
    // CanFulfill / missing session — ignore.
  }
  if (endSession) {
    return builder.withShouldEndSession(true).getResponse();
  }
  if (continuation) {
    return builder.reprompt(SPEECH.moreReprompt).withShouldEndSession(false).getResponse();
  }
  return builder.withShouldEndSession(false).getResponse();
}

function secretsFrom(config: AlexaAdapterConfig): string[] {
  return [config.voiceApiKey, config.cfAccessClientId, config.cfAccessClientSecret].filter(Boolean);
}

function isCustomVoiceIntent(name: string): name is CustomVoiceIntent {
  return name in INTENT_TO_PATH;
}

export type AdapterDeps = {
  config: AlexaAdapterConfig;
  transport?: HttpTransport;
  now?: () => number;
  writeLog?: (line: string) => void;
};

export function createVoiceIntentHandler(deps: AdapterDeps): RequestHandler {
  return {
    canHandle(input) {
      if (getRequestType(input.requestEnvelope) !== 'IntentRequest') return false;
      return isCustomVoiceIntent(getIntentName(input.requestEnvelope));
    },
    async handle(input) {
      const started = (deps.now ?? Date.now)();
      const intent = getIntentName(input.requestEnvelope) as CustomVoiceIntent;
      const requestId = requestIdOf(input);
      const userId = userIdOf(input);
      const decision = decideAllowlist(userId, deps.config.allowedUserIds);
      const operation = INTENT_TO_OPERATION[intent];

      if (decision.kind === 'setup_required') {
        logAdapterEvent(
          {
            service: 'benson-alexa-adapter',
            message: 'alexa_adapter',
            requestId,
            intent,
            authorized: false,
            operation: 'none',
            durationMs: (deps.now ?? Date.now)() - started,
            resultClass: 'setup_required',
            setupUserId: decision.userId,
          },
          secretsFrom(deps.config),
          deps.writeLog,
        );
        return speak(input, SPEECH.setup, true);
      }

      if (decision.kind === 'unauthorized') {
        logAdapterEvent(
          {
            service: 'benson-alexa-adapter',
            message: 'alexa_adapter',
            requestId,
            intent,
            authorized: false,
            operation: 'none',
            durationMs: (deps.now ?? Date.now)() - started,
            resultClass: 'unauthorized_user',
          },
          secretsFrom(deps.config),
          deps.writeLog,
        );
        return speak(input, SPEECH.household, true);
      }

      const result = await callBensonVoice(
        deps.config,
        intent,
        requestId,
        deps.transport,
      );
      const spoken =
        result.resultClass === 'ok' && result.speech
          ? result.speech
          : result.resultClass === 'timeout'
            ? SPEECH.timeout
            : SPEECH.unreachable;
      const resultClass: ResultClass = result.resultClass;
      logAdapterEvent(
        {
          service: 'benson-alexa-adapter',
          message: 'alexa_adapter',
          requestId,
          intent,
          authorized: true,
          operation,
          latencyMs: result.latencyMs,
          httpStatus: result.status,
          durationMs: (deps.now ?? Date.now)() - started,
          resultClass,
        },
        secretsFrom(deps.config),
        deps.writeLog,
      );
      if (result.resultClass !== 'ok' || !result.speech) {
        return respond(input, spoken, true, null, null);
      }
      const kind = continuationKindFor(operation);
      const page = startContinuation(kind, result.items, result.speech);
      return respond(
        input,
        page.speech,
        page.endSession,
        screenForKind(kind, page.pageItems),
        page.nextState,
      );
    },
  };
}

export function createStaticHandlers(deps: AdapterDeps): RequestHandler[] {
  const logStatic = (input: HandlerInput, intent: string, resultClass: ResultClass) => {
    logAdapterEvent(
      {
        service: 'benson-alexa-adapter',
        message: 'alexa_adapter',
        requestId: requestIdOf(input),
        intent,
        authorized: true,
        operation: 'none',
        durationMs: 0,
        resultClass,
      },
      secretsFrom(deps.config),
      deps.writeLog,
    );
  };

  const more: RequestHandler = {
    canHandle(input) {
      return (
        getRequestType(input.requestEnvelope) === 'IntentRequest' &&
        getIntentName(input.requestEnvelope) === 'MoreResultsIntent'
      );
    },
    handle(input) {
      const started = (deps.now ?? Date.now)();
      const requestId = requestIdOf(input);
      const userId = userIdOf(input);
      const decision = decideAllowlist(userId, deps.config.allowedUserIds);

      if (decision.kind === 'setup_required') {
        logAdapterEvent(
          {
            service: 'benson-alexa-adapter',
            message: 'alexa_adapter',
            requestId,
            intent: 'MoreResultsIntent',
            authorized: false,
            operation: 'none',
            durationMs: (deps.now ?? Date.now)() - started,
            resultClass: 'setup_required',
            setupUserId: decision.userId,
          },
          secretsFrom(deps.config),
          deps.writeLog,
        );
        return respond(input, SPEECH.setup, true, null, null);
      }

      if (decision.kind === 'unauthorized') {
        logAdapterEvent(
          {
            service: 'benson-alexa-adapter',
            message: 'alexa_adapter',
            requestId,
            intent: 'MoreResultsIntent',
            authorized: false,
            operation: 'none',
            durationMs: (deps.now ?? Date.now)() - started,
            resultClass: 'unauthorized_user',
          },
          secretsFrom(deps.config),
          deps.writeLog,
        );
        return respond(input, SPEECH.household, true, null, null);
      }

      const state = readContinuationState(sessionAttributesOf(input)[CONTINUATION_ATTR]);
      const page = state ? pageFromItems(state.type, state.items, state.offset) : null;
      logAdapterEvent(
        {
          service: 'benson-alexa-adapter',
          message: 'alexa_adapter',
          requestId,
          intent: 'MoreResultsIntent',
          authorized: true,
          operation: state?.type ?? 'none',
          durationMs: (deps.now ?? Date.now)() - started,
          resultClass: 'ok',
        },
        secretsFrom(deps.config),
        deps.writeLog,
      );
      if (!page) {
        return respond(input, SPEECH.moreWithoutContext, true, null, null);
      }
      return respond(
        input,
        page.speech,
        page.endSession,
        screenForKind(state!.type, page.pageItems),
        page.nextState,
      );
    },
  };

  const launch: RequestHandler = {
    canHandle(input) {
      return getRequestType(input.requestEnvelope) === 'LaunchRequest';
    },
    handle(input) {
      logStatic(input, 'LaunchRequest', 'ok');
      return respond(input, SPEECH.help, false, launchScreen(), null);
    },
  };

  const help: RequestHandler = {
    canHandle(input) {
      return (
        getRequestType(input.requestEnvelope) === 'IntentRequest' &&
        getIntentName(input.requestEnvelope) === 'AMAZON.HelpIntent'
      );
    },
    handle(input) {
      logStatic(input, 'AMAZON.HelpIntent', 'ok');
      return speak(input, SPEECH.help, false);
    },
  };

  const stop: RequestHandler = {
    canHandle(input) {
      if (getRequestType(input.requestEnvelope) !== 'IntentRequest') return false;
      const name = getIntentName(input.requestEnvelope);
      return name === 'AMAZON.StopIntent' || name === 'AMAZON.CancelIntent';
    },
    handle(input) {
      logStatic(input, getIntentName(input.requestEnvelope), 'ok');
      return speak(input, SPEECH.stop, true);
    },
  };

  const sessionEnded: RequestHandler = {
    canHandle(input) {
      return getRequestType(input.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(input) {
      const request = input.requestEnvelope.request as SessionEndedRequest;
      const error =
        request.error && (request.error.type || request.error.message)
          ? {
              ...(request.error.type ? { type: request.error.type } : {}),
              ...(request.error.message ? { message: request.error.message } : {}),
            }
          : undefined;
      logAdapterEvent(
        {
          service: 'benson-alexa-adapter',
          message: 'alexa_adapter',
          requestId: requestIdOf(input),
          intent: 'SessionEndedRequest',
          authorized: true,
          operation: 'none',
          durationMs: 0,
          resultClass: 'ok',
          reason: request.reason,
          ...(error ? { error } : {}),
        },
        secretsFrom(deps.config),
        deps.writeLog,
      );
      return input.responseBuilder.getResponse();
    },
  };

  const fallback: RequestHandler = {
    canHandle(input) {
      return getRequestType(input.requestEnvelope) !== 'SessionEndedRequest';
    },
    handle(input) {
      const intent =
        getRequestType(input.requestEnvelope) === 'IntentRequest'
          ? getIntentName(input.requestEnvelope)
          : getRequestType(input.requestEnvelope);
      logStatic(input, intent, 'ok');
      return speak(input, SPEECH.help, false);
    },
  };

  return [createCanFulfillHandler(), more, launch, help, stop, sessionEnded, fallback];
}

export function createSkill(deps: AdapterDeps): Skill {
  return SkillBuilders.custom()
    .addRequestHandlers(createVoiceIntentHandler(deps), ...createStaticHandlers(deps))
    .create();
}
