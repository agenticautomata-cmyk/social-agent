/**
 * Operator Weekend List — Kellie's selected Fri–Sun handoff.
 * Selection authority is the existing planner Weekend board (`plan_weekend`).
 * Does not create a second selection system. Does not generate graphics.
 */
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, sources } from '../schema.js';
import { getCreatorTimezone } from '../datetime.js';
import { canonicalTodayTitle, validViewSourceUrl } from '../inventory/today-clarity.js';
import { isOperatorTemporallyCurrent } from '../creator-agent/stale-temporal-prose.js';
import { loadByBoard } from '../content-planner/items.js';
import { inventoryLoadContentItemSelect } from '../inventory/inventory-load-projection.js';
import {
  normalizeInventoryItem,
  type InventoryItem,
  type InventoryTemporalEvidence,
} from '../inventory/normalize.js';
import { inventoryTemporalDayKey } from './population/eligibility.js';
import {
  calendarInventoryExtractedTemporalSelect,
  temporalEvidenceFromCalendarRow,
} from './population/inventory-temporal-evidence.js';
import {
  eventFallsInChicagoWeekend,
  fridayContainingDayKey,
  getChicagoWeekendDayKeys,
  setWeekendListMembership,
  shiftDayKey,
  weekendWindowFromFriday,
} from './weekend-things-to-do.js';

export type WeekendListDayKey = 'friday' | 'saturday' | 'sunday';

export type WeekendListItemView = {
  id: string;
  title: string;
  dayKey: WeekendListDayKey;
  dateLabel: string;
  startTimeLabel: string | null;
  venue: string | null;
  city: string | null;
  address: string | null;
  description: string | null;
  category: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  verificationNote: string | null;
  notes: string | null;
  spanNote: string | null;
  sortAt: string;
};

export type WeekendListDay = {
  key: WeekendListDayKey;
  heading: string;
  dateKey: string;
  items: WeekendListItemView[];
};

export type WeekendListPastWeekend = {
  friday: string;
  sunday: string;
  label: string;
  selectedCount: number;
};

export type WeekendListResponse = {
  title: string;
  rangeLabel: string;
  rangeLabelFull: string;
  friday: string;
  saturday: string;
  sunday: string;
  timezone: string;
  selectedCount: number;
  emptyMessage: string;
  outsideWindowCount: number;
  days: WeekendListDay[];
  flyerBrief: string;
  fullList: string;
  pastWeekends: WeekendListPastWeekend[];
};

export type WeekendListSource = {
  id: string;
  title: string;
  eventDate: string | null;
  eventEndDate: string | null;
  venue: string | null;
  businessName: string | null;
  locationName: string | null;
  neighborhood: string | null;
  address: string | null;
  formattedAddress: string | null;
  summary: string | null;
  whyItMatters: string | null;
  category: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  locationStatus: string | null;
  locationVerifiedAt: string | null;
  notes: string | null;
  temporalEvidence?: InventoryTemporalEvidence | null;
};

const DAY_HEADING: Record<WeekendListDayKey, string> = {
  friday: 'FRIDAY',
  saturday: 'SATURDAY',
  sunday: 'SUNDAY',
};

const INTERNAL_COPY_RE =
  /\b(strong fit|worth a look|needs a closer look|benson score|composite score|content_item|uuid)\b/gi;

export { setWeekendListMembership };

export function formatWeekendRangeLabel(friday: string, sunday: string, style: 'short' | 'full'): string {
  const monthStyle = style === 'full' ? 'long' : 'short';
  const fri = new Date(`${friday}T12:00:00Z`);
  const sun = new Date(`${sunday}T12:00:00Z`);
  const friMonth = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: monthStyle }).format(fri);
  const sunMonth = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: monthStyle }).format(sun);
  const friDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric' }).format(fri);
  const sunDay = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', day: 'numeric' }).format(sun);
  const year = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric' }).format(sun);
  if (style === 'full') {
    if (friMonth === sunMonth) return `${friMonth} ${friDay}–${sunDay}, ${year}`;
    return `${friMonth} ${friDay}–${sunMonth} ${sunDay}, ${year}`;
  }
  if (friMonth === sunMonth) return `${friMonth} ${friDay}–${sunDay}`;
  return `${friMonth} ${friDay}–${sunMonth} ${sunDay}`;
}

const EXTRACTED_CLOCK_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/;

