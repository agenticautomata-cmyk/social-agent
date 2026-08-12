import type {
  PartnershipLocalLocation,
  PartnershipResearch,
  VerifiedResearchField,
} from './types.js';
import { localAvailabilityLabel } from './local-verification.js';
import {
  isInventoryResolved,
  normalizeInventoryStatus,
  normalizePermissionStatus,
  normalizeProcessStatus,
} from './field-verification.js';

export type VerificationContext = {
  brandName: string | null;
  retailerName: string | null;
  /** True only when at least one KC location is CONFIRMED AVAILABLE. */
  kcInventoryConfirmed: boolean;
  /** True when any location is LIKELY AVAILABLE (still not confirmable in copy). */
  kcInventoryLikely: boolean;
  /** True when KC in-store inventory is not confirmed at any location. */
  kcInventoryUnverified: boolean;
  confirmedFacts: Array<{ label: string; value: string }>;
  inferredFacts: Array<{ label: string; value: string }>;
  verificationActions: string[];
  /** Phrases that must not appear unqualified in creator-facing copy. */
  forbiddenPhrases: RegExp[];
  /** Facts that may be stated without qualification. */
  allowedUnqualifiedClaims: string[];
};

const FIELD_LABELS: Array<[keyof PartnershipResearch, string]> = [
  ['companySummary', 'Company/product'],
  ['audienceFitRationale', 'Audience fit'],
  ['creatorProgram', 'Creator program'],
  ['programBenefits', 'Program benefits'],
  ['programRequirements', 'Program requirements'],
  ['socialAccounts', 'Social accounts'],
  ['recentCollaborations', 'Recent collaborations'],
  ['retailerRelationships', 'Retailer relationship'],
  ['localFilmingPotential', 'Local filming'],
  ['creatorContactPath', 'Creator contact path'],
  ['productsPricingHooks', 'Products/pricing hooks'],
  ['organicBeforeApproval', 'Organic before approval'],
];

export function isVerifiedField(field: VerifiedResearchField | undefined): boolean {
  return field?.status === 'verified' && Boolean(field.value?.trim());
}

export function isUsableInferredField(field: VerifiedResearchField | undefined): boolean {
  return field?.status === 'inferred' && Boolean(field.value?.trim());
}

function formatFieldVerificationFact(result: NonNullable<PartnershipResearch['fieldVerificationResults']>[number]): Array<{
  label: string;
  value: string;
}> {
  const scope = result.location ? `At ${result.location} only` : 'Field verification';
  const provenance = result.provenance;
  const sourceTag = provenance
    ? `${provenance.source} (${provenance.channel}${provenance.contactName ? `; ${provenance.contactName}` : ''})`
    : 'field_verification';
  const facts: Array<{ label: string; value: string }> = [];

  const inventory = normalizeInventoryStatus(result.inventoryStatus);
  if (inventory === 'confirmed_available') {
    facts.push({
      label: 'Field verification — inventory',
      value: `${scope}: in-store inventory confirmed available [${sourceTag}].`,
    });
  } else if (inventory === 'confirmed_unavailable') {
    facts.push({
      label: 'Field verification — inventory (negative)',
      value: `${scope}: confirmed NOT stocked — this is verified certainty, not unknown [${sourceTag}].`,
    });
  }

  const filming = normalizePermissionStatus(result.filmingStatus);
  if (filming === 'confirmed_allowed') {
    facts.push({
      label: 'Field verification — filming',
      value: `${scope}: filming allowed${result.approvalRequirements ? ` (${result.approvalRequirements})` : ''} [${sourceTag}].`,
    });
  } else if (filming === 'confirmed_not_allowed') {
    facts.push({
      label: 'Field verification — filming (negative)',
      value: `${scope}: filming not allowed${result.approvalRequirements ? ` (${result.approvalRequirements})` : ''} [${sourceTag}].`,
    });
  }

  const seller = normalizeProcessStatus(result.sellerIntakeStatus);
  if (seller === 'confirmed_offered') {
    facts.push({
      label: 'Field verification — seller intake',
      value: `${scope}: seller/resale intake confirmed offered [${sourceTag}].`,
    });
  } else if (seller === 'confirmed_not_offered') {
    facts.push({
      label: 'Field verification — seller intake (negative)',
      value: `${scope}: seller/resale intake confirmed NOT offered [${sourceTag}].`,
    });
  }

  return facts;
}

