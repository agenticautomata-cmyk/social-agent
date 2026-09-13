/**
 * Deterministic extraction strategy planner.
 * Ranks first-party structured → feed → JSON-LD → SSR → browser → detail →
 * ticket provider → generic DOM → OCR → review/failure.
 * Older profile must not override stronger current evidence.
 */

import type {
  AdaptiveStrategyProfile,
  DiscoveredSurface,
  PlannedStrategy,
  PlatformRecognition,
  SurfaceAttempt,
  SurfaceTrustLevel,
} from './types.js';
import { trustForKind } from './surface-graph.js';

const COST: Record<string, PlannedStrategy['estimatedCost']> = {
  first_party_structured: 'low',
  first_party_feed: 'low',
  first_party_html: 'medium',
  embedded_provider: 'medium',
  inferred_convention: 'low',
  unverified: 'high',
};

function baseRank(trust: SurfaceTrustLevel, kind: string): number {
  const trustScore: Record<SurfaceTrustLevel, number> = {
    first_party_structured: 1000,
    first_party_feed: 900,
    first_party_html: 700,
    embedded_provider: 500,
    inferred_convention: 400,
    unverified: 100,
  };
  let score = trustScore[trust] ?? 100;
  if (/ics|tec_rest|wp_rest|json_ld|embedded_json|public_network/i.test(kind)) score += 80;
  if (/rss|atom|json_feed|wp_cpt_feed/i.test(kind)) score += 60;
  if (/calendar_collection|canonical_events/i.test(kind)) score += 40;
  if (/event_detail/i.test(kind)) score += 20;
  if (/browser/i.test(kind)) score -= 30;
  if (/ticket_provider/i.test(kind)) score -= 10;
  return score;
}

