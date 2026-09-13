/**
 * Repost / duplicate detection across flyers, carousel vs standalone,
 * organizer vs curator, Reel vs static, multi-account, caption edits, crops.
 * Do not merge separate showtimes. Preserve all attributions.
 */

import { hammingDistanceHex } from './cache.js';
import type { VisualEventCandidate } from './types.js';

export type DedupeIdentity = {
  platformId?: string | null;
  perceptualHash?: string | null;
  title?: string | null;
  localDatetime?: string | null;
  venue?: string | null;
  organizer?: string | null;
  ticketUrl?: string | null;
  permalink?: string | null;
  showtime?: string | null;
};

export type DedupeDecision = {
  isDuplicate: boolean;
  matchedKey: string | null;
  reason: string | null;
  /** When true, keep as separate occurrence (e.g. different showtimes). */
  preserveSeparateShowtime: boolean;
};

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function occurrenceKey(id: DedupeIdentity): string {
  return [
    norm(id.title).slice(0, 48),
    id.localDatetime ?? '',
    norm(id.venue).slice(0, 32),
    norm(id.showtime),
  ].join('|');
}

export function decideDuplicate(
  candidate: DedupeIdentity,
  known: Array<DedupeIdentity & { key: string }>,
  opts?: { perceptualThreshold?: number },
): DedupeDecision {
  const threshold = opts?.perceptualThreshold ?? 8;
  const candKey = occurrenceKey(candidate);

  for (const k of known) {
    if (candidate.platformId && k.platformId && candidate.platformId === k.platformId) {
      // Same platform post — still allow different showtimes as separate
      if (
        candidate.showtime &&
        k.showtime &&
        norm(candidate.showtime) !== norm(k.showtime) &&
        norm(candidate.title) === norm(k.title)
      ) {
        return {
          isDuplicate: false,
          matchedKey: null,
          reason: null,
          preserveSeparateShowtime: true,
        };
      }
      return {
        isDuplicate: true,
        matchedKey: k.key,
        reason: 'same_platform_id',
        preserveSeparateShowtime: false,
      };
    }

    if (
      candidate.perceptualHash &&
      k.perceptualHash &&
      hammingDistanceHex(candidate.perceptualHash, k.perceptualHash) <= threshold
    ) {
      if (
        candidate.showtime &&
        k.showtime &&
        norm(candidate.showtime) !== norm(k.showtime)
      ) {
        return {
          isDuplicate: false,
          matchedKey: null,
          reason: null,
          preserveSeparateShowtime: true,
        };
      }
      return {
        isDuplicate: true,
        matchedKey: k.key,
        reason: 'perceptual_hash_near_match',
        preserveSeparateShowtime: false,
      };
    }

    if (candKey === k.key && candKey.replace(/\|/g, '').length > 8) {
      return {
        isDuplicate: true,
        matchedKey: k.key,
        reason: 'title_datetime_venue_showtime',
        preserveSeparateShowtime: false,
      };
    }

    if (
      candidate.ticketUrl &&
      k.ticketUrl &&
      candidate.ticketUrl.split('?')[0] === k.ticketUrl.split('?')[0]
    ) {
      if (
        candidate.showtime &&
        k.showtime &&
        norm(candidate.showtime) !== norm(k.showtime)
      ) {
        return {
          isDuplicate: false,
          matchedKey: null,
          reason: null,
          preserveSeparateShowtime: true,
        };
      }
      return {
        isDuplicate: true,
        matchedKey: k.key,
        reason: 'same_ticket_url',
        preserveSeparateShowtime: false,
      };
    }
  }

  return {
    isDuplicate: false,
    matchedKey: null,
    reason: null,
    preserveSeparateShowtime: false,
  };
}

export function dedupeVisualCandidates(
  candidates: VisualEventCandidate[],
  known: Array<DedupeIdentity & { key: string }> = [],
): { kept: VisualEventCandidate[]; duplicates: VisualEventCandidate[] } {
  const kept: VisualEventCandidate[] = [];
  const duplicates: VisualEventCandidate[] = [];
  const liveKnown = [...known];

  for (const c of candidates) {
    const id: DedupeIdentity = {
      platformId: c.permalink,
      title: c.title,
      localDatetime: c.eventDate,
      venue: c.venue,
      ticketUrl: c.ticketUrl,
      permalink: c.permalink,
      showtime: c.eventTime,
    };
    const decision = decideDuplicate(id, liveKnown);
    if (decision.isDuplicate) {
      duplicates.push({
        ...c,
        decisionStage: 'duplicate',
        duplicateOf: decision.matchedKey,
        rejectionReason: decision.reason,
      });
      continue;
    }
    const key = occurrenceKey(id);
    liveKnown.push({ ...id, key });
    kept.push(c);
  }

  return { kept, duplicates };
}
