import { desc, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorPartnerships } from '../schema.js';
import { readPartnershipMetadata } from '../creator-partnership/partnership-sources.js';
import {
  claimValue,
  readProgramLibraryMode,
  readProgramLibraryPayload,
  type PartnershipProgramLibraryMetadata,
} from './metadata.js';
import { programModeLabel, programScopeLabel, programTypeLabel, verificationStateLabel, backgroundEnrichmentStatusLabel } from './labels.js';
import { isProgramLibraryTestArtifact } from './test-artifacts.js';
import type { ProgramLibraryListFilters, ProgramLibraryView } from './types.js';

export type ProgramLibraryViewWithLabels = ProgramLibraryView & {
  programTypeLabel: string;
  scopeLabel: string;
  modeLabel: string;
  verificationLabel: string;
  backgroundStatusLabel: string | null;
};

export async function listProgramLibrary(
  filters: ProgramLibraryListFilters = {},
): Promise<ProgramLibraryViewWithLabels[]> {
  const limit = Math.min(Math.max(filters.limit ?? 80, 1), 200);

  const rows = await db
    .select()
    .from(creatorPartnerships)
    .where(sql`metadata ? 'programLibrary'`)
    .orderBy(desc(creatorPartnerships.updatedAt))
    .limit(limit * 3);

  const views: ProgramLibraryViewWithLabels[] = [];
  for (const row of rows) {
    const metadata = readPartnershipMetadata(row.metadata) as PartnershipProgramLibraryMetadata;
    const payload = readProgramLibraryPayload(metadata);
    if (!payload || isProgramLibraryTestArtifact(metadata, payload)) continue;
    const view = mapProgramLibraryView(row);
    if (!view) continue;
    if (filters.scope === 'kc_local' && view.scope !== 'kc_local') continue;
    if (filters.scope === 'national' && view.scope !== 'national') continue;
    if (filters.scope && filters.scope !== 'kc_local' && filters.scope !== 'national' && view.scope !== filters.scope) {
      continue;
    }
    if (filters.programType && view.programType !== filters.programType) continue;
    if (filters.mode && view.mode !== filters.mode) continue;
    if (filters.needsVerification && view.verificationDisplayState !== 'needs_verification') continue;
    views.push(view);
    if (views.length >= limit) break;
  }
  return views;
}

export async function getProgramLibraryRecord(
  programId: string,
): Promise<ProgramLibraryViewWithLabels | null> {
  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(sql`id = ${programId}::uuid AND metadata ? 'programLibrary'`)
    .limit(1);
  if (!row) return null;
  const metadata = readPartnershipMetadata(row.metadata) as PartnershipProgramLibraryMetadata;
  const payload = readProgramLibraryPayload(metadata);
  if (!payload || isProgramLibraryTestArtifact(metadata, payload)) return null;
  return mapProgramLibraryView(row);
}

function mapProgramLibraryView(
  row: typeof creatorPartnerships.$inferSelect,
): ProgramLibraryViewWithLabels | null {
  const metadata = readPartnershipMetadata(row.metadata) as PartnershipProgramLibraryMetadata;
  const payload = readProgramLibraryPayload(metadata);
  if (!payload) return null;
  const mode = readProgramLibraryMode(metadata) ?? 'saved';

  return {
    id: row.id,
    contentItemId: row.contentItemId,
    mode,
    programName: payload.programName,
    brandName: payload.brandName,
    canonicalIdentity: payload.canonicalIdentity,
    programType: payload.programType,
    scope: payload.scope,
    commissionBenefit: claimValue(payload.commissionBenefit),
    audienceBenefit: claimValue(payload.audienceBenefit),
    affiliateNetwork: claimValue(payload.affiliateNetwork),
    cookieWindow: claimValue(payload.cookieWindow),
    eligibility: claimValue(payload.eligibility),
    officialProgramUrl: claimValue(payload.officialProgramUrl),
    applicationUrl: claimValue(payload.applicationUrl),
    contactPath: claimValue(payload.contactPath),
    notes: payload.notes,
    locationNote: payload.locationNote,
    evidenceUrls: payload.evidenceUrls,
    conflictingClaims: payload.conflictingClaims,
    supportingEvidence: payload.supportingEvidence,
    partialUnresolved: payload.partialUnresolved,
    dateAdded: payload.dateAdded,
    lastVerifiedAt: payload.lastVerifiedAt ?? null,
    verificationDisplayState: payload.verificationDisplayState,
    linkedPartnershipId: payload.linkedPartnershipId ?? null,
    activatedAt: payload.activatedAt ?? null,
    partnershipHref: mode === 'activated' ? `/partnerships/${row.id}` : null,
    updatedAt: row.updatedAt.toISOString(),
    programTypeLabel: programTypeLabel(payload.programType),
    scopeLabel: programScopeLabel(payload.scope),
    modeLabel: programModeLabel(mode),
    verificationLabel: verificationStateLabel(payload.verificationDisplayState),
    backgroundStatusLabel: backgroundEnrichmentStatusLabel({
      lastEnrichmentAttemptAt: metadata.lastEnrichmentAttemptAt ?? null,
      lastEnrichmentResult: metadata.lastEnrichmentResult ?? null,
      nextEligibleEnrichmentAt: metadata.nextEligibleEnrichmentAt ?? null,
      lastVerifiedAt: payload.lastVerifiedAt ?? null,
      verificationDisplayState: payload.verificationDisplayState,
    }),
  };
}

export async function countProgramLibraryRecords(): Promise<number> {
  const rows = await db
    .select()
    .from(creatorPartnerships)
    .where(sql`metadata ? 'programLibrary'`)
    .limit(500);

  let count = 0;
  for (const row of rows) {
    const metadata = readPartnershipMetadata(row.metadata) as PartnershipProgramLibraryMetadata;
    const payload = readProgramLibraryPayload(metadata);
    if (!payload || isProgramLibraryTestArtifact(metadata, payload)) continue;
    count += 1;
  }
  return count;
}
