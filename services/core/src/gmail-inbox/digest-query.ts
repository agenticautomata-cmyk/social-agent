import { env } from '../env.js';

/** Primary + Promotions unread in inbox — newsletters often land in Promotions. */
export function buildDigestUnreadQuery(options?: {
  lookbackDays?: number;
  includePromotions?: boolean;
}): string {
  const lookbackDays = options?.lookbackDays ?? env.GMAIL_DIGEST_LOOKBACK_DAYS ?? 14;
  const includePromotions = options?.includePromotions ?? env.GMAIL_DIGEST_INCLUDE_PROMOTIONS ?? true;
  const categoryClause = includePromotions
    ? '(category:primary OR category:promotions)'
    : 'category:primary';
  return `in:inbox -in:spam -in:trash is:unread newer_than:${lookbackDays}d ${categoryClause}`;
}

export function digestMessageCap(): number {
  return env.GMAIL_DIGEST_MAX_MESSAGES ?? 75;
}
