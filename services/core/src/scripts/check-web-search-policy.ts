import { env } from '../env.js';
import { shouldSkipBackgroundLlm } from '../llm-spend/index.js';

const gate = await shouldSkipBackgroundLlm('web_search');
console.log(
  JSON.stringify(
    {
      BENSON_WEB_SEARCH_ENABLED: env.BENSON_WEB_SEARCH_ENABLED,
      BENSON_LLM_DAILY_BUDGET_USD: env.BENSON_LLM_DAILY_BUDGET_USD,
      backgroundWebSearchGate: gate,
    },
    null,
    2,
  ),
);
