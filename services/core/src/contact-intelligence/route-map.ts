/**
 * Maps workbook / CRM route strings onto Contacts & Programs route + ask types.
 * Never treats media access as paid compensation.
 */

import type {
  KcAskType,
  KcCompensationAccessType,
  KcRouteType,
} from './types.js';
import { normalizeCompensationForRoute } from './labels.js';
import type { ContactChannelConcept } from './import/types.js';
import { parseProvenanceFromNotes } from './import/provenance.js';

export function routeTypeFromChannel(
  channel: ContactChannelConcept | null | undefined,
  routeRaw: string | null | undefined,
  bestUse: string | null | undefined,
): KcRouteType {
  const route = (routeRaw ?? '').toLowerCase();
  const use = (bestUse ?? '').toLowerCase();

  // Prefer published route / channel over best-use hints (best-use drives ask type).
  if (/affiliate application|affiliate/.test(route)) return 'affiliate_program';
  if (/application/.test(route) && /creator|influencer/.test(route)) return 'creator_application';
  if (/media form|official media form/.test(route)) return 'media_access';
  if (/partner page|partnership/.test(route)) return 'partnership_page';
  if (channel === 'official_form' || channel === 'affiliate_application') {
    return /affiliate/.test(route) ? 'affiliate_program' : 'official_form';
  }
  if (channel === 'phone' || /phone/.test(route)) return 'phone';
  if (channel === 'general_inbox' || /general|management|association/.test(route)) {
    return 'general_inbox';
  }
  if (channel === 'role_inbox') return 'role_inbox';
  if (channel === 'named_decision_maker') {
    if (/marketing|communications|content/.test(route)) return 'marketing_named';
    return 'pr_named';
  }
  if (/form/.test(route)) return 'official_form';
  if (/media|press|pr|publicity/.test(route)) return 'role_inbox';

  // Fallback only when route text is thin — then best-use may imply program/access paths.
  if (/affiliate/.test(use)) return 'affiliate_program';
  if (/hosted/.test(use)) return 'hosted_visit';
  if (/media access|credential/.test(use)) return 'media_access';
  return 'monitor_only';
}

export function askFromBestUse(
  bestUse: string | null | undefined,
  routeType: KcRouteType,
): { askType: KcAskType; askSummary: string; compensation: KcCompensationAccessType } {
  const use = (bestUse ?? '').toLowerCase();

  if (routeType === 'affiliate_program' || /affiliate|commission/.test(use)) {
    return {
      askType: 'affiliate_commission',
      askSummary: 'Apply through the published affiliate or creator program — use published commission terms only.',
      compensation: 'affiliate',
    };
  }
  if (routeType === 'hosted_visit' || /hosted stay|overnight|hotel stay/.test(use)) {
    return {
      askType: 'hosted_stay',
      askSummary: 'Request a hosted overnight for a stay-focused story. Compensation is not guaranteed.',
      compensation: 'hosted',
    };
  }
  if (/hosted visit|destination story|destination coverage/.test(use)) {
    return {
      askType: 'hosted_stay',
      askSummary: 'Coordinate a hosted destination visit if the DMO offers one — never assume complimentary lodging.',
      compensation: 'hosted',
    };
  }
  if (routeType === 'media_access' || /media access|credential|press/.test(use)) {
    return {
      askType: 'event_credential',
      askSummary: 'Request media access or credentials. Access is not paid work and is not guaranteed.',
      compensation: normalizeCompensationForRoute(routeType, 'media_access_not_paid'),
    };
  }
  if (/meal|dining|food|product/.test(use)) {
    return {
      askType: 'meal_or_product_consideration',
      askSummary: 'Ask about meal or product consideration for a specific content concept — not a rate card demand.',
      compensation: 'product_consideration',
    };
  }
  if (/admission|ticket|complimentary/.test(use)) {
    return {
      askType: 'complimentary_admission',
      askSummary: 'Ask about complimentary admission for coverage when that path is published.',
      compensation: 'complimentary_access',
    };
  }
  if (/interview|access/.test(use)) {
    return {
      askType: 'interview_or_access',
      askSummary: 'Request an interview or on-site access for a concrete story angle.',
      compensation: 'credential_only',
    };
  }
  if (routeType === 'general_inbox' || routeType === 'phone' || routeType === 'monitor_only') {
    return {
      askType: 'relationship_introduction',
      askSummary: 'Ask who handles creator or media partnerships — do not pitch as if this inbox is PR.',
      compensation: 'unknown',
    };
  }
  return {
    askType: 'unknown',
    askSummary: 'Ask type is unknown until compensation or access terms are published — do not invent pay.',
    compensation: 'unknown',
  };
}

export function extractWorkbookHints(notes: string | null | undefined): {
  bestUse: string | null;
  routeTypeRaw: string | null;
  area: string | null;
  confidence: string | null;
  sourceUrl: string | null;
  channelConcept: ContactChannelConcept | null;
  importKey: string | null;
} {
  const provenance = parseProvenanceFromNotes(notes);
  return {
    bestUse: provenance?.bestUse ?? null,
    routeTypeRaw: provenance?.routeType ?? null,
    area: provenance?.geoArea ?? null,
    confidence: provenance?.confidence ?? null,
    sourceUrl: provenance?.sourceUrl ?? null,
    channelConcept: provenance?.channelConcept ?? null,
    importKey: provenance?.importKey ?? null,
  };
}

export function mediaKitVariantForCategory(category: string | null | undefined): string {
  const value = (category ?? '').toLowerCase();
  if (/hotel|lodging|resort|inn/.test(value)) return 'hotel';
  if (/restaurant|dining|food|bar|bbq|cafe/.test(value)) return 'restaurant';
  if (/tourism|destination|attraction|museum|zoo|theatre|theater|sports/.test(value)) {
    return 'destination';
  }
  return 'core';
}
