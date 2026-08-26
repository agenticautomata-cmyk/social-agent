import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { campaigns, contentItems, creatorPartnerships } from '../schema.js';
import { attachPartnershipSource, readPartnershipMetadata } from '../creator-partnership/partnership-sources.js';
import { parsePartnershipUrl } from '../creator-partnership/url-intelligence.js';
import { requirePartnershipEntityIdentity } from '../creator-partnership/entity-identity.js';
import { buildCanonicalProgramIdentity } from './canonical.js';
import {
  buildQuietContentItemMetadata,
  mergeFieldClaim,
  operatorSuppliedClaim,
  readProgramLibraryPayload,
  summarizeVerificationState,
  type PartnershipProgramLibraryMetadata,
} from './metadata.js';
import { PROGRAM_LIBRARY_OPERATOR_TITLE } from './labels.js';
import type {
  FieldClaim,
  ProgramLibraryPayload,
  ProgramLibrarySaveResult,
  SaveProgramLibraryInput,
} from './types.js';

export async function findProgramLibraryIdByCanonical(
  canonicalIdentity: string,
): Promise<{ programId: string; contentItemId: string } | null> {
  const rows = await db.execute(sql`
    SELECT id, content_item_id
    FROM creator_partnerships
    WHERE metadata->'programLibrary'->>'canonicalIdentity' = ${canonicalIdentity}
    LIMIT 1
  `);
  const list = rows as unknown as Array<{ id: string; content_item_id: string }>;
  const row = list[0];
  if (!row) return null;
  return { programId: row.id, contentItemId: row.content_item_id };
}

function buildInitialPayload(input: SaveProgramLibraryInput, canonicalIdentity: string): ProgramLibraryPayload {
  const now = new Date().toISOString();
  return {
    programName: input.programName.trim(),
    brandName: input.brandName.trim(),
    canonicalIdentity,
    programType: input.programType ?? 'affiliate',
    scope: input.scope ?? 'kc_local',
    commissionBenefit: operatorSuppliedClaim(input.commissionBenefit),
    audienceBenefit: operatorSuppliedClaim(input.audienceBenefit),
    affiliateNetwork: operatorSuppliedClaim(input.affiliateNetwork),
    cookieWindow: operatorSuppliedClaim(input.cookieWindow),
    eligibility: operatorSuppliedClaim(input.eligibility),
    officialProgramUrl: operatorSuppliedClaim(input.officialProgramUrl),
    applicationUrl: operatorSuppliedClaim(input.applicationUrl),
    contactPath: operatorSuppliedClaim(input.contactPath),
    notes: input.notes?.trim() || null,
    locationNote: input.locationNote?.trim() || null,
    evidenceUrls: [...(input.evidenceUrls ?? [])],
    conflictingClaims: [],
    dateAdded: now,
    lastVerifiedAt: null,
    verificationDisplayState: input.operatorSuppliedMasterList ? 'operator_supplied' : 'needs_verification',
    linkedPartnershipId: null,
    activatedAt: null,
    operatorSuppliedMasterList: input.operatorSuppliedMasterList ?? false,
  };
}

function applyInputUpdates(
  payload: ProgramLibraryPayload,
  input: SaveProgramLibraryInput,
): { payload: ProgramLibraryPayload; changes: string[] } {
  const changes: string[] = [];
  const conflicts = [...payload.conflictingClaims];

  const fields: Array<{
    key: keyof ProgramLibraryPayload;
    inputKey: keyof SaveProgramLibraryInput;
    label: string;
  }> = [
    { key: 'commissionBenefit', inputKey: 'commissionBenefit', label: 'commission/benefit' },
    { key: 'audienceBenefit', inputKey: 'audienceBenefit', label: 'audience benefit' },
    { key: 'affiliateNetwork', inputKey: 'affiliateNetwork', label: 'affiliate network' },
    { key: 'cookieWindow', inputKey: 'cookieWindow', label: 'cookie/referral window' },
    { key: 'eligibility', inputKey: 'eligibility', label: 'eligibility' },
    { key: 'officialProgramUrl', inputKey: 'officialProgramUrl', label: 'official program URL' },
    { key: 'applicationUrl', inputKey: 'applicationUrl', label: 'application URL' },
    { key: 'contactPath', inputKey: 'contactPath', label: 'contact path' },
  ];

  let next = { ...payload };
  for (const field of fields) {
    const raw = input[field.inputKey];
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const incoming = operatorSuppliedClaim(raw);
    const merged = mergeFieldClaim({
      existing: next[field.key] as FieldClaim | null | undefined,
      incoming,
      field: field.label,
      conflicts,
    });
    if (merged.changed) {
      changes.push(`Updated ${field.label}`);
      next = { ...next, [field.key]: merged.claim };
    }
    if (merged.conflictAdded) changes.push(`Conflict recorded for ${field.label}`);
  }

  if (input.notes?.trim() && input.notes.trim() !== (next.notes ?? '')) {
    next.notes = input.notes.trim();
    changes.push('Updated notes');
  }
  if (input.locationNote?.trim() && input.locationNote.trim() !== (next.locationNote ?? '')) {
    next.locationNote = input.locationNote.trim();
    changes.push('Updated location note');
  }
  if (input.programType && input.programType !== next.programType) {
    next.programType = input.programType;
    changes.push('Updated program type');
  }
  if (input.scope && input.scope !== next.scope) {
    next.scope = input.scope;
    changes.push('Updated scope');
  }

  for (const url of input.evidenceUrls ?? []) {
    const trimmed = url.trim();
    if (trimmed && !next.evidenceUrls.includes(trimmed)) {
      next.evidenceUrls = [...next.evidenceUrls, trimmed];
      changes.push('Added evidence URL');
    }
  }

  next.conflictingClaims = conflicts;
  next.verificationDisplayState = summarizeVerificationState(next);
  return { payload: next, changes };
}