function formatExtractedStartTime(startTime: string): string | null {
  const match = startTime.trim().match(EXTRACTED_CLOCK_RE);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ?? '00';
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  const dayPeriod = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${dayPeriod}`;
}

export function startTimeLabel(
  iso: string | null,
  timezone: string,
  temporalEvidence?: InventoryTemporalEvidence | null,
): string | null {
  const extractedClock = temporalEvidence?.startTime?.trim() || null;
  if (extractedClock && EXTRACTED_CLOCK_RE.test(extractedClock)) {
    return formatExtractedStartTime(extractedClock);
  }
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const dayPeriod = parts.find((p) => p.type === 'dayPeriod')?.value ?? '';
  if (hour === 12 && minute === '00' && /^am$/i.test(dayPeriod)) return null;
  return `${hour}:${minute} ${dayPeriod}`.replace(/\s+/g, ' ').trim();
}

export function weekendOccurrenceDayKeys(
  eventDate: string | null,
  eventEndDate: string | null,
  timezone: string,
  temporalEvidence?: InventoryTemporalEvidence | null,
): string[] {
  if (!eventDate) return [];
  const carrier = { metadata: {}, temporalEvidence: temporalEvidence ?? null };
  const start = inventoryTemporalDayKey(eventDate, carrier, 'start', timezone);
  if (!start) return [];
  if (!eventEndDate) return [start];
  const end = inventoryTemporalDayKey(eventEndDate, carrier, 'end', timezone);
  if (!end || end <= start) return [start];
  const keys = [start];
  let cur = start;
  for (let i = 0; i < 14 && cur < end; i += 1) {
    cur = shiftDayKey(cur, 1);
    keys.push(cur);
  }
  return keys;
}

function dayKeyForWindow(
  days: string[],
  friday: string,
  saturday: string,
  sunday: string,
): { dayKey: WeekendListDayKey; spanNote: string | null } | null {
  const inWindow = days.filter((d) => d === friday || d === saturday || d === sunday);
  if (inWindow.length === 0) return null;
  const first = inWindow[0]!;
  const dayKey: WeekendListDayKey =
    first === friday ? 'friday' : first === saturday ? 'saturday' : 'sunday';
  if (inWindow.length === 1) return { dayKey, spanNote: null };
  const names = inWindow.map((d) =>
    d === friday ? 'Friday' : d === saturday ? 'Saturday' : 'Sunday',
  );
  return { dayKey, spanNote: `Also ${names.slice(1).join('–')}` };
}

function uniquePlace(parts: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const part of parts) {
    const trimmed = part?.trim();
    if (!trimmed) continue;
    if (out.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) continue;
    out.push(trimmed);
  }
  return out;
}

export function cityFromItem(item: WeekendListSource): string | null {
  const loc = item.locationName?.trim() ?? '';
  if (isCityLike(loc)) return loc;
  const addr = item.formattedAddress?.trim() ?? item.address?.trim() ?? '';
  const cityState = addr.match(/,\s*([^,]+,\s*[A-Z]{2})(?:\s+\d{5})?\s*$/);
  if (cityState?.[1]) return cityState[1].trim();
  const cityOnly = addr.match(/,\s*([^,]+)\s*$/);
  if (cityOnly?.[1] && isCityLike(cityOnly[1].trim())) return cityOnly[1].trim();
  return null;
}

function isCityLike(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/,\s*[A-Z]{2}\b/.test(v)) return true;
  return /^(kansas\s*city|overland\s+park|independence|leawood|lenexa|olathe|liberty|shawnee|prairie\s+village)(\s*,?\s*(mo|ks|missouri|kansas))?$/i.test(
    v,
  );
}

export function venueFromItem(item: WeekendListSource): string | null {
  const city = cityFromItem(item);
  const parts = uniquePlace([item.venue, item.businessName, item.neighborhood]);
  const filtered = city
    ? parts.filter((p) => p.toLowerCase() !== city.toLowerCase())
    : parts;
  if (filtered[0]) return filtered[0];
  if (item.locationName && item.locationName !== city) return item.locationName;
  return null;
}

export function conciseDescription(raw: string | null | undefined, max = 180): string | null {
  if (!raw) return null;
  const withoutResearch = raw.replace(/\bWeb research:[\s\S]*$/i, '').trim();
  const first = withoutResearch.split(/\n+/)[0]?.trim() ?? '';
  const cleaned = first.replace(INTERNAL_COPY_RE, '').replace(/\s{2,}/g, ' ').trim();
  if (cleaned.length < 8) return null;
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}…`;
}

function categoryLabel(category: string | null): string | null {
  const raw = category?.trim();
  if (!raw) return null;
  return raw.replace(/_/g, ' ');
}

function verificationNote(item: WeekendListSource, timezone: string, now: Date): string | null {
  const current = isOperatorTemporallyCurrent({
    startsAt: item.eventDate,
    endsAt: item.eventEndDate,
    timezone,
    summaryText: item.summary,
    now,
  });
  if (!current) return 'Confirm date and time — this listing may have shifted.';
  if (item.locationVerifiedAt || item.locationStatus === 'resolved') {
    return 'Location confirmed.';
  }
  return null;
}

