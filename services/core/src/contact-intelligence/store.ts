/**
 * Contact intelligence hub — recommendations, briefs, and feedback.
 * Never invents emails; never marks guessed contacts send-ready.
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  bensonRecommendationEvents,
  mediaKits,
  outreachEmails,
  sponsorContacts,
} from '../schema.js';
import { evaluateContactEvidence } from '../partnership-contracts/contact-evidence.js';
import {
  applyFreshnessToDiscoveryState,
  evaluateDiscoveryFreshness,
  fromSendEvidenceState,
  type DiscoveryContactState,
} from './discovery/index.js';
import { parseProvenanceFromNotes } from './import/provenance.js';
import {
  MEDIA_ACCESS_DEFAULT_DISCLAIMER,
} from './labels.js';
import {
  askFromBestUse,
  extractWorkbookHints,
  mediaKitVariantForCategory,
  routeTypeFromChannel,
} from './route-map.js';
import type {
  KcBriefResponse,
  KcContactBrief,
  KcContactEvidenceState,
  KcContactIntelligenceFilters,
  KcFeedbackAction,
  KcFeedbackResponse,
  KcFormPacketField,
  KcFreshnessBucket,
  KcHubListResponse,
  KcHubView,
  KcProgramRow,
  KcRecommendationCard,
  KcRouteType,
} from './types.js';

export const CONTACT_INTELLIGENCE_UX_STUB = false as const;

type ContactRow = typeof sponsorContacts.$inferSelect;

type KitRow = {
  id: string;
  name: string;
  businessVariant: string | null;
  webSlug: string | null;
};

type ProgramLibRow = {
  id: string;
  brandName: string;
  programName: string | null;
  programType: string | null;
  benefit: string | null;
  audienceBenefit: string | null;
  requirements: string | null;
  applicationUrl: string | null;
  officialUrl: string | null;
  verificationState: string | null;
  lastVerifiedAt: string | null;
  notes: string | null;
  cookieWindow: string | null;
  commissionBenefit: string | null;
};

type OutreachLite = {
  sponsorContactId: string;
  status: string;
  updatedAt: Date;
};

const DISMISS_SILENCE_DAYS = 45;

function freshnessBucket(
  status: ReturnType<typeof evaluateDiscoveryFreshness>['status'],
): KcFreshnessBucket {
  switch (status) {
    case 'fresh':
      return 'fresh';
    case 'due_soon':
      return 'aging';
    case 'overdue':
    case 'immediate_named':
    case 'important_pitch_recheck':
    case 'conflict_quarantine':
      return 'stale';
    default:
      return 'unknown';
  }
}

function toKcEvidenceState(state: DiscoveryContactState): KcContactEvidenceState {
  return state;
}

function whyFitFor(category: string | null, bestUse: string | null, business: string): string {
  if (bestUse?.trim()) {
    return `${business} fits because the published route is aimed at ${bestUse.trim().toLowerCase()}, which matches Kellie's Kansas City lifestyle and local-story work.`;
  }
  if (category?.trim()) {
    return `${business} is a ${category.trim()} partner in the KC metro — useful when Kellie has a concrete local angle, not as a generic blast list.`;
  }
  return `${business} is in Kellie's Kansas City contact map. Recommend only when a specific content concept and route are ready.`;
}

function contentConceptFor(
  category: string | null,
  bestUse: string | null,
  routeType: KcRouteType,
): string {
  const use = (bestUse ?? '').toLowerCase();
  if (/hosted|overnight|stay/.test(use) || routeType === 'hosted_visit') {
    return 'One continuous evening/overnight arc: arrival, room or neighbourhood, one meal, one local detail — not a generic amenity list.';
  }
  if (/destination|tourism|visit/.test(use + (category ?? ''))) {
    return 'A day-in-KC destination piece with one clear neighbourhood or attraction spine Kellie already covers.';
  }
  if (/restaurant|dining|bbq|food/.test(category ?? '') || /meal|dining/.test(use)) {
    return 'A dining story with appetite-first visuals and one honest local tip — not a full menu walkthrough.';
  }
  if (routeType === 'affiliate_program') {
    return 'Shop / recommend content only when the product fits an existing Kellie series — never a cold affiliate dump.';
  }
  if (routeType === 'media_access') {
    return 'Event coverage with credentialed access: arrival energy, one standout moment, one local context beat.';
  }
  return 'A specific KC lifestyle angle tied to what this business actually offers — invent nothing about compensation.';
}

function valueToOrg(routeType: KcRouteType, category: string | null): string {
  if (routeType === 'affiliate_program') {
    return 'Qualified referral traffic from a local creator audience when the product fit is real.';
  }
  if (routeType === 'hosted_visit' || /hotel/i.test(category ?? '')) {
    return 'Authentic stay content that reads local — not tourist brochure copy.';
  }
  if (routeType === 'media_access') {
    return 'Coverage reach among Kansas City locals who actually attend.';
  }
  return 'Local creator storytelling that shows the business in a real Kansas City context.';
}

function weaknessesFor(input: {
  evidenceState: KcContactEvidenceState;
  routeType: KcRouteType;
  email: string | null;
  formUrl: string | null;
  freshness: KcFreshnessBucket;
  conflictNote: string | null;
  generalInbox: boolean;
}): string[] {
  const out: string[] = [];
  if (input.evidenceState === 'inferred_unverified' || input.evidenceState === 'unknown') {
    out.push('Contact is not send-ready — verify on an official page first.');
  }
  if (input.evidenceState === 'stale_needs_recheck' || input.freshness === 'stale') {
    out.push('Evidence needs a freshness recheck before pitching.');
  }
  if (input.evidenceState === 'conflicting' || input.conflictNote) {
    out.push('Conflicting contact evidence is on file — resolve before outreach.');
  }
  if (input.generalInbox) {
    out.push('Only a general inbox is published — not a dedicated PR desk.');
  }
  if (input.routeType === 'media_access') {
    out.push('Media access is not paid work and is not guaranteed.');
  }
  if (!input.email && !input.formUrl) {
    out.push('No email or form route — phone or research may be required.');
  }
  if (input.routeType === 'monitor_only') {
    out.push('Monitor-only until a published partnership route appears.');
  }
  return out;
}

async function loadActiveKits(): Promise<KitRow[]> {
  const rows = await db
    .select({
      id: mediaKits.id,
      name: mediaKits.name,
      businessVariant: mediaKits.businessVariant,
      webSlug: mediaKits.webSlug,
    })
    .from(mediaKits)
    .where(and(eq(mediaKits.active, true), eq(mediaKits.isTestArtifact, false)));
  return rows;
}

function pickKit(kits: KitRow[], variant: string): KitRow | null {
  return (
    kits.find((k) => (k.businessVariant ?? '').toLowerCase() === variant) ??
    kits.find((k) => (k.businessVariant ?? '').toLowerCase() === 'core') ??
    kits[0] ??
    null
  );
}

async function loadPrograms(): Promise<ProgramLibRow[]> {
  const rows = (await db.execute(sql`
    SELECT id,
           brand_name AS "brandName",
           metadata->'programLibrary'->>'programName' AS "programName",
           metadata->'programLibrary'->>'programType' AS "programType",
           metadata->'programLibrary'->'commissionBenefit'->>'value' AS "commissionBenefit",
           metadata->'programLibrary'->'audienceBenefit'->>'value' AS "audienceBenefit",
           metadata->'programLibrary'->'eligibility'->>'value' AS "requirements",
           metadata->'programLibrary'->'applicationUrl'->>'value' AS "applicationUrl",
           metadata->'programLibrary'->'officialProgramUrl'->>'value' AS "officialUrl",
           metadata->'programLibrary'->>'verificationDisplayState' AS "verificationState",
           metadata->'programLibrary'->>'lastVerifiedAt' AS "lastVerifiedAt",
           metadata->'programLibrary'->>'notes' AS "notes",
           metadata->'programLibrary'->'cookieWindow'->>'value' AS "cookieWindow"
    FROM creator_partnerships
    WHERE metadata ? 'programLibrary'
    ORDER BY updated_at DESC
  `)) as unknown as ProgramLibRow[];
  return Array.isArray(rows) ? rows : [];
}

async function loadRecentOutreach(): Promise<Map<string, OutreachLite>> {
  const rows = await db
    .select({
      sponsorContactId: outreachEmails.sponsorContactId,
      status: outreachEmails.status,
      updatedAt: outreachEmails.updatedAt,
    })
    .from(outreachEmails)
    .orderBy(desc(outreachEmails.updatedAt))
    .limit(500);
  const map = new Map<string, OutreachLite>();
  for (const row of rows) {
    if (!row.sponsorContactId) continue;
    if (!map.has(row.sponsorContactId)) {
      map.set(row.sponsorContactId, {
        sponsorContactId: row.sponsorContactId,
        status: row.status,
        updatedAt: row.updatedAt,
      });
    }
  }
  return map;
}

async function loadDismissedContactIds(now = new Date()): Promise<Set<string>> {
  const since = new Date(now.getTime() - DISMISS_SILENCE_DAYS * 86_400_000);
  const rows = await db
    .select({
      metadata: bensonRecommendationEvents.metadata,
      userResponse: bensonRecommendationEvents.userResponse,
      respondedAt: bensonRecommendationEvents.respondedAt,
      createdAt: bensonRecommendationEvents.createdAt,
    })
    .from(bensonRecommendationEvents)
    .where(eq(bensonRecommendationEvents.source, 'contact_intelligence'))
    .orderBy(desc(bensonRecommendationEvents.createdAt))
    .limit(400);

  const dismissed = new Set<string>();
  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const contactId = typeof meta.contactId === 'string' ? meta.contactId : null;
    if (!contactId) continue;
    const when = row.respondedAt ?? row.createdAt;
    if (when < since) continue;
    if (row.userResponse === 'skipped' || meta.action === 'dismissed') {
      dismissed.add(contactId);
    }
  }
  return dismissed;
}

function buildDiscoveryState(row: ContactRow): {
  discoveryState: DiscoveryContactState;
  freshness: ReturnType<typeof evaluateDiscoveryFreshness>;
} {
  let discovery = fromSendEvidenceState(row.contactEvidenceState);
  if (row.quarantineState && row.quarantineState !== 'active') {
    discovery = 'blocked_or_removed';
  }
  if (row.evidenceConflictNote?.trim()) {
    discovery = 'conflicting';
  }
  const freshness = evaluateDiscoveryFreshness({
    evidenceCapturedAt: row.evidenceCapturedAt?.toISOString() ?? null,
    lastRecheckedAt: row.lastRecheckedAt?.toISOString() ?? null,
    discoveryState: discovery,
    conflictNote: row.evidenceConflictNote,
  });
  discovery = applyFreshnessToDiscoveryState(discovery, freshness);
  return { discoveryState: discovery, freshness };
}

function scoreRecommendation(card: KcRecommendationCard): number {
  let score = 0;
  if (card.evidenceState === 'verified_named_contact') score += 40;
  else if (card.evidenceState === 'verified_role_inbox') score += 35;
  else if (card.evidenceState === 'verified_official_form' || card.evidenceState === 'verified_program') {
    score += 28;
  } else if (card.evidenceState === 'official_general_route') score += 12;
  else score -= 20;

  if (card.freshness === 'fresh') score += 15;
  else if (card.freshness === 'aging') score += 5;
  else if (card.freshness === 'stale') score -= 15;

  if (card.hasDirectEmail) score += 10;
  if (card.hasApplicationOrForm) score += 8;
  if (card.needsVerification) score -= 10;
  if (card.contacted && card.replied === false) score -= 5;
  if (card.followUpDueAt) score += 6;
  if (card.askType === 'unknown') score -= 8;
  if (card.routeType === 'monitor_only') score -= 25;
  if (card.weaknesses.length > 3) score -= 5;
  return score;
}

function passesFilters(card: KcRecommendationCard, filters: KcContactIntelligenceFilters): boolean {
  if (filters.category && card.category !== filters.category) return false;
  if (filters.area && card.area !== filters.area) return false;
  if (filters.routeType && card.routeType !== filters.routeType) return false;
  if (filters.evidenceState && card.evidenceState !== filters.evidenceState) return false;
  if (
    filters.compensationAccessType &&
    card.compensationAccessType !== filters.compensationAccessType
  ) {
    return false;
  }
  if (filters.freshness && card.freshness !== filters.freshness) return false;
  if (filters.hasDirectEmail != null && card.hasDirectEmail !== filters.hasDirectEmail) return false;
  if (
    filters.hasApplicationOrForm != null &&
    card.hasApplicationOrForm !== filters.hasApplicationOrForm
  ) {
    return false;
  }
  if (filters.needsVerification != null && card.needsVerification !== filters.needsVerification) {
    return false;
  }
  if (filters.contacted != null && card.contacted !== filters.contacted) return false;
  if (filters.replied != null && card.replied !== filters.replied) return false;
  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    const blob = `${card.organizationName} ${card.category ?? ''} ${card.area ?? ''} ${card.whyFit}`.toLowerCase();
    if (!blob.includes(q)) return false;
  }
  return true;
}

function contactToCard(
  row: ContactRow,
  kits: KitRow[],
  outreach: Map<string, OutreachLite>,
): KcRecommendationCard {
  const hints = extractWorkbookHints(row.notes);
  const { discoveryState, freshness } = buildDiscoveryState(row);
  const evidenceState = toKcEvidenceState(discoveryState);
  const routeType = routeTypeFromChannel(
    hints.channelConcept,
    hints.routeTypeRaw ?? row.contactRole,
    hints.bestUse,
  );
  const ask = askFromBestUse(hints.bestUse, routeType);
  const variant = mediaKitVariantForCategory(row.category);
  const kit = pickKit(kits, variant);
  const prior = outreach.get(row.id);
  const contacted = Boolean(row.lastContactedAt || prior);
  const replied =
    prior?.status === 'replied' ? true : prior ? false : row.lastContactedAt ? null : null;
  const formUrl = row.contactFormUrl;
  const email = row.email;
  const generalInbox = evidenceState === 'official_general_route';
  const needsVerification =
    evidenceState === 'stale_needs_recheck' ||
    evidenceState === 'inferred_unverified' ||
    evidenceState === 'unknown' ||
    evidenceState === 'conflicting' ||
    freshness.needsRecheck;

  const lastVerifiedAt =
    row.lastRecheckedAt?.toISOString() ?? row.evidenceCapturedAt?.toISOString() ?? null;

  let nextAction = 'Open contact brief';
  let nextActionHref: string | null = `/contacts-programs/${row.id}`;
  if (needsVerification) {
    nextAction = 'Verify on official source';
  } else if (formUrl && !email) {
    nextAction = 'Prepare form packet';
    nextActionHref = `/email/form-packets?contactId=${row.id}`;
  } else if (email && !needsVerification) {
    nextAction = 'Draft pitch for approval';
    nextActionHref = `/outreach/compose?contactId=${row.id}`;
  }

  const weaknesses = weaknessesFor({
    evidenceState,
    routeType,
    email,
    formUrl,
    freshness: freshnessBucket(freshness.status),
    conflictNote: row.evidenceConflictNote,
    generalInbox,
  });

  return {
    id: `rec:${row.id}`,
    organizationName: row.businessName,
    organizationId: row.canonicalBusinessId,
    category: row.category,
    area: hints.area,
    whyFit: whyFitFor(row.category, hints.bestUse, row.businessName),
    whyNow: hints.bestUse
      ? `Workbook best-use is “${hints.bestUse}” (checked ${parseProvenanceFromNotes(row.notes)?.checkedDate ?? 'imported'}). Use it when Kellie has a matching shoot or story ready — not because an email exists.`
      : freshness.status === 'fresh'
        ? 'Evidence is fresh enough to act if a concrete content concept is ready.'
        : freshness.needsRecheck
          ? 'Do not pitch yet — recheck the published contact first.'
          : 'Only act when there is a timely local angle; having a contact is not a reason alone.',
    routeType,
    routeSummary: [
      row.contactName || row.contactRole || 'Published route',
      email ? email : formUrl ? 'official form' : row.phone ? `phone ${row.phone}` : 'no email/form',
    ].join(' · '),
    evidenceState,
    evidenceSummary: row.evidenceUrl
      ? `Source retained: ${row.evidenceUrl}`
      : 'No evidence URL on file — treat as incomplete.',
    lastVerifiedAt,
    askType: ask.askType,
    askSummary: ask.askSummary,
    valueToOrg: valueToOrg(routeType, row.category),
    contentConcept: contentConceptFor(row.category, hints.bestUse, routeType),
    mediaKitVariant: variant,
    mediaKitId: kit?.id ?? null,
    weaknesses,
    nextAction,
    nextActionHref,
    contactId: row.id,
    programId: null,
    opportunityId: null,
    compensationAccessType: ask.compensation,
    freshness: freshnessBucket(freshness.status),
    hasDirectEmail: Boolean(email?.includes('@')),
    hasApplicationOrForm: Boolean(formUrl),
    needsVerification,
    contacted,
    replied,
    followUpDueAt: row.nextFollowUpAt?.toISOString() ?? null,
    changedAt: row.updatedAt?.toISOString() ?? null,
  };
}

function programToRow(p: ProgramLibRow): KcProgramRow {
  const notes = p.notes ?? '';
  const kindMatch = notes.match(/programKind=([a-z_]+)/);
  const kind = kindMatch?.[1] ?? p.programType ?? 'other';
  let routeType: KcRouteType = 'creator_application';
  let compensation = askFromBestUse(p.benefit ?? p.audienceBenefit, routeType).compensation;
  let evidenceState: KcContactEvidenceState = 'verified_program';

  if (kind === 'affiliate' || p.programType === 'affiliate') {
    routeType = 'affiliate_program';
    compensation = 'affiliate';
  } else if (kind === 'creator_program' || p.programType === 'creator') {
    routeType = 'creator_application';
    compensation = 'affiliate';
  } else if (kind === 'influencer_network' || p.programType === 'influencer') {
    routeType = 'creator_application';
    compensation = 'unknown';
  } else if (kind === 'media_access') {
    routeType = 'media_access';
    compensation = 'media_access_not_paid';
  } else if (kind === 'hosted_visit') {
    routeType = 'hosted_visit';
    compensation = 'hosted';
  } else if (kind === 'consumer_rewards') {
    routeType = 'partnership_page';
    compensation = 'unknown';
  }

  if (
    p.verificationState === 'needs_verification' ||
    p.verificationState === 'operator_supplied' ||
    !p.lastVerifiedAt
  ) {
    // Workbook-imported programs stay reviewable, not permanently verified.
    evidenceState = 'verified_program';
  }

  return {
    id: p.id,
    organizationName: p.brandName,
    programName: p.programName ?? p.brandName,
    programType: p.programType ?? kind,
    routeType,
    evidenceState,
    compensationAccessType: compensation,
    applicationUrl: p.applicationUrl ?? p.officialUrl,
    benefitSummary: p.commissionBenefit ?? p.audienceBenefit ?? p.benefit,
    requirementsSummary: p.requirements,
    lastVerifiedAt: p.lastVerifiedAt,
    needsVerification: p.verificationState !== 'verified_official',
    contactId: null,
  };
}

function buildFormPacket(row: ContactRow, card: KcRecommendationCard): KcFormPacketField[] | null {
  if (!row.contactFormUrl && card.routeType !== 'official_form' && card.routeType !== 'creator_application') {
    return null;
  }
  return [
    {
      fieldLabel: 'Name',
      suggestedValue: 'Kellie (KC Kellie)',
      notes: 'Use the name she publishes publicly.',
    },
    {
      fieldLabel: 'Platform / social links',
      suggestedValue: 'TikTok / Instagram — KC lifestyle & local culture',
      notes: 'Paste live profile URLs from My Info; do not invent follower counts.',
    },
    {
      fieldLabel: 'Media kit',
      suggestedValue: card.mediaKitVariant
        ? `${card.mediaKitVariant} media kit`
        : 'Core media kit',
      notes: 'Attach or link the matching generated kit after Kellie approves.',
    },
    {
      fieldLabel: 'Proposed dates / concept',
      suggestedValue: card.contentConcept,
      notes: 'Keep to one concrete shoot window — no open-ended availability claims.',
    },
    {
      fieldLabel: 'What you are asking for',
      suggestedValue: card.askSummary,
      notes: 'Do not claim paid rates unless a published rate card exists.',
    },
  ];
}

function buildBrief(row: ContactRow, card: KcRecommendationCard, kits: KitRow[]): KcContactBrief {
  const hints = extractWorkbookHints(row.notes);
  const kit = pickKit(kits, card.mediaKitVariant ?? 'core');
  const verdict = evaluateContactEvidence(
    {
      state: row.contactEvidenceState as never,
      personName: row.contactName,
      personRole: row.contactRole,
      representsBusiness: row.representsBusiness ?? row.businessName,
      email: row.email,
      contactFormUrl: row.contactFormUrl,
      phone: row.contactPhonePublic ?? row.phone,
      officialSocialUrl: row.officialSocialUrl,
      evidenceUrl: row.evidenceUrl,
      evidenceCapturedAt: row.evidenceCapturedAt?.toISOString() ?? null,
      sourceIsOfficial: Boolean(row.evidenceIsOfficial),
      verificationMethod: row.verificationMethod,
      lastRecheckedAt: row.lastRecheckedAt?.toISOString() ?? null,
      conflictNote: row.evidenceConflictNote,
      staleNote: row.evidenceStaleNote,
    },
    row.businessName,
    row.notes,
  );

  const whatNotToClaim = [
    'Do not claim guaranteed compensation or complimentary stays.',
    'Do not invent personal brand love without a specific verified fact.',
    ...(card.routeType === 'media_access' || card.compensationAccessType === 'media_access_not_paid'
      ? [MEDIA_ACCESS_DEFAULT_DISCLAIMER]
      : []),
    ...(card.routeType === 'general_inbox'
      ? ['Do not address a general inbox as if it were a PR desk.']
      : []),
  ];

  const affiliatePublished =
    card.routeType === 'affiliate_program'
      ? {
          commission: null as string | null,
          cookieDuration: null as string | null,
          requirements: null as string | null,
          sourceUrl: row.evidenceUrl ?? hints.sourceUrl,
        }
      : null;

  return {
    id: row.id,
    organizationName: row.businessName,
    organizationId: row.canonicalBusinessId,
    category: row.category,
    area: card.area,
    contactPersonOrTeam: row.contactName ?? row.contactRole,
    role: row.contactRole,
    email: row.email,
    phone: row.contactPhonePublic ?? row.phone,
    formUrl: row.contactFormUrl,
    applicationUrl: row.contactFormUrl,
    routeType: card.routeType,
    evidenceState: card.evidenceState,
    verifiedSourceUrl: row.evidenceUrl ?? hints.sourceUrl,
    lastCheckedAt: card.lastVerifiedAt,
    whyRouteAppropriate: card.routeSummary,
    whatToAskFor: card.askSummary,
    whatNotToClaim,
    suggestedSubjectLine:
      card.routeType === 'general_inbox'
        ? null
        : `Kansas City creator collaboration — ${row.businessName}`,
    tailoredPitchDraft: null, // Form packet / approval compose owns copy; avoid pretend email here.
    mediaKitVariant: card.mediaKitVariant,
    mediaKitId: kit?.id ?? card.mediaKitId,
    mediaKitHref: kit?.webSlug ? `/media-kit/${kit.webSlug}` : '/media-kits',
    supportingContentExamples: [],
    applicationRequirements: hints.bestUse ? [`Best use from workbook: ${hints.bestUse}`] : [],
    suggestedFollowUpDate: row.nextFollowUpAt?.toISOString() ?? null,
    usageRightsOrDeliverableConcerns: [
      'Confirm usage rights and deliverables only after the partner replies with terms.',
    ],
    previousOutreachSummary: row.lastContactedAt
      ? `Last contacted ${row.lastContactedAt.toISOString().slice(0, 10)}`
      : null,
    compensationAccessType: card.compensationAccessType,
    mediaAccessDisclaimer:
      card.routeType === 'media_access' || card.compensationAccessType === 'media_access_not_paid'
        ? MEDIA_ACCESS_DEFAULT_DISCLAIMER
        : null,
    affiliatePublished,
    formPacket: buildFormPacket(row, card),
    pitchApprovalHref: row.email ? `/outreach/compose?contactId=${row.id}` : null,
    formPacketHref: row.contactFormUrl ? `/email/form-packets?contactId=${row.id}` : null,
    recommendationId: card.id,
    sendReady: verdict.emailSendAllowed && !card.needsVerification,
    needsVerification: card.needsVerification,
  };
}

export async function listContactIntelligenceHub(input: {
  view: KcHubView;
  filters?: KcContactIntelligenceFilters;
}): Promise<KcHubListResponse> {
  const filters = input.filters ?? {};
  const [contacts, kits, programs, outreach, dismissed] = await Promise.all([
    db.select().from(sponsorContacts).where(isNull(sponsorContacts.mergedIntoId)),
    loadActiveKits(),
    loadPrograms(),
    loadRecentOutreach(),
    loadDismissedContactIds(),
  ]);

  const cards = contacts
    .map((row) => contactToCard(row, kits, outreach))
    .filter((card) => passesFilters(card, filters));

  const programRows = programs
    .map(programToRow)
    .filter((row) => {
      if (filters.q?.trim()) {
        const q = filters.q.trim().toLowerCase();
        const blob = `${row.organizationName} ${row.programName} ${row.programType}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (filters.routeType && row.routeType !== filters.routeType) return false;
      if (filters.evidenceState && row.evidenceState !== filters.evidenceState) return false;
      if (
        filters.compensationAccessType &&
        row.compensationAccessType !== filters.compensationAccessType
      ) {
        return false;
      }
      if (filters.needsVerification != null && row.needsVerification !== filters.needsVerification) {
        return false;
      }
      if (filters.hasApplicationOrForm === true && !row.applicationUrl) return false;
      return true;
    });

  let recommendations: KcRecommendationCard[] = [];
  let contactCards: KcRecommendationCard[] = [];
  let programOut: KcProgramRow[] = [];

  switch (input.view) {
    case 'recommended_now': {
      recommendations = cards
        .filter((c) => !dismissed.has(c.contactId ?? ''))
        .filter((c) => !c.needsVerification)
        .filter((c) => c.routeType !== 'monitor_only')
        .filter((c) => c.hasDirectEmail || c.hasApplicationOrForm)
        .filter((c) => c.askType !== 'unknown' || c.routeType === 'affiliate_program')
        .map((c) => ({ c, score: scoreRecommendation(c) }))
        .filter(({ score }) => score >= 25)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map(({ c }) => c);
      break;
    }
    case 'verified_contacts': {
      contactCards = cards
        .filter((c) =>
          [
            'verified_named_contact',
            'verified_role_inbox',
            'verified_official_form',
            'official_general_route',
          ].includes(c.evidenceState),
        )
        .sort((a, b) => scoreRecommendation(b) - scoreRecommendation(a));
      break;
    }
    case 'programs_applications': {
      programOut = programRows;
      break;
    }
    case 'needs_verification': {
      contactCards = cards
        .filter((c) => c.needsVerification || c.evidenceState === 'conflicting')
        .sort((a, b) => (b.changedAt ?? '').localeCompare(a.changedAt ?? ''));
      break;
    }
    case 'follow_ups': {
      recommendations = cards
        .filter((c) => c.followUpDueAt || (c.contacted && c.replied === false))
        .sort((a, b) => (a.followUpDueAt ?? '').localeCompare(b.followUpDueAt ?? ''));
      break;
    }
    case 'recently_changed': {
      recommendations = [...cards]
        .sort((a, b) => (b.changedAt ?? '').localeCompare(a.changedAt ?? ''))
        .slice(0, 40);
      break;
    }
  }

  return {
    ok: true,
    stub: false,
    view: input.view,
    recommendations,
    contacts: contactCards,
    programs: programOut,
    filtersApplied: filters,
  };
}

export async function getContactBrief(id: string): Promise<KcBriefResponse> {
  const rows = await db.select().from(sponsorContacts).where(eq(sponsorContacts.id, id)).limit(1);
  const row = rows[0];
  if (!row || row.mergedIntoId) {
    return { ok: true, stub: false, brief: null };
  }
  const kits = await loadActiveKits();
  const outreach = await loadRecentOutreach();
  const card = contactToCard(row, kits, outreach);
  return { ok: true, stub: false, brief: buildBrief(row, card, kits) };
}

export async function getRecommendationBrief(id: string): Promise<KcBriefResponse> {
  const contactId = id.startsWith('rec:') ? id.slice(4) : id;
  return getContactBrief(contactId);
}

export async function recordContactIntelligenceFeedback(input: {
  id: string;
  action: KcFeedbackAction;
  note?: string | null;
}): Promise<KcFeedbackResponse> {
  const contactId = input.id.startsWith('rec:') ? input.id.slice(4) : input.id;
  const userResponse =
    input.action === 'dismissed'
      ? 'skipped'
      : input.action === 'saved' || input.action === 'accepted'
        ? 'accepted'
        : input.action === 'declined'
          ? 'skipped'
          : input.action;

  await db.insert(bensonRecommendationEvents).values({
    source: 'contact_intelligence',
    rationale: input.note ?? `contact_intelligence:${input.action}`,
    category: 'contact_intelligence',
    userResponse,
    responseReason: input.note ?? input.action,
    respondedAt: new Date(),
    metadata: {
      action: input.action,
      contactId,
      recommendationId: input.id,
      silenceDaysIfDismissed: DISMISS_SILENCE_DAYS,
    },
  });

  return {
    ok: true,
    stub: false,
    recorded: true,
    action: input.action,
  };
}
