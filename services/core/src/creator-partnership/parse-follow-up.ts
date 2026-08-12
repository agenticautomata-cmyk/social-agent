import { getCreatorTimezone, getLocalCalendarDay, localHourInTimezone } from '../datetime.js';
import { env } from '../env.js';

const DEFAULT_FOLLOW_UP_DAYS = 7;
const DEFAULT_BUSINESS_REMINDER_HOUR = 9;

function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added += 1;
  }
  return result;
}

export function getBusinessReminderHour(): number {
  const raw = env.CREATOR_BUSINESS_REMINDER_HOUR;
  if (raw == null || raw === '') return DEFAULT_BUSINESS_REMINDER_HOUR;
  const hour = Number(raw);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return DEFAULT_BUSINESS_REMINDER_HOUR;
  return hour;
}

/**
 * Keep the creator-local calendar day from `date`, but snap the clock to the configured
 * business reminder hour (default 9 AM in CREATOR_TIMEZONE).
 */
export function snapToBusinessReminderHour(
  date: Date,
  timezone = getCreatorTimezone(),
  hour = getBusinessReminderHour(),
): Date {
  const dayKey = getLocalCalendarDay(date, timezone);
  const [year, month, day] = dayKey.split('-').map(Number);

  for (let utcHour = 0; utcHour < 48; utcHour += 1) {
    const candidate = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, utcHour, 0, 0));
    if (getLocalCalendarDay(candidate, timezone) !== dayKey) continue;
    if (localHourInTimezone(candidate, timezone) === hour) return candidate;
  }

  const fallback = new Date(date);
  fallback.setHours(hour, 0, 0, 0);
  return fallback;
}

function finalizeBusinessDayReminder(businessDayBoundary: Date): Date {
  return snapToBusinessReminderHour(businessDayBoundary);
}

/** Parse explicit response timing from email text; fall back to configurable default. */
export function parseFollowUpFromEmail(text: string, receivedAt = new Date()): Date {
  const normalized = text.replace(/\s+/g, ' ');

  const businessDaysRange = normalized.match(/\b(\d+)\s*(?:-|to|–)\s*(\d+)\s+business days?\b/i);
  if (businessDaysRange) {
    const upper = Number(businessDaysRange[2]);
    if (Number.isFinite(upper) && upper > 0) {
      return finalizeBusinessDayReminder(addBusinessDays(receivedAt, upper));
    }
  }

  const businessDaysSingle = normalized.match(/\bwithin\s+(\d+)\s+business days?\b/i);
  if (businessDaysSingle) {
    const days = Number(businessDaysSingle[1]);
    if (Number.isFinite(days) && days > 0) {
      return finalizeBusinessDayReminder(addBusinessDays(receivedAt, days));
    }
  }

  const reviewWindow = normalized.match(/\b(?:review|respond|reply).{0,20}(\d+)\s*(?:-|to|–)\s*(\d+)\s+business days?\b/i);
  if (reviewWindow) {
    const upper = Number(reviewWindow[2]);
    if (Number.isFinite(upper) && upper > 0) {
      return finalizeBusinessDayReminder(addBusinessDays(receivedAt, upper));
    }
  }

  if (/\bnext week\b/i.test(normalized)) {
    const result = new Date(receivedAt);
    result.setDate(result.getDate() + 8);
    return result;
  }

  if (/\btomorrow\b/i.test(normalized)) {
    const result = new Date(receivedAt);
    result.setDate(result.getDate() + 1);
    return result;
  }

  if (/\b(?:in|within)\s+(\d+)\s+days?\b/i.test(normalized)) {
    const match = normalized.match(/\b(?:in|within)\s+(\d+)\s+days?\b/i);
    const days = Number(match?.[1]);
    if (Number.isFinite(days) && days > 0) {
      const result = new Date(receivedAt);
      result.setDate(result.getDate() + days);
      return result;
    }
  }

  const fallback = new Date(receivedAt);
  fallback.setDate(fallback.getDate() + DEFAULT_FOLLOW_UP_DAYS);
  return fallback;
}

export { DEFAULT_FOLLOW_UP_DAYS };