function dateLabelForDay(dateKey: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

export function toWeekendListSource(
  item: InventoryItem,
  notes: string | null,
): WeekendListSource {
  return {
    id: item.id,
    title: canonicalTodayTitle(item),
    eventDate: item.eventDate,
    eventEndDate: item.eventEndDate,
    venue: item.venue,
    businessName: item.businessName,
    locationName: item.locationName,
    neighborhood: item.neighborhood,
    address: item.address,
    formattedAddress: item.formattedAddress,
    summary: item.summary,
    whyItMatters: item.whyItMatters,
    category: item.category,
    sourceName: item.sourceName,
    sourceUrl: item.sourceUrl,
    locationStatus: item.locationStatus,
    locationVerifiedAt: item.locationVerifiedAt,
    notes,
    temporalEvidence: item.temporalEvidence ?? null,
  };
}

export function buildWeekendList(
  sources: WeekendListSource[],
  now: Date = new Date(),
  fridayOverride?: string,
): WeekendListResponse {
  const timezone = getCreatorTimezone();
  const current = getChicagoWeekendDayKeys(now);
  const window = fridayOverride
    ? weekendWindowFromFriday(fridayOverride, timezone)
    : current;
  const { friday, saturday, sunday } = window;
  const viewingCurrent = friday === current.friday;

  const views: WeekendListItemView[] = [];
  let outsideWindowCount = 0;
  const pastBuckets = new Map<string, number>();

  const seenIds = new Set<string>();

  for (const item of sources) {
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);

    const days = weekendOccurrenceDayKeys(
      item.eventDate,
      item.eventEndDate,
      timezone,
      item.temporalEvidence,
    );
    const placement = dayKeyForWindow(days, friday, saturday, sunday);
    if (!placement) {
      const day = days[0];
      if (day && day < friday) {
        const pastFriday = fridayContainingDayKey(day);
        pastBuckets.set(pastFriday, (pastBuckets.get(pastFriday) ?? 0) + 1);
      } else if (day && day > sunday) {
        outsideWindowCount += 1;
      } else if (!day) {
        outsideWindowCount += 1;
      }
      continue;
    }

    const dateKey = placement.dayKey === 'friday' ? friday : placement.dayKey === 'saturday' ? saturday : sunday;
    views.push({
      id: item.id,
      title: item.title.trim(),
      dayKey: placement.dayKey,
      dateLabel: dateLabelForDay(dateKey, timezone),
      startTimeLabel: startTimeLabel(item.eventDate, timezone, item.temporalEvidence),
      venue: venueFromItem(item),
      city: cityFromItem(item),
      address: (item.formattedAddress ?? item.address)?.trim() || null,
      description: conciseDescription(item.summary ?? item.whyItMatters, 180),
      category: categoryLabel(item.category),
      sourceName: item.sourceName?.trim() || null,
      sourceUrl: validViewSourceUrl(item.sourceUrl),
      verificationNote: verificationNote(item, timezone, now),
      notes: item.notes?.trim() || null,
      spanNote: placement.spanNote,
      sortAt: item.eventDate ?? `${dateKey}T12:00:00.000Z`,
    });
  }

  views.sort((a, b) => a.sortAt.localeCompare(b.sortAt) || a.title.localeCompare(b.title));

  const days: WeekendListDay[] = (['friday', 'saturday', 'sunday'] as const).map((key) => ({
    key,
    heading: DAY_HEADING[key],
    dateKey: key === 'friday' ? friday : key === 'saturday' ? saturday : sunday,
    items: views.filter((row) => row.dayKey === key),
  }));

  const rangeLabel = formatWeekendRangeLabel(friday, sunday, 'short');
  const rangeLabelFull = formatWeekendRangeLabel(friday, sunday, 'full');
  const selectedCount = views.length;
  const emptyMessage = `No picks yet for ${rangeLabel}.\nUse Add to weekend list on Calendar or Things To Do recommendations.`;

  const pastWeekends: WeekendListPastWeekend[] = [...pastBuckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 8)
    .map(([pastFriday, count]) => {
      const w = weekendWindowFromFriday(pastFriday, timezone);
      return {
        friday: w.friday,
        sunday: w.sunday,
        label: formatWeekendRangeLabel(w.friday, w.sunday, 'short'),
        selectedCount: count,
      };
    });

  return {
    title: 'THINGS TO DO THIS WEEKEND IN KC',
    rangeLabel,
    rangeLabelFull,
    friday,
    saturday,
    sunday,
    timezone,
    selectedCount,
    emptyMessage,
    outsideWindowCount: viewingCurrent ? outsideWindowCount : 0,
    days,
    flyerBrief: formatFlyerBrief({
      rangeLabelFull,
      days,
    }),
    fullList: formatFullList({
      rangeLabelFull,
      days,
    }),
    pastWeekends: viewingCurrent ? pastWeekends : [],
  };
}

