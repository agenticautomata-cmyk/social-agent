import type { CreatorRelevanceInput, LifecycleStatus } from './types.js';

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfWeekend(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + daysUntilSunday);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function computeLifecycleStatus(input: CreatorRelevanceInput, now = new Date()): LifecycleStatus {
  const starts = toDate(input.eventStartsAt);
  const ends = toDate(input.eventEndsAt);
  const discovered = toDate(input.discoveredAt) ?? now;

  const meta = input.metadata ?? {};
  const contentType = String(meta.contentType ?? meta.ingestType ?? '').toLowerCase();

  if (!starts && !ends) {
    if (/\b(opening|grand opening|now open)\b/i.test(input.title)) {
      const ageDays = (now.getTime() - discovered.getTime()) / (24 * 60 * 60 * 1000);
      return ageDays > 21 ? 'archived' : ageDays > 14 ? 'expiring_soon' : 'active';
    }
    if (/\b(closing|liquidation|going out of business)\b/i.test(input.title)) {
      return 'needs_date_verification';
    }
    return 'active';
  }

  if (ends && ends.getTime() < now.getTime()) return 'expired';
  if (starts && starts.getTime() < now.getTime()) {
    if (ends && ends.getTime() >= now.getTime()) {
      const hoursLeft = (ends.getTime() - now.getTime()) / 3_600_000;
      if (hoursLeft <= 48) return 'expiring_soon';
      return 'active';
    }
    const ageDays = (now.getTime() - starts.getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays > 7) return 'expired';
    if (ageDays > 5) return 'expiring_soon';
    return 'active';
  }
  if (starts && starts.getTime() > now.getTime()) {
    const daysUntil = (starts.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    if (daysUntil <= 3) return 'expiring_soon';
    return 'upcoming';
  }

  if (contentType.includes('weekend') && starts) {
    const weekendEnd = endOfWeekend(starts);
    if (weekendEnd.getTime() < now.getTime()) return 'expired';
  }

  return 'needs_date_verification';
}

export function isLifecycleVisible(status: LifecycleStatus, includeArchived = false): boolean {
  if (includeArchived) return true;
  return status === 'upcoming' || status === 'active' || status === 'expiring_soon';
}
