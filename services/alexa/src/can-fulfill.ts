import { getRequestType } from 'ask-sdk-core';
import type { HandlerInput, RequestHandler } from 'ask-sdk-core';
import type { RequestEnvelope, canfulfill } from 'ask-sdk-model';
import { INTENT_TO_PATH } from './benson-client.js';

/** Intents in the live Benson interaction model that CFIR must answer. */
export const INTERACTION_MODEL_INTENTS = [
  'WeekendCalendarIntent',
  'WeekendListIntent',
  'WhatShouldKelliePostIntent',
  'MoreResultsIntent',
  'AMAZON.HelpIntent',
  'AMAZON.StopIntent',
  'AMAZON.CancelIntent',
] as const;

export function canFulfillForIntent(intentName: string): canfulfill.CanFulfillIntentValues {
  if (intentName in INTENT_TO_PATH || intentName === 'MoreResultsIntent') return 'YES';
  return 'NO';
}

export function canFulfillIntentName(envelope: RequestEnvelope): string {
  const request = envelope.request;
  if (request.type !== 'CanFulfillIntentRequest') return '';
  return request.intent?.name ?? '';
}

export function createCanFulfillHandler(): RequestHandler {
  return {
    canHandle(input) {
      return getRequestType(input.requestEnvelope) === 'CanFulfillIntentRequest';
    },
    handle(input: HandlerInput) {
      const canFulfill = canFulfillForIntent(canFulfillIntentName(input.requestEnvelope));
      return input.responseBuilder.withCanFulfillIntent({ canFulfill }).getResponse();
    },
  };
}
