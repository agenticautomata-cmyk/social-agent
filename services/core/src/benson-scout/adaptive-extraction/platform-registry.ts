/**
 * Stage 4 — platform recognition by signature evidence (not domain guesses).
 */

import { detectEventListingCapability } from '../event-listing-extract.js';
import { sitemapSuggestsRhpEvents } from './surface-discovery.js';
import type { PlatformRecognition, PlatformSignatureId } from './types.js';

const RHP_HTML_MARKERS = [
  /wp-content\/plugins\/rhp-events/i,
  /rhp-events-icon/i,
  /single-rhp_events/i,
  /post-type-archive-rhp_events/i,
  /id=["']RhpEventsSingle["']/i,
  /eventDoorStartDate/i,
  /type-rhp_events/i,
  /rhp-events-page-title/i,
];

export function detectRhpEventsSignals(html: string): boolean {
  return RHP_HTML_MARKERS.some((re) => re.test(html));
}

export function recognizePlatforms(input: {
  html: string;
  pageUrl: string;
  sitemapXml?: string | null;
  acquisitionKind?: string | null;
}): PlatformRecognition[] {
  const html = input.html ?? '';
  const out: PlatformRecognition[] = [];
  const cap = detectEventListingCapability(html, input.pageUrl);

  const push = (
    signature: PlatformSignatureId,
    confidence: number,
    evidence: string[],
    profileKey: string,
  ) => {
    out.push({ signature, confidence, evidence, profileKey });
  };

  if (detectRhpEventsSignals(html)) {
    push(
      'wordpress_rhp_events',
      0.92,
      ['rhp-events plugin/DOM markers'],
      'wordpress:rhp_events:v1',
    );
  } else if (input.sitemapXml && sitemapSuggestsRhpEvents(input.sitemapXml)) {
    push(
      'wordpress_rhp_events',
      0.78,
      ['sitemap CPT rhp_events / rhp_venue'],
      'wordpress:rhp_events:v1',
    );
  }

  if (cap.hasWordpressTecSignals || cap.hasWordpressEventMarkup) {
    push(
      'wordpress_tec',
      cap.hasTribeEventsListMarkup || cap.hasWordpressTecSignals ? 0.9 : 0.7,
      cap.reasons.filter((r) => /wordpress|tribe|tec/i.test(r)),
      'wordpress:tec:v1',
    );
  }
  if (cap.hasWixEventsSignals || cap.isWixSite) {
    push(
      'wix_events',
      cap.hasWixEventsSignals ? 0.9 : 0.55,
      cap.reasons.filter((r) => /wix/i.test(r)),
      'wix:events:v1',
    );
  }
  if (cap.hasSquarespaceEventsSignals || cap.isSquarespaceSite) {
    push(
      'squarespace_events',
      cap.hasSquarespaceEventsSignals ? 0.9 : 0.5,
      cap.reasons.filter((r) => /squarespace/i.test(r)),
      'squarespace:events:v1',
    );
  }
  if (cap.hasTheaterSeasonSignals) {
    push('theater_season', 0.85, ['theater_season_production_sections'], 'theater:season:v1');
  }
  if (cap.hasJsonLdEvents) {
    push('schema_org_events', 0.88, ['json_ld_events'], 'schema:event:v1');
  }
  if (cap.hasEmbeddedJsonEventCatalog) {
    push(
      'js_hydration_shell',
      0.82,
      ['embedded_json_event_catalog', 'next_data_or_hydration_events'],
      'generic:embedded_json_events:v1',
    );
  } else if (
    input.acquisitionKind === 'js_shell' ||
    (/__HYDRATION__|__NEXT_DATA__/i.test(html) && !cap.hasWixEventsSignals)
  ) {
    push('js_hydration_shell', 0.6, ['js_shell_or_hydration'], 'generic:hydration:v1');
  }
  if (cap.hasIcsLinks) {
    push('ics_calendar', 0.8, ['ics_links'], 'ics:calendar:v1');
  }
  if (/mec-event|modern-events-calendar|mec-wrap/i.test(html)) {
    push('wordpress_mec', 0.75, ['mec_markers'], 'wordpress:mec:v1');
  }
  if (/eventbrite\.com|ebcdn\.com|Eventbrite/i.test(html)) {
    push('eventbrite', 0.7, ['eventbrite_signals'], 'eventbrite:v1');
  }
  if (/do816\.com|dostuffmedia|DoStuff/i.test(html)) {
    push('dostuff', 0.7, ['dostuff_signals'], 'dostuff:v1');
  }
  if (cap.hasRepeatedEventBlocks || cap.hasDateGroupedHtmlCalendar) {
    push(
      'generic_semantic_html',
      cap.hasDateGroupedHtmlCalendar ? 0.72 : 0.55,
      cap.reasons.filter((r) => /date_grouped|repeated_event|embedded_json/i.test(r)),
      'generic:semantic:v1',
    );
  }
  if (out.length === 0) {
    push('unknown', 0.1, ['no_platform_signature'], 'unknown:v1');
  }

  return out.sort((a, b) => b.confidence - a.confidence);
}

export function selectPreferredPlatform(
  platforms: PlatformRecognition[],
): PlatformRecognition | null {
  return platforms[0] ?? null;
}
