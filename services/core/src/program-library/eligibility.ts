import type { InventoryItem } from '../inventory/normalize.js';
import {
  isProgramLibraryPartnershipMetadata,
  readProgramLibraryMode,
  readProgramLibraryPayload,
} from './metadata.js';
import type { ProgramLibraryMode } from './types.js';

/** Shared quiet-library authority — saved/inactive programs stay off operator surfaces. */
export function isProgramLibraryQuietMode(mode: ProgramLibraryMode | null | undefined): boolean {
  return mode === 'saved' || mode === 'inactive';
}

export function isProgramLibraryQuietMetadata(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata) return false;
  if (metadata.programLibraryQuiet === true || metadata.quietLibraryOnly === true) return true;
  const mode =
    (metadata.programLibraryMode as ProgramLibraryMode | undefined) ??
    (metadata.libraryMode === 'quiet' || metadata.libraryMode === 'library_only'
      ? 'saved'
      : undefined);
  return isProgramLibraryQuietMode(mode ?? null);
}

export function isProgramLibraryContentItemMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (!metadata) return false;
  return (
    metadata.opportunityCategory === 'program_library' ||
    metadata.opportunityType === 'program_library' ||
    metadata.ingest === 'program_library' ||
    Boolean(metadata.programLibrary)
  );
}

export function shouldExcludeProgramLibraryFromDiscover(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return isProgramLibraryQuietMetadata(metadata) || isProgramLibraryContentItemMetadata(metadata);
}

export function isPartnershipProgramLibraryQuiet(partnershipMetadata: unknown): boolean {
  if (!isProgramLibraryPartnershipMetadata(partnershipMetadata)) return false;
  const mode = readProgramLibraryMode(partnershipMetadata);
  return isProgramLibraryQuietMode(mode);
}

export function inventoryItemFromProgramLibrary(
  item: InventoryItem,
  partnershipMetadata?: unknown,
): boolean {
  if (isProgramLibraryContentItemMetadata(item.metadata)) return true;
  if (partnershipMetadata && isPartnershipProgramLibraryQuiet(partnershipMetadata)) return true;
  return false;
}

export function readProgramLibraryModeFromPartnership(metadata: unknown): ProgramLibraryMode | null {
  return readProgramLibraryMode(metadata);
}

export function hasProgramLibraryPayload(metadata: unknown): boolean {
  return readProgramLibraryPayload(metadata) != null;
}

/** Active creator-partnership operator surfaces — excludes quiet Program Library rows. */
export function isActivePartnershipPipelineRecord(metadata: unknown): boolean {
  if (!isProgramLibraryPartnershipMetadata(metadata)) return true;
  const mode = readProgramLibraryMode(metadata);
  return mode === 'activated';
}
