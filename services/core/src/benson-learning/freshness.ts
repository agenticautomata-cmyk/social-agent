import { computeLifecycleStatus } from '../creator-agent/lifecycle.js';
import type { LifecycleStatus } from '../creator-agent/types.js';
import { daysUntilEvent, isOpeningContent, openingUrgencyBoost } from '../inventory/content-freshness.js';
import type { InventoryItem } from '../inventory/normalize.js';

const MONTH_DAY_RE =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i;
const NUMERIC_DATE_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;

export function parseExplicitDateInText(text: string, now = new Date()): Date | null {
  const monthMatch = MONTH_DAY_RE.exec(text);
  if (monthMatch) {
    const monthNames = [
      'january',
      'february',
      'march',
      'april',
      'may',
      'june',
      'july',
      'august',
      'september',
      'october',
      'november',
      'december',
    ];
    const month = monthNames.indexOf(monthMatch[1]!.toLowerCase());
    const day = Number(monthMatch[2]);
    if (month >= 0 && day >= 1 && day <= 31) {
      let year = now.getFullYear();
      const candidate = new Date(Date.UTC(year, month, day, 23, 59, 59));
      if (candidate.getTime() < now.getTime() - 14 * 24 * 60 * 60 * 1000) {
        year += 1;
      }
      return new Date(Date.UTC(year, month, day, 23, 59, 59));
    }
  }

  const numeric = NUMERIC_DATE_RE.exec(text);
  if (numeric) {
    const month = Number(numeric[1]) - 1;
    const day = Number(numeric[2]);
    const year = numeric[3]
      ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
      : now.getFullYear();
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(Date.UTC(year, month, day, 23, 59, 59));
    }
  }

  return null;
}

export function textReferencesExpiredDate(text: string, now = new Date()): boolean {
  const parsed = parseExplicitDateInText(text, now);
  if (!parsed) return false;
  return parsed.getTime() < now.getTime() - 24 * 60 * 60 * 1000;
}

export function lifecycleForLearningFields(input: {
  title: string;
  eventStartsAt?: Date | string | null;
  eventEndsAt?: Date | string | null;
  discoveredAt?: Date | string | null;
  category?: string | null;
  lifecycleStatus?: string | null;
}): LifecycleStatus {
  if (input.lifecycleStatus) {
    return input.lifecycleStatus as LifecycleStatus;
  }
  return computeLifecycleStatus({
    title: input.title,
    eventStartsAt: input.eventStartsAt ?? null,
    eventEndsAt: input.eventEndsAt ?? null,
    discoveredAt: input.discoveredAt ?? null,
    metadata: { category: input.category ?? null },
  });
}

export function isTimelyForLearning(input: {
  title: string;
  eventStartsAt?: Date | string | null;
  eventEndsAt?: Date | string | null;
  discoveredAt?: Date | string | null;
  category?: string | null;
  lifecycleStatus?: string | null;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  const lifecycle = lifecycleForLearningFields(input);
  if (lifecycle === 'expired' || lifecycle === 'archived') return false;

  if (input.eventStartsAt) {
    const days = daysUntilEvent(
      input.eventStartsAt instanceof Date
        ? input.eventStartsAt.toISOString()
        : String(input.eventStartsAt),
      now,
    );
    if (days != null && days < -1) return false;
  }

  const pseudoItem = {
    title: input.title,
    eventDate:
      input.eventStartsAt instanceof Date
        ? input.eventStartsAt.toISOString()
        : input.eventStartsAt ?? null,
    category: input.category ?? null,
    discoveredAt:
      input.discoveredAt instanceof Date
        ? input.discoveredAt.toISOString()
        : input.discoveredAt ?? null,
    createdAt: now.toISOString(),
    flags: { businessOpening: /\b(opening|grand opening|now open)\b/i.test(input.title) },
  } as Pick<InventoryItem, 'title' | 'eventDate' | 'category' | 'discoveredAt' | 'createdAt' | 'flags'>;

  if (isOpeningContent(pseudoItem as InventoryItem) && openingUrgencyBoost(pseudoItem as InventoryItem, now) <= -25) {
    return false;
  }

  if (textReferencesExpiredDate(input.title, now)) return false;
  return true;
}

export function actionWindowLabel(eventDate: string | null, now = new Date()): string {
  if (!eventDate) return 'ongoing';
  const days = daysUntilEvent(eventDate, now);
  if (days == null) return 'unknown';
  if (days < -1) return 'expired';
  if (days < 0) return 'today';
  if (days <= 7) return `within ${Math.ceil(days)} days`;
  return `on ${eventDate.slice(0, 10)}`;
}
