import type { CalendarAdmissionCandidate, CalendarAdmissionReasonCode } from '../types.js';

export type CompletenessGateResult = {
  ok: boolean;
  quarantine: boolean;
  reason: CalendarAdmissionReasonCode | null;
  detail: string;
  missing: string[];
};

/**
 * Usable title, verified start, verified KC location (handled separately),
 * canonical URL / attribution / identity. Never fabricate.
 */
export function evaluateCompletenessGate(c: CalendarAdmissionCandidate): CompletenessGateResult {
  const missing: string[] = [];
  const title = (c.title ?? '').trim();
  if (title.length < 4) missing.push('title');
  if (!c.eventDate?.trim()) missing.push('start');
  const hasUrl = Boolean(c.sourceUrl?.trim());
  const hasAttribution = Boolean(
    (c.attribution ?? '').trim() ||
      (c.sourceName ?? '').trim() ||
      c.watchlistVerified ||
      c.userConfirmed,
  );
  if (!hasUrl && !hasAttribution) missing.push('url_or_attribution');

  if (missing.includes('title') || missing.includes('start')) {
    return {
      ok: false,
      quarantine: false,
      reason: 'missing_required_fields',
      detail: `missing:${missing.join(',')}`,
      missing,
    };
  }

  if (missing.includes('url_or_attribution')) {
    return {
      ok: false,
      quarantine: true,
      reason: 'missing_required_fields',
      detail: 'missing_url_or_attribution',
      missing,
    };
  }

  return { ok: true, quarantine: false, reason: null, detail: 'complete', missing };
}