export function buildVerificationContext(
  research: PartnershipResearch,
  brandName: string | null,
  retailerName: string | null,
): VerificationContext {
  const locations = research.localLocations ?? [];
  const kcInventoryConfirmed = locations.some((l) => l.availability === 'confirmed_available');
  const kcInventoryLikely = locations.some((l) => l.availability === 'likely_available');
  const kcInventoryUnverified = !kcInventoryConfirmed;

  const confirmedFacts: VerificationContext['confirmedFacts'] = [];
  const inferredFacts: VerificationContext['inferredFacts'] = [];

  for (const [key, label] of FIELD_LABELS) {
    const field = research[key] as VerifiedResearchField | undefined;
    if (!field?.value?.trim()) continue;
    if (field.status === 'verified') confirmedFacts.push({ label, value: field.value.trim() });
    else if (field.status === 'inferred') inferredFacts.push({ label, value: field.value.trim() });
  }

  for (const result of research.fieldVerificationResults ?? []) {
    confirmedFacts.push(...formatFieldVerificationFact(result));
  }

  const verificationActions = [
    ...research.needsVerification,
    ...locations
      .filter((l) => !isInventoryResolved(normalizeInventoryStatusFromLocation(l)))
      .map((l) =>
        `Before filming, verify ${l.name} inventory (${localAvailabilityLabel(l.availability)}).`,
      ),
  ];

  const forbiddenPhrases: RegExp[] = [];
  if (kcInventoryUnverified) {
    forbiddenPhrases.push(/\bshop\b[^.!?]{0,80}\b(in kc|in kansas city|in the kc area)\b/gi);
    forbiddenPhrases.push(/\b(at|in)\s+[A-Za-z]+\s+(in kc|in kansas city)\b[^.!?]*\b(let me show you|come with me|let's go)\b/gi);
    forbiddenPhrases.push(/\blocal store exterior\b/gi);
    forbiddenPhrases.push(/\bif inventory confirmed\b/gi);
    forbiddenPhrases.push(/\bsurprising local discovery angle\b/gi);
    if (brandName && retailerName) {
      const brand = escapeRegex(brandName);
      const retailer = escapeRegex(retailerName);
      forbiddenPhrases.push(
        new RegExp(`\\bshop\\s+${brand}\\s+at\\s+${retailer}\\s+in\\s+(kc|kansas city)\\b`, 'gi'),
      );
      forbiddenPhrases.push(
        new RegExp(`\\b${brand}\\s+at\\s+${retailer}\\s+in\\s+(kc|kansas city)\\b`, 'gi'),
      );
    }
  }

  const allowedUnqualifiedClaims = confirmedFacts.map((f) => f.value);
  for (const fact of inferredFacts) {
    if (fact.label === 'Company/product' || fact.label === 'Retailer relationship' || fact.label === 'Creator program') {
      allowedUnqualifiedClaims.push(fact.value);
    }
  }

  return {
    brandName,
    retailerName,
    kcInventoryConfirmed,
    kcInventoryLikely,
    kcInventoryUnverified,
    confirmedFacts,
    inferredFacts,
    verificationActions: [...new Set(verificationActions)],
    forbiddenPhrases,
    allowedUnqualifiedClaims,
  };
}

function normalizeInventoryStatusFromLocation(location: PartnershipLocalLocation) {
  if (location.availability === 'confirmed_available') return 'confirmed_available';
  if (location.availability === 'confirmed_unavailable') return 'confirmed_unavailable';
  if (location.availability === 'likely_available') return 'likely_available';
  return 'unknown_call_first';
}

export function verificationLedgerForPrompt(context: VerificationContext, research: PartnershipResearch): string {
  const lines = [
    'VERIFICATION LEDGER — obey strictly when writing creator-facing copy:',
    '',
    'CONFIRMED (may state unqualified — includes verified negative answers scoped to a specific location):',
    ...(context.confirmedFacts.length
      ? context.confirmedFacts.map((f) => `- ${f.label}: ${f.value}`)
      : ['- none']),
    '',
    'INFERRED (qualify with "may" / "appears to" OR use as research-before-filming only):',
    ...(context.inferredFacts.length
      ? context.inferredFacts.map((f) => `- ${f.label}: ${f.value}`)
      : ['- none']),
    '',
    `KC IN-STORE INVENTORY: ${context.kcInventoryConfirmed ? 'CONFIRMED AVAILABLE at least one location' : context.kcInventoryLikely ? 'LIKELY AVAILABLE — do NOT state as confirmed' : 'UNKNOWN / CALL FIRST — do NOT imply KC shopping is confirmed'}`,
    '',
    'NEEDS VERIFICATION / ACTIONS:',
    ...context.verificationActions.map((a) => `- ${a}`),
    '',
    'LOCAL LOCATIONS (scope facts to the named location only):',
    ...(research.localLocations ?? []).map(
      (l: PartnershipLocalLocation) =>
        `- ${l.name}: ${localAvailabilityLabel(l.availability)}${l.address ? ` (${l.address})` : ''}`,
    ),
  ];
  return lines.join('\n');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