export async function saveProgramToLibrary(
  input: SaveProgramLibraryInput,
): Promise<ProgramLibrarySaveResult> {
  requirePartnershipEntityIdentity({
    brandName: input.brandName,
    submittedUrl: input.officialProgramUrl,
    operatorSuppliedBrand: true,
    sourceScreen: input.sourceScreen ?? 'program_library',
  });

  const canonicalIdentity = buildCanonicalProgramIdentity({
    brandName: input.brandName,
    programName: input.programName,
    officialProgramUrl: input.officialProgramUrl,
    affiliateNetwork: input.affiliateNetwork,
  });

  const existing = await findProgramLibraryIdByCanonical(canonicalIdentity);
  if (existing) {
    return updateExistingProgramLibrary(existing.programId, existing.contentItemId, input, canonicalIdentity);
  }

  const [campaign] = await db.select({ id: campaigns.id }).from(campaigns).limit(1);
  if (!campaign) throw new Error('no_campaign');

  const payload = buildInitialPayload(input, canonicalIdentity);
  const title = `${payload.brandName} — ${programTypeShort(payload.programType)} program`;
  const now = new Date();

  const contentMetadata = buildQuietContentItemMetadata({
    programLibraryMode: 'saved',
    brandName: payload.brandName,
    programName: payload.programName,
  });

  const [item] = await db
    .insert(contentItems)
    .values({
      campaignId: campaign.id,
      type: 'industry_insight',
      state: 'planned',
      topic: title,
      hook: payload.programName,
      script: input.notes?.trim() || null,
      sourceUrl: input.officialProgramUrl?.trim() || null,
      discoveredAt: now,
      creatorValueStatus: 'hidden_raw_signal',
      lifecycleStatus: 'active',
      metadata: contentMetadata,
    })
    .returning({ id: contentItems.id });

  let partnershipMetadata: PartnershipProgramLibraryMetadata = {
    sourceScreen: input.sourceScreen ?? 'program_library',
    programLibraryMode: 'saved',
    programLibraryQuiet: true,
    programLibrarySkipAutoResearch: true,
    programLibrary: payload,
  };

  if (input.officialProgramUrl?.trim()) {
    const urlIntel = parsePartnershipUrl(input.officialProgramUrl.trim());
    if (urlIntel) {
      const attached = attachPartnershipSource(partnershipMetadata, {
        originalUrl: urlIntel.originalUrl,
        normalizedUrl: urlIntel.normalizedUrl,
        role: 'program',
        provenance: { status: 'operator_supplied', intakeRoute: 'program_library' },
        parseSnapshot: urlIntel,
      });
      partnershipMetadata = attached.metadata as PartnershipProgramLibraryMetadata;
    }
  }

  const [partnership] = await db
    .insert(creatorPartnerships)
    .values({
      contentItemId: item!.id,
      submittedUrl: input.officialProgramUrl?.trim() || null,
      submittedText: input.notes?.trim() || null,
      brandName: payload.brandName,
      productName: null,
      retailerName: payload.brandName,
      pipelineStatus: 'discovered',
      researchStatus: 'complete',
      monetizationPaths: [mapProgramTypeToMonetization(payload.programType)],
      metadata: partnershipMetadata,
    })
    .returning({ id: creatorPartnerships.id });

  return {
    programId: partnership!.id,
    contentItemId: item!.id,
    created: true,
    canonicalIdentity,
    changes: [`Created ${PROGRAM_LIBRARY_OPERATOR_TITLE} record`],
  };
}

