import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, creatorPartnerships } from '../schema.js';
import { readPartnershipMetadata } from '../creator-partnership/partnership-sources.js';
import { runPartnershipResearch } from '../creator-partnership/pipeline.js';
import { CREATOR_PARTNERSHIP_CATEGORY } from '../creator-partnership/types.js';
import {
  readProgramLibraryMode,
  readProgramLibraryPayload,
  type PartnershipProgramLibraryMetadata,
} from './metadata.js';

export type ActivateProgramLibraryResult = {
  programId: string;
  contentItemId: string;
  partnershipId: string;
  reusedExistingActive: boolean;
  activatedAt: string;
};

export async function activateProgramLibraryRecord(
  programId: string,
  options?: { skipResearch?: boolean },
): Promise<ActivateProgramLibraryResult> {
  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, programId))
    .limit(1);
  if (!row) throw new Error('program_not_found');

  const metadata = readPartnershipMetadata(row.metadata) as PartnershipProgramLibraryMetadata;
  const payload = readProgramLibraryPayload(metadata);
  if (!payload) throw new Error('not_program_library_record');

  const mode = readProgramLibraryMode(metadata);
  const linkedId = payload.linkedPartnershipId ?? row.id;
  const reusedExistingActive = mode === 'activated' && linkedId === row.id;
  const activatedAt = payload.activatedAt ?? new Date().toISOString();

  const nextPayload = {
    ...payload,
    linkedPartnershipId: row.id,
    activatedAt: reusedExistingActive ? activatedAt : new Date().toISOString(),
  };

  const nextMetadata: PartnershipProgramLibraryMetadata = {
    ...metadata,
    programLibraryMode: 'activated',
    programLibraryQuiet: false,
    programLibrarySkipAutoResearch: false,
    programLibrary: nextPayload,
    promotedToCreatorPartnership: true,
  };

  await db
    .update(creatorPartnerships)
    .set({
      metadata: nextMetadata,
      pipelineStatus: row.pipelineStatus === 'discovered' ? 'discovered' : row.pipelineStatus,
      researchStatus: row.researchStatus === 'complete' ? 'queued' : row.researchStatus,
      updatedAt: new Date(),
    })
    .where(eq(creatorPartnerships.id, programId));

  await db
    .update(contentItems)
    .set({
      creatorValueStatus: 'creator_candidate',
      metadata: {
        opportunityCategory: CREATOR_PARTNERSHIP_CATEGORY,
        opportunityType: CREATOR_PARTNERSHIP_CATEGORY,
        ingest: 'creator_partnership',
        programLibraryQuiet: false,
        quietLibraryOnly: false,
        programLibraryMode: 'activated',
        libraryMode: 'active',
        homeEligible: undefined,
        partnership: {
          brandName: payload.brandName,
          programName: payload.programName,
          programLibraryOrigin: true,
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, row.contentItemId));

  if (!options?.skipResearch && !reusedExistingActive) {
    void runPartnershipResearch(programId, { trigger: 'program_library_activate' }).catch((err) => {
      console.warn('[program-library] activate research failed:', err);
    });
  }

  return {
    programId,
    contentItemId: row.contentItemId,
    partnershipId: row.id,
    reusedExistingActive,
    activatedAt: nextPayload.activatedAt!,
  };
}

export async function deactivateProgramLibraryRecord(programId: string): Promise<void> {
  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, programId))
    .limit(1);
  if (!row) throw new Error('program_not_found');

  const metadata = readPartnershipMetadata(row.metadata) as PartnershipProgramLibraryMetadata;
  const payload = readProgramLibraryPayload(metadata);
  if (!payload) throw new Error('not_program_library_record');

  const nextMetadata: PartnershipProgramLibraryMetadata = {
    ...metadata,
    programLibraryMode: 'saved',
    programLibraryQuiet: true,
    programLibrarySkipAutoResearch: true,
    programLibrary: {
      ...payload,
      linkedPartnershipId: row.id,
      activatedAt: null,
    },
  };

  await db
    .update(creatorPartnerships)
    .set({
      metadata: nextMetadata,
      updatedAt: new Date(),
    })
    .where(eq(creatorPartnerships.id, programId));

  await db
    .update(contentItems)
    .set({
      creatorValueStatus: 'hidden_raw_signal',
      metadata: {
        opportunityCategory: 'program_library',
        opportunityType: 'program_library',
        ingest: 'program_library',
        programLibraryQuiet: true,
        quietLibraryOnly: true,
        programLibraryMode: 'saved',
        libraryMode: 'quiet',
        homeEligible: false,
        partnership: {
          brandName: payload.brandName,
          programName: payload.programName,
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(contentItems.id, row.contentItemId));
}

export async function updateProgramLibraryRecord(
  programId: string,
  patch: import('./types.js').SaveProgramLibraryInput,
): Promise<import('./types.js').ProgramLibrarySaveResult> {
  const [row] = await db
    .select()
    .from(creatorPartnerships)
    .where(eq(creatorPartnerships.id, programId))
    .limit(1);
  if (!row) throw new Error('program_not_found');
  const metadata = readPartnershipMetadata(row.metadata) as PartnershipProgramLibraryMetadata;
  const existing = readProgramLibraryPayload(metadata);
  if (!existing) throw new Error('not_program_library_record');

  const { updateProgramLibraryById } = await import('./save.js');
  return updateProgramLibraryById(programId, patch);
}