export function planExtractionStrategies(input: {
  configuredUrl: string;
  surfaces: DiscoveredSurface[];
  platforms: PlatformRecognition[];
  priorProfile?: AdaptiveStrategyProfile | null;
  acquisitionChallenged?: boolean;
}): PlannedStrategy[] {
  const plans: PlannedStrategy[] = [];
  const selectedPlatform = input.platforms[0] ?? null;
  const priorBoost =
    input.priorProfile &&
    selectedPlatform &&
    input.priorProfile.profileKey === selectedPlatform.profileKey &&
    input.priorProfile.trustedPromotion
      ? 15
      : 0;

  const push = (partial: Omit<PlannedStrategy, 'rank' | 'selected'> & { rankBoost?: number }) => {
    const trust = partial.trustLevel;
    const rank = baseRank(trust, partial.methodHint) + (partial.rankBoost ?? 0) + priorBoost;
    plans.push({
      id: partial.id,
      rank,
      surfaceUrl: partial.surfaceUrl,
      methodHint: partial.methodHint,
      reasonSelected: partial.reasonSelected,
      reasonRejected: partial.reasonRejected,
      selected: false,
      estimatedCost: partial.estimatedCost,
      trustLevel: trust,
    });
  };

  push({
    id: 'configured_direct',
    surfaceUrl: input.configuredUrl,
    methodHint: 'configured_html_or_structured',
    reasonSelected: 'Preserve configured Watchlist URL as primary acquisition target',
    reasonRejected: input.acquisitionChallenged
      ? 'Configured URL challenged/access-controlled — keep as observation, continue ladder'
      : null,
    estimatedCost: 'low',
    trustLevel: 'first_party_html',
    rankBoost: input.acquisitionChallenged ? -200 : 50,
  });

  for (const s of input.surfaces) {
    const trust = trustForKind(s.kind);
    const id = `${s.kind}:${s.url}`;
    let reasonSelected = s.selectionReason ?? (s.evidence.join('; ') || s.kind);
    let reasonRejected: string | null = null;
    let methodHint: string = s.kind;
    let rankBoost = 0;

    if (s.kind === 'sitemap_index' || s.kind === 'sitemap_urlset' || s.kind === 'robots_txt') {
      methodHint = 'discovery_only';
      reasonSelected = 'Site-declared discovery surface';
      rankBoost = -50;
    } else if (s.kind === 'ics_feed' || s.kind === 'tec_ics') {
      methodHint = 'ics_calendar';
      reasonSelected = 'First-party calendar subscription / ICS';
      rankBoost = 40;
    } else if (s.kind === 'rss_atom' || s.kind === 'wp_cpt_feed' || s.kind === 'json_feed') {
      methodHint = 'feed_extract';
      reasonSelected = 'First-party feed (RSS/Atom/JSON Feed / CPT)';
      rankBoost = 35;
    } else if (s.kind === 'wp_rest' || s.kind === 'tec_rest' || s.kind === 'public_network_json') {
      methodHint = 'structured_endpoint';
      reasonSelected = 'Public structured/API surface after platform or link evidence';
      rankBoost = 45;
    } else if (s.kind === 'calendar_collection' || s.kind === 'canonical_events_archive') {
      methodHint = 'collection_html';
      reasonSelected = 'Same-publisher collection/calendar path from site declaration';
      rankBoost = input.acquisitionChallenged ? 55 : 25;
    } else if (s.kind === 'event_detail_urls') {
      methodHint = 'event_detail_html';
      reasonSelected = 'Sitemap-listed individual event pages (bounded sample)';
      // Details are last resort when collections are challenged.
      rankBoost = input.acquisitionChallenged ? -5 : 10;
    } else if (s.kind === 'ticket_provider') {
      methodHint = 'embedded_ticket_provider';
      reasonSelected = 'Publisher-linked public ticket provider';
      if (!s.evidence.some((e) => /linked_by_publisher|href|embed/i.test(e))) {
        reasonRejected = 'No publisher-linked evidence for ticket provider';
      }
    } else if (s.kind === 'same_origin_semantic') {
      methodHint = 'semantic_link_follow';
      reasonSelected = s.selectionReason ?? 'Bounded same-origin semantic link';
    }

    // Platform-convention surfaces require positive platform evidence.
    if (
      (s.kind === 'wp_cpt_feed' || s.kind === 'wp_rest' || s.kind === 'tec_rest') &&
      (!selectedPlatform || selectedPlatform.signature === 'unknown') &&
      !(s.platformEvidence && s.platformEvidence.length)
    ) {
      reasonRejected = 'Rejected: platform convention without positive platform evidence';
      rankBoost -= 500;
    }

    push({
      id,
      surfaceUrl: s.url,
      methodHint,
      reasonSelected,
      reasonRejected,
      estimatedCost: COST[trust] ?? 'medium',
      trustLevel: trust,
      rankBoost,
    });
  }

  push({
    id: 'browser_fallback',
    surfaceUrl: input.configuredUrl,
    methodHint: 'public_browser_render',
    reasonSelected: 'Permitted unauthenticated browser when HTTP incomplete/challenged/JS shell',
    reasonRejected: null,
    estimatedCost: 'high',
    trustLevel: 'first_party_html',
    rankBoost: input.acquisitionChallenged ? 5 : -40,
  });

  push({
    id: 'generic_semantic',
    surfaceUrl: input.configuredUrl,
    methodHint: 'generic_semantic_html',
    reasonSelected: 'Generic semantic DOM extraction when structured adapters yield nothing',
    reasonRejected: null,
    estimatedCost: 'medium',
    trustLevel: 'first_party_html',
    rankBoost: -20,
  });

  push({
    id: 'image_ocr',
    surfaceUrl: null,
    methodHint: 'image_ocr_local',
    reasonSelected: 'Optional local OCR on public images (vision billable disabled by default)',
    reasonRejected: 'Disabled by default — image-only without corroboration is reviewable only',
    estimatedCost: 'high',
    trustLevel: 'unverified',
    rankBoost: -80,
  });

  // Stronger current platform evidence outranks stale prior method alone.
  if (selectedPlatform && selectedPlatform.confidence >= 0.7) {
    push({
      id: `platform:${selectedPlatform.signature}`,
      surfaceUrl: input.configuredUrl,
      methodHint: selectedPlatform.signature,
      reasonSelected: `Current platform evidence (${selectedPlatform.evidence.join('; ')})`,
      reasonRejected: null,
      estimatedCost: 'low',
      trustLevel: 'first_party_html',
      rankBoost: Math.round(selectedPlatform.confidence * 50),
    });
  }

  const sorted = plans.sort((a, b) => b.rank - a.rank);
  // Mark top non-rejected extraction candidates as selected (planner picks order).
  let selectedCount = 0;
  for (const p of sorted) {
    if (p.reasonRejected) continue;
    if (p.methodHint === 'discovery_only') continue;
    p.selected = selectedCount < 12;
    selectedCount += 1;
  }
  return sorted;
}

export function explainPlanRejection(plans: PlannedStrategy[]): string[] {
  return plans.filter((p) => p.reasonRejected).map((p) => `${p.id}: ${p.reasonRejected}`);
}

export function bestAttemptYield(attempts: SurfaceAttempt[]): SurfaceAttempt | null {
  const useful = attempts
    .filter((a) => a.usefulness === 'events_extracted' && a.eventCount > 0)
    .sort((a, b) => b.eventCount - a.eventCount);
  return useful[0] ?? null;
}
