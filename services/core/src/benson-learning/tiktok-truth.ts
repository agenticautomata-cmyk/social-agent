/**
 * Connection truth must come from the live TikTok integration state, never from narrative
 * text an LLM wrote hours or days ago and that got cached in benson_learnings. This module
 * strips/corrects stale-data or "reconnect" claims from cached learning text whenever the
 * live connector state shows TikTok is actually connected and has synced recently — see
 * north-star spec item 6 ("If sync occurred recently, never say Reconnect").
 */
import type { BensonInsight } from './types.js';
import { NOTHING_NEW_SUMMARY } from './types.js';
import { isTikTokDataStale, type TikTokAnalyticsContext } from '../creator-analytics/tiktok-context.js';

// Matches sentences that assert TikTok is stale/disconnected and/or instruct a reconnect,
// e.g. "Your TikTok data is stale as of July 31, 2026. Reconnect at the provided URL to
// refresh insights." Deliberately broad — false positives just remove a stale-sounding
// clause, which is always safe when TikTok is actually connected and fresh.
const TIKTOK_STALE_CLAIM_RE =
  /[^.!?]*\btiktok\b[^.!?]*\b(stale|reconnect|out[- ]of[- ]date|hasn'?t synced|has not synced|needs? (a )?reconnect)\b[^.!?]*[.!?]/gi;
// Catches any follow-on sentence containing "reconnect" — e.g. "Reconnect at the provided
// URL to refresh insights." or "Reconnect to get the latest trends." — even when it doesn't
// repeat the word "tiktok" or a specific trailing keyword. Deliberately unqualified: this is
// only ever applied when TikTok is confirmed live and fresh (see call site), so removing any
// sentence that tells the creator to reconnect is always safe, regardless of exact phrasing.
const RECONNECT_CLAIM_RE = /[^.!?]*\breconnect\b[^.!?]*[.!?]/gi;

function stripStaleClaims(text: string): string {
  if (!text) return text;
  return text
    .replace(TIKTOK_STALE_CLAIM_RE, ' ')
    .replace(RECONNECT_CLAIM_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A summary that opens with "Nothing new to report" but is then followed by an actual
// insight is self-contradictory filler — see north-star spec item 6. Strip the false
// opener when there IS a real insight to show.
const NOTHING_NEW_OPENER_RE = /^(nothing new to report( this cycle)?\.?\s*)/i;

/**
 * Removes a self-contradictory "nothing new to report" opener when the snapshot actually
 * has at least one real insight — that phrase should only ever be the whole summary, never
 * a throwaway prefix in front of real content.
 */
export function correctNothingNewContradiction<T extends { summary: string; insights: BensonInsight[] }>(
  snapshot: T,
): TikTokTruthCorrectionResult<T> {
  if (snapshot.insights.length === 0) return { snapshot, corrected: false };
  if (!NOTHING_NEW_OPENER_RE.test(snapshot.summary)) return { snapshot, corrected: false };

  const stripped = snapshot.summary.replace(NOTHING_NEW_OPENER_RE, '').trim();
  const nextSummary = stripped || snapshot.summary;
  if (nextSummary === snapshot.summary) return { snapshot, corrected: false };

  return { snapshot: { ...snapshot, summary: nextSummary }, corrected: true };
}

export type TikTokTruthCorrectionResult<T extends { summary: string; insights: BensonInsight[] }> = {
  snapshot: T;
  corrected: boolean;
};

/**
 * Rewrites a learning snapshot in place (returning a new object) so it never contradicts
 * the live TikTok connection state. Only acts when TikTok is actually connected and fresh —
 * if TikTok really is stale/disconnected, the cached text is left untouched since it's true.
 */
export function correctTikTokStaleClaims<T extends { summary: string; insights: BensonInsight[] }>(
  snapshot: T,
  liveTikTokContext: Pick<TikTokAnalyticsContext, 'connected' | 'connectionStatus' | 'lastSuccessfulSyncAt'>,
): TikTokTruthCorrectionResult<T> {
  if (isTikTokDataStale(liveTikTokContext)) {
    // The cached claim is true (or at least not contradicted) — leave it as-is.
    return { snapshot, corrected: false };
  }

  let corrected = false;
  const nextSummaryRaw = stripStaleClaims(snapshot.summary);
  const nextSummary = nextSummaryRaw || NOTHING_NEW_SUMMARY;
  if (nextSummary !== snapshot.summary) corrected = true;

  const nextInsights = snapshot.insights.map((item) => {
    const nextInsightText = stripStaleClaims(item.insight) || item.insight;
    const nextActionText = stripStaleClaims(item.action) || item.action;
    if (nextInsightText !== item.insight || nextActionText !== item.action) {
      corrected = true;
      return { ...item, insight: nextInsightText, action: nextActionText };
    }
    return item;
  });

  if (!corrected) return { snapshot, corrected: false };

  return {
    snapshot: {
      ...snapshot,
      summary: nextSummary,
      insights: nextInsights,
    },
    corrected: true,
  };
}