async function updateExistingProgramLibrary(
  programId: string,
  contentItemId: string,
  input: SaveProgramLibraryInput,
  canonicalIdentity: string,
): Promise<ProgramLibrarySaveResult> {
  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, programId))
    .limit(1);
  if (!row) throw new Error('program_not_found');

  const metadata = readPartnershipMetadata(row.metadata) as PartnershipProgramLibraryMetadata;
  const existingPayload =
    readProgramLibraryPayload(metadata) ??
    buildInitialPayload(input, canonicalIdentity);
  const { payload, changes } = applyInputUpdates(existingPayload, input);

  const nextMetadata: PartnershipProgramLibraryMetadata = {
    ...metadata,
    programLibraryMode: metadata.programLibraryMode ?? 'saved',
    programLibraryQuiet: true,
    programLibrarySkipAutoResearch: true,
    programLibrary: payload,
  };

  await db
    .update(creatorPartnerships)
    .set({ metadata: nextMetadata, brandName: payload.brandName, updatedAt: new Date() })
    .where(eq(creatorPartnerships.id, programId));

  await db
    .update(contentItems)
    .set({
      topic: `${payload.brandName} — ${programTypeShort(payload.programType)} program`,
      metadata: buildQuietContentItemMetadata({
        programLibraryMode: metadata.programLibraryMode ?? 'saved',
        brandName: payload.brandName,
        programName: payload.programName,
      }),
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, contentItemId));

  return {
    programId,
    contentItemId,
    created: false,
    canonicalIdentity,
    changes: changes.length ? changes : [`Reused canonical ${PROGRAM_LIBRARY_OPERATOR_TITLE} record (no field changes)`],
  };
}

export async function updateProgramLibraryById(
  programId: string,
  input: Partial<SaveProgramLibraryInput>,
): Promise<ProgramLibrarySaveResult> {
  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, programId))
    .limit(1);
  if (!row) throw new Error('program_not_found');
  const metadata = readPartnershipMetadata(row.metadata) as PartnershipProgramLibraryMetadata;
  const existing = readProgramLibraryPayload(metadata);
  if (!existing) throw new Error('not_program_library_record');

  if (input.brandName?.trim()) {
    requirePartnershipEntityIdentity({
      brandName: input.brandName,
      submittedUrl: input.officialProgramUrl,
      operatorSuppliedBrand: true,
      sourceScreen: 'program_library',
    });
  }

  return updateExistingProgramLibrary(
    programId,
    row.contentItemId,
    {
      programName: input.programName ?? existing.programName,
      brandName: input.brandName ?? existing.brandName,
      programType: input.programType ?? existing.programType,
      scope: input.scope ?? existing.scope,
      commissionBenefit: input.commissionBenefit,
      audienceBenefit: input.audienceBenefit,
      affiliateNetwork: input.affiliateNetwork,
      cookieWindow: input.cookieWindow,
      eligibility: input.eligibility,
      officialProgramUrl: input.officialProgramUrl,
      applicationUrl: input.applicationUrl,
      contactPath: input.contactPath,
      notes: input.notes,
      locationNote: input.locationNote,
      evidenceUrls: input.evidenceUrls,
      sourceScreen: input.sourceScreen ?? 'program_library_edit',
      operatorSupplied: true,
    },
    existing.canonicalIdentity,
  );
}

function programTypeShort(type: ProgramLibraryPayload['programType']): string {
  switch (type) {
    case 'affiliate':
      return 'Affiliate';
    case 'creator':
      return 'Creator';
    case 'influencer':
      return 'Influencer';
    case 'referral':
      return 'Referral';
    case 'ambassador':
      return 'Ambassador';
    default:
      return 'Program';
  }
}

function mapProgramTypeToMonetization(type: ProgramLibraryPayload['programType']): string {
  if (type === 'referral') return 'affiliate';
  if (type === 'ambassador') return 'ambassador_program';
  if (type === 'creator' || type === 'influencer') return 'paid_sponsorship';
  return 'affiliate';
}

export function formatProgramLibraryDeltaAnswer(input: {
  brandName: string;
  programName: string;
  created: boolean;
  changes: string[];
}): string {
  const head = input.created
    ? `Saved **${input.programName}** to ${PROGRAM_LIBRARY_OPERATOR_TITLE}.`
    : `Updated the ${PROGRAM_LIBRARY_OPERATOR_TITLE} record for **${input.brandName}**.`;
  if (input.changes.length === 0 || (input.changes.length === 1 && input.changes[0]?.includes('no field changes'))) {
    return `${head}\n\nNo new fields changed — reused the canonical program record. It stays quiet until you activate it.`;
  }
  return `${head}\n\nWhat changed:\n${input.changes.map((c) => `- ${c}`).join('\n')}\n\nIt remains saved here (not on Home or Discover) until you activate it.`;
}
