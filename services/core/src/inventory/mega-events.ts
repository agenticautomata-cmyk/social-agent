/** KC mega-event windows — keep current-event logic out of normalize/content-freshness cycles. */

import { getLocalCalendarDay } from '../datetime.js';

export const WORLD_CUP_TEXT_RE =
  /\b(world cup|fifa|soccer capital|kickoff to the cup|sporting plaza|world cup 26|wc26|fan fest|fan festival)\b/i;

export const KC_THRIFT_TOURS_TEXT_RE =
  /\b(kc thrift tours?|thrift tours? party bus|thrift tour bus|thrift tour(?:s)? on (?:the )?bus)\b/i;

function parseKcThriftToursEventDate(): string {
  const raw = process.env.KC_THRIFT_TOURS_EVENT_DATE?.trim();
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return '2026-07-18';
}

export const KC_THRIFT_TOURS_EVENT_DATE = parseKcThriftToursEventDate();

export function textHasKcThriftToursAngle(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return KC_THRIFT_TOURS_TEXT_RE.test(text);
}

/** True on the scheduled KC Thrift Tours party bus shoot day (creator timezone). */
export function isKcThriftToursEventDay(now = new Date()): boolean {
  return getLocalCalendarDay(now) === KC_THRIFT_TOURS_EVENT_DATE;
}

function parseKcWorldCupTournamentEnd(): Date {
  const raw = process.env.KC_WORLD_CUP_TOURNAMENT_END?.trim();
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  // KC group-stage window ended — treat as over after July 7, 2026 Central.
  return new Date('2026-07-08T05:00:00.000Z');
}

const KC_WORLD_CUP_TOURNAMENT_END = parseKcWorldCupTournamentEnd();

export function isWorldCupSeasonActive(now = new Date()): boolean {
  return now.getTime() < KC_WORLD_CUP_TOURNAMENT_END.getTime();
}

export function textHasWorldCupAngle(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return WORLD_CUP_TEXT_RE.test(text);
}

export function worldCupSeasonStatusLabel(now = new Date()): string {
  return isWorldCupSeasonActive(now)
    ? 'KC World Cup matches in progress'
    : 'KC World Cup tournament ended — pivot to current KC events';
}
