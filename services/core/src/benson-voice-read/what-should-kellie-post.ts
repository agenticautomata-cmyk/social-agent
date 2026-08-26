/**
 * Voice read: "What should Kellie post today?"
 *
 * Authority: inventory Command Center `sections.postToday`
 * (same ranking as the operator question — filmable/content lane via
 * isEligiblePostToday + scorePostToday). No Home showroom, no LLM,
 * no scrape/search/calendar projection.
 */
import { computeCommandCenter, type CommandCenterCard } from '../inventory/command-center.js';
import type { InventoryItem } from '../inventory/normalize.js';
import { loadPostTodayVoiceInventoryCandidates } from './load-post-today-voice-candidates.js';
import { stripVoiceUnsafeText } from './formatter.js';
import {
  type VoiceWhatShouldKelliePostItem,
  type VoiceWhatShouldKelliePostResponse,
  VOICE_SPEECH_MAX_CHARS,
  VOICE_SPOKEN_ITEM_LIMIT,
  WHAT_SHOULD_KELLIE_POST_EMPTY_SPEECH,
} from './types.js';

/**
 * Voice-only content gate (not a second score).
 * postToday ranking remains Command Center authority; this drops explicit
 * non-content housekeeping the Alexa question must not answer with.
 */
const NON_CONTENT_POST_ACTION_RE =
  /\b(send (a )?sponsor pitch|reply to .{0,48}\bemail|verify date|confirm date)\b/i;

function isContentPostVoiceCandidate(card: CommandCenterCard): boolean {
  const hay = `${card.title} ${card.whySummary ?? ''} ${card.whyItMatters ?? ''}`;
  return !NON_CONTENT_POST_ACTION_RE.test(hay);
}
function includesInsensitive(haystack: string, needle: string): boolean {
  if (!needle.trim()) return false;
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

function ensureSentence(text: string): string {
  const t = text.trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function cardTitle(card: CommandCenterCard): string {
  return stripVoiceUnsafeText(card.displayTitle || card.title);
}

function cardReason(card: CommandCenterCard): string {
  return stripVoiceUnsafeText(card.whySummary || card.whyItMatters || '');
}

function cardWhen(card: CommandCenterCard): string | null {
  const label = card.whenLabel ? stripVoiceUnsafeText(card.whenLabel) : '';
  return label || null;
}

function cardArea(card: CommandCenterCard): string | null {
  const label = card.whereLabel ? stripVoiceUnsafeText(card.whereLabel) : '';
  return label || null;
}

function toVoiceItem(card: CommandCenterCard): VoiceWhatShouldKelliePostItem | null {
  const title = cardTitle(card);
  if (!title) return null;
  const reason = cardReason(card);
  const when = cardWhen(card);
  const area = cardArea(card);
  return {
    contentItemId: card.id,
    title,
    reason,
    when,
    area,
    homeFilmable: card.lane === 'film_this',
    // APL detail: reason · when · area
    day: reason,
    time: when,
    venue: area,
  };
}

function capSpeech(speech: string): string {
  const clean = stripVoiceUnsafeText(speech);
  if (clean.length <= VOICE_SPEECH_MAX_CHARS) return clean;
  return `${clean.slice(0, VOICE_SPEECH_MAX_CHARS - 1).trimEnd()}…`;
}

export function formatWhatShouldKelliePostSpeech(
  items: Array<Pick<VoiceWhatShouldKelliePostItem, 'title' | 'reason' | 'when' | 'area'>>,
): string {
  if (items.length === 0) return WHAT_SHOULD_KELLIE_POST_EMPTY_SPEECH;

  const top = items[0]!;
  const parts: string[] = [`Kellie's strongest post today is ${top.title}.`];
  if (top.reason) parts.push(ensureSentence(top.reason));

  const extras: string[] = [];
  if (top.when && !includesInsensitive(top.reason, top.when)) extras.push(top.when);
  if (top.area && !includesInsensitive(top.reason, top.area)) extras.push(top.area);
  if (extras.length > 0) {
    parts.push(ensureSentence(extras.join(' · ')));
  }

  if (items.length === 2) parts.push('I have one more if you want it.');
  else if (items.length >= 3) parts.push('I have two more if you want them.');

  return capSpeech(parts.join(' '));
}

export function shapeWhatShouldKelliePostVoice(
  items: InventoryItem[],
  now: Date = new Date(),
): VoiceWhatShouldKelliePostResponse {
  const center = computeCommandCenter(items, {
    now,
    limit: 4,
    sections: ['postToday'],
  });
  const voiceItems: VoiceWhatShouldKelliePostItem[] = [];
  for (const card of center.sections.postToday.items) {
    if (voiceItems.length >= VOICE_SPOKEN_ITEM_LIMIT) break;
    if (!isContentPostVoiceCandidate(card)) continue;
    const shaped = toVoiceItem(card);
    if (shaped) voiceItems.push(shaped);
  }
  return {
    operation: 'what_should_kellie_post',
    count: voiceItems.length,
    items: voiceItems,
    speech: formatWhatShouldKelliePostSpeech(voiceItems),
  };
}

export async function loadWhatShouldKelliePostVoice(
  now: Date = new Date(),
  loadItems: (now: Date) => Promise<InventoryItem[]> = loadPostTodayVoiceInventoryCandidates,
): Promise<VoiceWhatShouldKelliePostResponse> {
  const items = await loadItems(now);
  return shapeWhatShouldKelliePostVoice(items, now);
}
