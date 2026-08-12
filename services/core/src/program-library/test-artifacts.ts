import type { PartnershipProgramLibraryMetadata } from './metadata.js';
import type { ProgramLibraryPayload } from './types.js';

const TEST_SOURCE_SCREENS = new Set(['program_library_test', 'auto_enrichment_test', 'test']);

/** Exact brand/program names from documented Program Library test suites. */
const TEST_BRAND_EXACT = new Set([
  'Test Verify Brand',
  'Budget Gate Brand',
  'Activation Test Brand',
  'Dedupe Repeat Brand',
  'Pipeline Quiet Brand',
]);

function matchesTestName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  if (/^AutoEnrich\b/i.test(trimmed)) return true;
  if (/^Legit Seed Style\b/i.test(trimmed)) return true;
  if (TEST_BRAND_EXACT.has(trimmed)) return true;
  if (/\bUnit \d{10,}$/.test(trimmed)) return true;
  if (/^Test Verify Brand\b/.test(trimmed)) return true;
  if (/^Activation Test Brand\b/.test(trimmed)) return true;
  return false;
}

/** Confirmed dev/test/smoke records — hidden from operator UI and enrichment. */
export function isProgramLibraryTestArtifact(
  metadata: PartnershipProgramLibraryMetadata,
  payload: ProgramLibraryPayload,
): boolean {
  if (metadata.sourceScreen && TEST_SOURCE_SCREENS.has(metadata.sourceScreen)) {
    return true;
  }
  return [payload.brandName, payload.programName].some(matchesTestName);
}

/** @deprecated use isProgramLibraryTestArtifact */
export function isConfirmedAutoEnrichmentTestArtifact(
  metadata: PartnershipProgramLibraryMetadata,
  payload: ProgramLibraryPayload,
): boolean {
  return isProgramLibraryTestArtifact(metadata, payload);
}
