import { createHash } from 'node:crypto';

import type { WeekendListDay, WeekendListItemView, WeekendListResponse } from '../../creator-calendar/weekend-list.js';
import { loadWeekendDropTheme } from '../brand/index.js';

export type WeekendFactEvent = {
  id: string;
  dayKey: 'friday' | 'saturday' | 'sunday';
  dateLabel: string;
  title: string;
  startTimeLabel: string | null;
  venue: string | null;
  city: string | null;
  description: string | null;
  sourceUrl: string | null;
  verificationNote: string | null;
};

export type WeekendFactSheet = {
  seriesId: string;
  brandThemeId: string;
  rangeLabel: string;
  rangeLabelFull: string;
  friday: string;
  saturday: string;
  sunday: string;
  timezone: string;
  tagline: string;
  events: WeekendFactEvent[];
  factsHash: string;
  lockedAt: string;
};

export type PackedSlideRole = 'cover' | 'day' | 'cta';

export type PackedSlide = {
  role: PackedSlideRole;
  dayKey?: 'friday' | 'saturday' | 'sunday';
  dayHeading?: string;
  dateLabel?: string;
  layoutPreset: 'color-block' | 'photo-full' | 'split-band';
  events: WeekendFactEvent[];
  sort: number;
};

function eventCharWeight(event: WeekendFactEvent): number {
  return (
    event.title.length +
    (event.startTimeLabel?.length ?? 0) +
    (event.venue?.length ?? 0) +
    (event.city?.length ?? 0) +
    Math.min(event.description?.length ?? 0, 120)
  );
}

export function hashWeekendFacts(sheet: Omit<WeekendFactSheet, 'factsHash' | 'lockedAt'>): string {
  const canonical = JSON.stringify({
    friday: sheet.friday,
    saturday: sheet.saturday,
    sunday: sheet.sunday,
    events: sheet.events.map((e) => ({
      id: e.id,
      dayKey: e.dayKey,
      title: e.title,
      startTimeLabel: e.startTimeLabel,
      venue: e.venue,
      city: e.city,
      description: e.description,
      sourceUrl: e.sourceUrl,
    })),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function lockWeekendFactSheet(
  list: WeekendListResponse,
  lockedAt = new Date().toISOString(),
): WeekendFactSheet {
  const theme = loadWeekendDropTheme();
  const events: WeekendFactEvent[] = list.days.flatMap((day) =>
    day.items.map((item) => toFactEvent(day, item)),
  );
  const base = {
    seriesId: theme.seriesId,
    brandThemeId: theme.id,
    rangeLabel: list.rangeLabel,
    rangeLabelFull: list.rangeLabelFull,
    friday: list.friday,
    saturday: list.saturday,
    sunday: list.sunday,
    timezone: list.timezone,
    tagline: theme.tagline,
    events,
  };
  return {
    ...base,
    factsHash: hashWeekendFacts(base),
    lockedAt,
  };
}

function toFactEvent(day: WeekendListDay, item: WeekendListItemView): WeekendFactEvent {
  return {
    id: item.id,
    dayKey: day.key,
    dateLabel: item.dateLabel,
    title: item.title,
    startTimeLabel: item.startTimeLabel,
    venue: item.venue,
    city: item.city,
    description: item.description,
    sourceUrl: item.sourceUrl,
    verificationNote: item.verificationNote,
  };
}

/**
 * Density-aware packing: cover → one or more day slides → CTA.
 * Overflow opens a new slide rather than shrinking type below phone readability.
 */
export function packWeekendSlides(sheet: WeekendFactSheet): PackedSlide[] {
  const theme = loadWeekendDropTheme();
  const maxEvents = theme.layout.maxEventsPerInfoSlide;
  const maxChars = theme.layout.maxCharsPerInfoSlide;
  const slides: PackedSlide[] = [];
  let sort = 0;

  slides.push({
    role: 'cover',
    layoutPreset: 'color-block',
    events: [],
    sort: sort++,
  });

  for (const dayKey of ['friday', 'saturday', 'sunday'] as const) {
    const dayEvents = sheet.events.filter((e) => e.dayKey === dayKey);
    if (dayEvents.length === 0) continue;

    let bucket: WeekendFactEvent[] = [];
    let chars = 0;
    const flush = () => {
      if (bucket.length === 0) return;
      slides.push({
        role: 'day',
        dayKey,
        dayHeading: dayKey.toUpperCase(),
        dateLabel: bucket[0]!.dateLabel,
        layoutPreset: slides.filter((s) => s.role === 'day').length % 2 === 0 ? 'split-band' : 'photo-full',
        events: bucket,
        sort: sort++,
      });
      bucket = [];
      chars = 0;
    };

    for (const event of dayEvents) {
      const weight = eventCharWeight(event);
      if (
        bucket.length > 0 &&
        (bucket.length >= maxEvents || chars + weight > maxChars)
      ) {
        flush();
      }
      bucket.push(event);
      chars += weight;
    }
    flush();
  }

  slides.push({
    role: 'cta',
    layoutPreset: 'color-block',
    events: [],
    sort: sort++,
  });

  return slides;
}
