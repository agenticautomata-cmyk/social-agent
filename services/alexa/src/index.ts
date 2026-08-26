import { SkillBuilders } from 'ask-sdk-core';
import { loadConfig } from './config.js';
import { createStaticHandlers, createVoiceIntentHandler } from './handlers.js';

const config = loadConfig();

export const handler = SkillBuilders.custom()
  .addRequestHandlers(createVoiceIntentHandler({ config }), ...createStaticHandlers({ config }))
  .lambda();

export { createSkill } from './handlers.js';
export { loadConfig } from './config.js';
export { INTENT_TO_PATH, buildBensonHeaders } from './benson-client.js';
export { SPEECH } from './speech.js';
