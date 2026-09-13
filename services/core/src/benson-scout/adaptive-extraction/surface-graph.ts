/**
 * First-party alternative-surface evidence graph.
 * Records discovery method, HTTP result, usefulness, and trust — never invents URLs.
 */

import type {
  AcquisitionKind,
  DiscoveredSurface,
  DiscoveredSurfaceKind,
  SurfaceAttempt,
  SurfaceTrustLevel,
} from './types.js';

export function trustForKind(kind: DiscoveredSurfaceKind | string): SurfaceTrustLevel {
  switch (kind) {
    case 'ics_feed':
    case 'tec_rest':
    case 'tec_ics':
    case 'wp_rest':
    case 'public_network_json':
    case 'json_ld':
    case 'embedded_json':
      return 'first_party_structured';
    case 'rss_atom':
    case 'json_feed':
    case 'wp_cpt_feed':
      return 'first_party_feed';
    case 'calendar_collection':
    case 'canonical_events_archive':
    case 'event_detail_urls':
    case 'same_origin_semantic':
    case 'browser_document':
    case 'series_or_category':
      return 'first_party_html';
    case 'ticket_provider':
      return 'embedded_provider';
    case 'sitemap_index':
    case 'sitemap_urlset':
    case 'robots_txt':
    case 'link_alternate':
      return 'inferred_convention';
    default:
      return 'unverified';
  }
}

export function recordSurfaceAttempt(input: {
  surface?: DiscoveredSurface | null;
  url: string;
  kind?: DiscoveredSurfaceKind | string;
  discoveryMethod?: string;
  referringSurface?: string | null;
  platformEvidence?: string[];
  httpStatus?: number | null;
  contentType?: string | null;
  acquisitionKind?: AcquisitionKind | string | null;
  challengeProvider?: string | null;
  usefulness: SurfaceAttempt['usefulness'];
  eventCount?: number;
  notes?: string[];
}): SurfaceAttempt {
  const kind = input.kind ?? input.surface?.kind ?? 'configured_url';
  return {
    url: input.url,
    kind,
    discoveryMethod:
      input.discoveryMethod ??
      input.surface?.discoveryMethod ??
      input.surface?.evidence?.[0] ??
      'unknown',
    referringSurface: input.referringSurface ?? input.surface?.referringSurface ?? null,
    platformEvidence: input.platformEvidence ?? input.surface?.platformEvidence ?? [],
    httpStatus: input.httpStatus ?? null,
    contentType: input.contentType ?? null,
    acquisitionKind: input.acquisitionKind ?? null,
    challengeProvider: input.challengeProvider ?? null,
    usefulness: input.usefulness,
    eventCount: input.eventCount ?? 0,
    trustLevel: trustForKind(kind),
    notes: input.notes ?? [],
  };
}

export function summarizeSurfaceGraph(attempts: SurfaceAttempt[]): string[] {
  return attempts.map((a) => {
    const status = a.httpStatus != null ? `HTTP ${a.httpStatus}` : 'no_http';
    return `${a.kind} ${a.url} · ${status} · ${a.usefulness}${
      a.eventCount ? ` · ${a.eventCount} events` : ''
    }${a.challengeProvider ? ` · ${a.challengeProvider}` : ''}`;
  });
}

export function mergeSurfaces(
  existing: DiscoveredSurface[],
  next: DiscoveredSurface[],
): DiscoveredSurface[] {
  const seen = new Set(existing.map((s) => `${s.kind}|${s.url}`));
  const out = [...existing];
  for (const s of next) {
    const key = `${s.kind}|${s.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
