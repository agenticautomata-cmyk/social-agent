import { env } from '../env.js';
import { getChannelEmail } from '../creator-info/channels.js';

/** High-urgency aliases must reach Telegram even if already read or outside Primary. */
export function buildPriorityAliasQuery(lookbackDays: number): string {
  const aliases = [
    getChannelEmail('sponsors'),
    getChannelEmail('booking'),
    getChannelEmail('collabs'),
    getChannelEmail('media'),
    getChannelEmail('contact'),
  ]
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  const unique = [...new Set(aliases)];
  if (unique.length === 0) return '';

  const clauses = unique.flatMap((email) => [
    `to:${email}`,
    `cc:${email}`,
    `deliveredto:${email}`,
  ]);
  return `in:inbox -in:spam -in:trash newer_than:${lookbackDays}d (${clauses.join(' OR ')})`;
}

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
  const unreadPrimary = `in:inbox -in:spam -in:trash is:unread newer_than:${lookbackDays}d ${categoryClause}`;
  const priorityAliases = buildPriorityAliasQuery(lookbackDays);
  if (!priorityAliases) return unreadPrimary;
  return `((${unreadPrimary}) OR (${priorityAliases}))`;
}

export function digestMessageCap(): number {
  return env.GMAIL_DIGEST_MAX_MESSAGES ?? 75;
}