function formatFlyerItem(item: WeekendListItemView): string {
  const lines = [item.title];
  if (item.startTimeLabel) lines.push(item.startTimeLabel);
  if (item.venue) lines.push(item.venue);
  if (item.city) lines.push(item.city);
  if (item.description) lines.push(item.description);
  if (item.sourceUrl) lines.push(`Source: ${item.sourceUrl}`);
  return lines.join('\n');
}

export function formatFlyerBrief(input: {
  rangeLabelFull: string;
  days: WeekendListDay[];
}): string {
  const blocks = ['THINGS TO DO THIS WEEKEND IN KC', input.rangeLabelFull];
  for (const day of input.days) {
    if (day.items.length === 0) continue;
    blocks.push('', DAY_HEADING[day.key], '');
    blocks.push(day.items.map(formatFlyerItem).join('\n\n'));
  }
  return blocks.join('\n').trim() + '\n';
}

function formatFullItem(item: WeekendListItemView): string {
  const lines = [item.title];
  lines.push(item.dateLabel + (item.startTimeLabel ? ` · ${item.startTimeLabel}` : ''));
  if (item.spanNote) lines.push(item.spanNote);
  if (item.venue) lines.push(item.venue);
  if (item.address) lines.push(item.address);
  else if (item.city) lines.push(item.city);
  if (item.category) lines.push(item.category);
  if (item.description) lines.push(item.description);
  if (item.sourceName && item.sourceUrl) lines.push(`Source: ${item.sourceName} — ${item.sourceUrl}`);
  else if (item.sourceUrl) lines.push(`Source: ${item.sourceUrl}`);
  else if (item.sourceName) lines.push(`Source: ${item.sourceName}`);
  if (item.notes) lines.push(`Note: ${item.notes}`);
  if (item.verificationNote) lines.push(item.verificationNote);
  return lines.join('\n');
}

export function formatFullList(input: {
  rangeLabelFull: string;
  days: WeekendListDay[];
}): string {
  const blocks = ['THINGS TO DO THIS WEEKEND IN KC', input.rangeLabelFull];
  for (const day of input.days) {
    if (day.items.length === 0) continue;
    blocks.push('', DAY_HEADING[day.key], '');
    blocks.push(day.items.map(formatFullItem).join('\n\n'));
  }
  return blocks.join('\n').trim() + '\n';
}

async function loadInventoryForIds(ids: string[]): Promise<Map<string, InventoryItem>> {
  const map = new Map<string, InventoryItem>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({
      ...inventoryLoadContentItemSelect,
      ...calendarInventoryExtractedTemporalSelect,
      sourceName: sources.name,
      sourceType: sources.type,
    })
    .from(contentItems)
    .leftJoin(sources, eq(sources.id, contentItems.sourceId))
    .where(inArray(contentItems.id, ids));
  for (const row of rows) {
    const {
      sourceName,
      sourceType,
      calendarExtractedEventDate,
      calendarExtractedEventEndDate,
      calendarExtractedStartTime,
      ...item
    } = row;
    map.set(
      item.id,
      normalizeInventoryItem(item, sourceName, sourceType, {
        temporalEvidence: temporalEvidenceFromCalendarRow({
          calendarExtractedEventDate,
          calendarExtractedEventEndDate,
          calendarExtractedStartTime,
        }),
      }),
    );
  }
  return map;
}

export async function loadWeekendList(
  now: Date = new Date(),
  fridayOverride?: string,
): Promise<WeekendListResponse> {
  const board = await loadByBoard('Weekend').catch(() => []);
  const active = board.filter((row) => row.status !== 'skipped' && row.status !== 'covered');
  const inventory = await loadInventoryForIds(active.map((row) => row.contentItemId));
  const listSources: WeekendListSource[] = [];
  for (const row of active) {
    const item = inventory.get(row.contentItemId);
    if (!item) continue;
    listSources.push(toWeekendListSource(item, row.notes));
  }
  return buildWeekendList(listSources, now, fridayOverride);
}

export function itemBelongsOnCurrentWeekendList(
  eventDate: string | null,
  eventEndDate: string | null,
  now: Date = new Date(),
  temporalEvidence?: InventoryTemporalEvidence | null,
): boolean {
  return eventFallsInChicagoWeekend(eventDate, eventEndDate, now, temporalEvidence);
}
