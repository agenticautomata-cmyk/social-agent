const ANALYTICS_PATTERNS =
  /\b(why|how come|explain|walk me through|compare|versus|vs\.?|what drives|what caused|hypothesis|correlation|trend|trends|drivers|metric|metrics|engagement rate|performance index|median|distribution|sample size|week over week|month over week|underperform|outperform|declin|rising|stable|what if|deeper|dig into|break down|analyze|analysis|intellectual|theory|tradeoff|trade-off)\b/i;

const GREETING_PATTERNS =
  /^(hi|hello|hey|yo|sup|howdy|good morning|good afternoon|good evening|good day|what's up|whats up|how are you|morning|evening)(\s+benson|\s+there)?$/i;

const OPERATIONAL_IN_GREETING =
  /\b(post|pitch|metric|view|sponsor|tiktok|analytics|content|schedule|who should|what should|why|how|compare|best|worst|perform|numbers|data)\b/i;

export function normalizeGreetingMessage(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/[!?.]+$/g, '')
    .replace(/\s+/g, ' ');
}

/** Casual hello / small talk — not a request for metrics or operational advice. */
export function isCasualGreeting(message: string): boolean {
  const normalized = normalizeGreetingMessage(message);
  if (!normalized || normalized.length > 50) return false;
  if (OPERATIONAL_IN_GREETING.test(normalized)) return false;
  return GREETING_PATTERNS.test(normalized);
}

export function isAnalyticsConversation(
  message: string,
  historyLength: number,
): boolean {
  if (isCasualGreeting(message)) return false;
  if (historyLength > 0) return true;
  return ANALYTICS_PATTERNS.test(message);
}
