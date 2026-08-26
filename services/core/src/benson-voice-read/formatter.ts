import {
  VOICE_SPEECH_MAX_CHARS,
  VOICE_SPOKEN_ITEM_LIMIT,
  WEEKEND_CALENDAR_EMPTY_SPEECH,
  WEEKEND_LIST_EMPTY_SPEECH,
} from './types.js';

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const MARKDOWN_RE = /(\*\*|__|`+|#{1,6}\s*|\[|\]|\(|\)|\*|_|~)/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const CONFIDENCE_RE =
  /\b(?:confidence|score|composite)\s*[:=]?\s*\d+(?:\.\d+)?%?|\b\d+(?:\.\d+)?%\s*(?:confidence|sure|match)?\b/gi;
const JARGON_RE =
  /\b(?:evidence ledger|content_item|planner_items|uuid|idempotency|projection|source_record)\b/gi;

export function stripVoiceUnsafeText(input: string): string {
  return input
    .replace(URL_RE, ' ')
    .replace(UUID_RE, ' ')
    .replace(CONFIDENCE_RE, ' ')
    .replace(JARGON_RE, ' ')
    .replace(MARKDOWN_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speakClockTime(
  iso: string | null | undefined,
  timezone: string,
  allDay = false,
): string | null {
  if (allDay || !iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function speakWeekday(iso: string, timezone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  }).format(date);
}

export function joinSpokenItems(phrases: string[]): string {
  const clean = phrases.map((p) => stripVoiceUnsafeText(p)).filter(Boolean);
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean[0]!;
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
}

function itemPhrase(item: { title: string; venue?: string | null }): string {
  const title = stripVoiceUnsafeText(item.title);
  const venue = item.venue ? stripVoiceUnsafeText(item.venue) : '';
  if (title && venue) return `${title} at ${venue}`;
  return title;
}

function capSpeech(speech: string): string {
  const clean = stripVoiceUnsafeText(speech);
  if (clean.length <= VOICE_SPEECH_MAX_CHARS) return clean;
  return `${clean.slice(0, VOICE_SPEECH_MAX_CHARS - 1).trimEnd()}…`;
}

export function formatWeekendCalendarSpeech(input: {
  count: number;
  items: Array<{ title: string; venue?: string | null }>;
}): string {
  if (input.count <= 0 || input.items.length === 0) {
    return WEEKEND_CALENDAR_EMPTY_SPEECH;
  }
  const noun = input.count === 1 ? 'thing' : 'things';
  const spoken = input.items.slice(0, VOICE_SPOKEN_ITEM_LIMIT);
  const listed = joinSpokenItems(spoken.map(itemPhrase));
  const leadIn = spoken.length === 1 ? 'The first is' : 'The first few are';
  const more =
    input.count > VOICE_SPOKEN_ITEM_LIMIT ? ' Ask for more if you want the rest.' : '';
  return capSpeech(`Benson found ${input.count} ${noun} this weekend. ${leadIn} ${listed}.${more}`);
}

export function formatWeekendListSpeech(input: {
  count: number;
  items: Array<{ title: string; venue?: string | null }>;
}): string {
  if (input.count <= 0 || input.items.length === 0) {
    return WEEKEND_LIST_EMPTY_SPEECH;
  }
  const spoken = input.items.slice(0, VOICE_SPOKEN_ITEM_LIMIT);
  const listed = joinSpokenItems(spoken.map(itemPhrase));
  const lead =
    input.count === 1
      ? 'There is 1 item on the weekend list.'
      : `There are ${input.count} items on the weekend list.`;
  const more =
    input.count > VOICE_SPOKEN_ITEM_LIMIT ? ' Ask for more if you want the rest.' : '';
  return capSpeech(`${lead} They are ${listed}.${more}`);
}
