import {
  getCreatorNowClock,
  getLocalCalendarDay,
  type CreatorNowClock,
} from '../datetime.js';
import type { PostingTimeSlotAnalytics, SavedPostingTimeAnalytics } from './posting-times.js';

export type PostingWindowAdvice = {
  /** Next actionable window relative to now, e.g. "Tonight around 6 PM CT" */
  label: string;
  nextOccurrenceIso: string | null;
  confidence: 'weak' | 'moderate' | 'strong';
  signalNote: string;
  historicalPattern: string;
};

type LocalDateTimeParts = {
  weekday: string;
  hour: number;
  minute: number;
  localDate: string;
};

function localDateTimeParts(date: Date, timezone: string): LocalDateTimeParts {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);

  return {
    weekday: formatted.find((p) => p.type === 'weekday')?.value ?? 'Unknown',
    hour: Number(formatted.find((p) => p.type === 'hour')?.value ?? 0),
    minute: Number(formatted.find((p) => p.type === 'minute')?.value ?? 0),
    localDate: getLocalCalendarDay(date, timezone),
  };
}

function minutesSinceMidnight(hour: number, minute: number): number {
  return hour * 60 + minute;
}

function partOfDayLabel(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function roundMinuteForSignal(minute: number, videoCount: number): number {
  if (videoCount >= 3) return minute;
  if (videoCount === 2) return minute < 30 ? 0 : 30;
  return 0;
}

function formatRoughTime(
  hour: number,
  minute: number,
  videoCount: number,
  timezoneAbbr: string,
): string {
  if (videoCount < 2) return partOfDayLabel(hour);
  const rounded = roundMinuteForSignal(minute, videoCount);
  const h12 = hour % 12 || 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  const minStr = rounded > 0 ? `:${rounded.toString().padStart(2, '0')}` : '';
  return `~${h12}${minStr} ${ampm} ${timezoneAbbr}`;
}

function slotConfidence(slot: PostingTimeSlotAnalytics): PostingWindowAdvice['confidence'] {
  if (slot.videoCount >= 3 && slot.performanceIndex >= 1.1) return 'strong';
  if (slot.videoCount >= 2) return 'moderate';
  return 'weak';
}

function findNextSlotOccurrence(
  slot: PostingTimeSlotAnalytics,
  now = new Date(),
): { occurrence: Date; dayOffset: number } {
  const { weekday, hour, minute, timezone } = slot;
  const nowParts = localDateTimeParts(now, timezone);
  const targetMins = minutesSinceMidnight(hour, minute);

  for (let offset = 0; offset <= 7; offset++) {
    const probe = new Date(now.getTime() + offset * 86_400_000);
    const parts = localDateTimeParts(probe, timezone);
    if (parts.weekday !== weekday) continue;

    if (offset === 0) {
      const nowMins = minutesSinceMidnight(nowParts.hour, nowParts.minute);
      if (nowMins >= targetMins) continue;
    }

    const dayOffset = Math.round(
      (Date.parse(parts.localDate) - Date.parse(nowParts.localDate)) / 86_400_000,
    );
    return { occurrence: probe, dayOffset };
  }

  return { occurrence: new Date(now.getTime() + 7 * 86_400_000), dayOffset: 7 };
}

function dayPhrase(dayOffset: number, weekday: string, clock: CreatorNowClock): string {
  if (dayOffset === 0) {
    return clock.partOfDay === 'evening' ? 'Tonight' : 'Later today';
  }
  if (dayOffset === 1) return 'Tomorrow';
  return `Next ${weekday}`;
}

export function advisePostingWindow(
  slot: PostingTimeSlotAnalytics,
  clock: CreatorNowClock = getCreatorNowClock(),
  now = new Date(),
): PostingWindowAdvice {
  const confidence = slotConfidence(slot);
  const { occurrence, dayOffset } = findNextSlotOccurrence(slot, now);
  const roughTime = formatRoughTime(slot.hour, slot.minute, slot.videoCount, clock.timezoneAbbr);
  const dayPart = partOfDayLabel(slot.hour);
  const when = dayPhrase(dayOffset, slot.weekday, clock);

  const label =
    slot.videoCount < 2
      ? `${when} (${dayPart}, ${clock.timezoneAbbr}) — weak signal from one past post`
      : `${when} ${dayPart} (${roughTime})`;

  const videoWord = slot.videoCount === 1 ? 'video' : 'videos';
  const signalNote =
    confidence === 'weak'
      ? `Only ${slot.videoCount} past ${videoWord} in this window — treat as a hint, not a rule.`
      : confidence === 'moderate'
        ? `${slot.videoCount} past ${videoWord} performed above average here.`
        : `${slot.videoCount} past ${videoWord} consistently outperform here.`;

  const historicalPattern = `${slot.weekday} ${dayPart} — ${slot.videoCount} ${videoWord}, performance index ${slot.performanceIndex}`;

  return {
    label,
    nextOccurrenceIso: occurrence.toISOString(),
    confidence,
    signalNote,
    historicalPattern,
  };
}

export function pickDraftPostingAdvice(
  analytics: SavedPostingTimeAnalytics | null,
  draftId: string,
  clock: CreatorNowClock = getCreatorNowClock(),
  now = new Date(),
): PostingWindowAdvice | null {
  const slots = analytics?.recommendedSlots ?? [];
  if (slots.length === 0) return null;

  const strong = slots.filter((s) => s.videoCount >= 2);
  const candidates = strong.length > 0 ? strong : slots;

  const ranked = candidates
    .map((slot) => {
      const advice = advisePostingWindow(slot, clock, now);
      const nextMs = advice.nextOccurrenceIso
        ? Date.parse(advice.nextOccurrenceIso) - now.getTime()
        : Number.POSITIVE_INFINITY;
      const confRank = { strong: 0, moderate: 1, weak: 2 }[advice.confidence];
      return { slot, advice, nextMs, confRank };
    })
    .sort(
      (a, b) =>
        a.confRank - b.confRank ||
        a.nextMs - b.nextMs ||
        b.slot.performanceIndex - a.slot.performanceIndex,
    );

  const pool = ranked.slice(0, Math.min(3, ranked.length));
  if (pool.length === 0) return null;

  const hash = [...draftId].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return pool[hash % pool.length]!.advice;
}

export function buildPostingScheduleContext(
  analytics: SavedPostingTimeAnalytics | null,
  clock: CreatorNowClock = getCreatorNowClock(),
): {
  creatorNow: CreatorNowClock;
  guidance: string;
  patterns: Array<{
    historicalLabel: string;
    videoCount: number;
    performanceIndex: number;
    signalStrength: PostingWindowAdvice['confidence'];
    nextActionableWindow: string;
    signalNote: string;
  }>;
} {
  const slots = analytics?.recommendedSlots ?? [];
  const patterns = slots.slice(0, 5).map((slot) => {
    const advice = advisePostingWindow(slot, clock);
    return {
      historicalLabel: slot.label,
      videoCount: slot.videoCount,
      performanceIndex: slot.performanceIndex,
      signalStrength: advice.confidence,
      nextActionableWindow: advice.label,
      signalNote: advice.signalNote,
    };
  });

  return {
    creatorNow: clock,
    guidance:
      'Posting times are historical patterns, not a command to post every video at the same minute. Use creatorNow and nextActionableWindow to suggest when to post THIS draft relative to right now.',
    patterns,
  };
}
