import { createHash } from 'crypto';
import type { CreatorCalendarItem } from '../schema.js';
import type { ReminderSettings } from './types.js';

export function buildCalendarPayloadHash(input: {
  title: string;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  timezone: string;
  location: string | null;
  notes: string | null;
  description: string | null;
}): string {
  const parts = [
    input.title.trim(),
    input.startAt.toISOString(),
    input.endAt?.toISOString() ?? '',
    input.allDay ? '1' : '0',
    input.timezone,
    input.location?.trim() ?? '',
    input.notes?.trim() ?? '',
    input.description?.trim() ?? '',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export function payloadHashFromItem(item: CreatorCalendarItem): string {
  return buildCalendarPayloadHash({
    title: item.title,
    startAt: item.startAt,
    endAt: item.endAt,
    allDay: item.allDay,
    timezone: item.timezone,
    location: item.location,
    notes: item.notes,
    description: item.description,
  });
}

export function parseReminderSettings(raw: unknown): ReminderSettings {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  return {
    preset: obj.preset as ReminderSettings['preset'],
    minutesBefore: typeof obj.minutesBefore === 'number' ? obj.minutesBefore : undefined,
    googleReminderMinutes:
      typeof obj.googleReminderMinutes === 'number' ? obj.googleReminderMinutes : undefined,
    travelReminder: obj.travelReminder === true,
    equipmentReminder: obj.equipmentReminder === true,
  };
}

export function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string');
}
