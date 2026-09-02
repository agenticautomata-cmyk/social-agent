import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../env.js';
import type { ParsedRoundupEvent } from './types.js';
import {
  addUtcDays,
  nextWeekdayIso,
  reconcileStatedDateWithWeekday,
  utcWeekdayFromIsoDate,
  weekdayIndexFromToken,
} from './watchlist-date-trust.js';

const EventRowSchema = z.object({
  eventName: z.string(),
  eventDate: z.string().nullable().optional(),
  eventTime: z.string().nullable().optional(),
  venue: z.string().nullable().optional(),
  neighborhood: z.string().nullable().optional(),
  price: z.string().nullable().optional(),
  ageRestriction: z.string().nullable().optional(),
  registrationNotes: z.string().nullable().optional(),
  dayHeading: z.string().nullable().optional(),
  originalQuotedText: z.string(),
});

const ExtractionSchema = z.object({
  events: z.array(EventRowSchema),
});

const DAY_HEADING = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i;

export function applyDayHeadingToRows(
  rows: ParsedRoundupEvent[],
): ParsedRoundupEvent[] {
  let currentDay: string | null = null;
  return rows.map((row) => {
    if (row.dayHeading && DAY_HEADING.test(row.dayHeading)) {
      currentDay = row.dayHeading;
    } else if (row.eventName && DAY_HEADING.test(row.eventName) && !row.eventTime && !row.venue) {
      currentDay = row.eventName;
      return { ...row, dayHeading: row.eventName, eventName: row.eventName };
    }
    return { ...row, dayHeading: row.dayHeading ?? currentDay };
  });
}

export function resolveWeekendDatesFromPostContext(input: {
  events: ParsedRoundupEvent[];
  postPublishedAt: string | null;
  caption: string | null;
}): ParsedRoundupEvent[] {
  const caption = `${input.caption ?? ''}`;

  return input.events.map((ev) => {
    const rowText = `${ev.dayHeading ?? ''} ${ev.eventName} ${ev.originalQuotedText}`;
    const headingIdx = weekdayIndexFromToken((ev.dayHeading ?? '').split(/[^a-z]+/i)[0] ?? '');
    if (ev.eventDate) {
      const repaired = reconcileStatedDateWithWeekday({
        statedIso: ev.eventDate,
        text: rowText,
        publishedAt: input.postPublishedAt,
      });
      let iso = repaired.isoDate;
      if (
        headingIdx != null &&
        iso &&
        utcWeekdayFromIsoDate(iso) !== headingIdx &&
        input.postPublishedAt
      ) {
        iso = nextWeekdayIso(new Date(input.postPublishedAt), headingIdx);
      }
      if (repaired.status === 'contradictory' && !iso) {
        return { ...ev, eventDate: null };
      }
      return { ...ev, eventDate: iso };
    }
    if (headingIdx == null || !input.postPublishedAt) return { ...ev, eventDate: null };
    let iso = nextWeekdayIso(new Date(input.postPublishedAt), headingIdx);
    if (/next week/i.test(caption)) iso = addUtcDays(iso, 7);
    return { ...ev, eventDate: iso };
  });
}

export async function parseRoundupSlideText(input: {
  slideNumber: number;
  ocrText: string;
  postCaption?: string | null;
  postPublishedAt?: string | null;
}): Promise<ParsedRoundupEvent[]> {
  if (!input.ocrText.trim()) return [];

  if (!env.OPENAI_API_KEY) {
    return heuristicParseSlide(input.slideNumber, input.ocrText);
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.15,
    messages: [
      {
        role: 'system',
        content: `You split KC event roundup slide OCR text into individual event leads.
Return JSON: { "events": [ { eventName, eventDate, eventTime, venue, neighborhood, price, ageRestriction, registrationNotes, dayHeading, originalQuotedText } ] }.
Rules:
- One object per distinct event (not one object for the whole slide).
- Day headings (Friday, Saturday, Monday…) apply to following rows until the next heading.
- Use ISO date YYYY-MM-DD only when the date is explicit in the OCR or caption. Do not guess a calendar date from “Monday” alone.
- If you emit eventDate, it MUST fall on the weekday named in dayHeading or the event name. Never assign a Saturday to a Monday event.
- originalQuotedText must be a short fragment from the OCR text for this event only.
- Do NOT invent events not present in the OCR text.`,
      },
      {
        role: 'user',
        content: JSON.stringify({
          slideNumber: input.slideNumber,
          postCaption: input.postCaption?.slice(0, 500) ?? null,
          postPublishedAt: input.postPublishedAt ?? null,
          ocrText: input.ocrText.slice(0, 6000),
        }),
      },
    ],
    max_tokens: 1800,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return heuristicParseSlide(input.slideNumber, input.ocrText);

  try {
    const parsed = ExtractionSchema.parse(JSON.parse(content));
    const rows = parsed.events.map((e) => ({
      ...e,
      eventDate: e.eventDate ?? null,
      eventTime: e.eventTime ?? null,
      venue: e.venue ?? null,
      neighborhood: e.neighborhood ?? null,
      price: e.price ?? null,
      ageRestriction: e.ageRestriction ?? null,
      registrationNotes: e.registrationNotes ?? null,
      dayHeading: e.dayHeading ?? null,
      slideNumber: input.slideNumber,
    }));
    return applyDayHeadingToRows(rows);
  } catch {
    return heuristicParseSlide(input.slideNumber, input.ocrText);
  }
}

function heuristicParseSlide(slideNumber: number, text: string): ParsedRoundupEvent[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const events: ParsedRoundupEvent[] = [];
  let dayHeading: string | null = null;

  for (const line of lines) {
    if (DAY_HEADING.test(line) && line.length < 40) {
      dayHeading = line;
      continue;
    }
    if (line.length < 4) continue;
    events.push({
      eventName: line.slice(0, 200),
      eventDate: null,
      eventTime: null,
      venue: null,
      neighborhood: null,
      price: null,
      ageRestriction: null,
      registrationNotes: null,
      dayHeading,
      originalQuotedText: line.slice(0, 300),
      slideNumber,
    });
  }
  return applyDayHeadingToRows(events);
}

export async function parseAllSlides(input: {
  slides: Array<{ slideNumber: number; ocrText: string }>;
  postCaption?: string | null;
  postPublishedAt?: string | null;
}): Promise<ParsedRoundupEvent[]> {
  const all: ParsedRoundupEvent[] = [];
  for (const slide of input.slides) {
    const rows = await parseRoundupSlideText({
      slideNumber: slide.slideNumber,
      ocrText: slide.ocrText,
      postCaption: input.postCaption,
      postPublishedAt: input.postPublishedAt,
    });
    all.push(...rows);
  }
  return resolveWeekendDatesFromPostContext({
    events: all,
    postPublishedAt: input.postPublishedAt ?? null,
    caption: input.postCaption ?? null,
  });
}
