export * from './types.js';
export * from './labels.js';
export * from './canonical.js';
export * from './metadata.js';
export * from './evidence-authority.js';
export * from './claim-comparison.js';
export * from './claim-semantics.js';
export * from './eligibility.js';
export * from './save.js';
export * from './activate.js';
export * from './enrich.js';
export * from './list.js';
export * from './seed.js';
export * from './seed-data.js';
export * from './intake.js';
export * from './auto-enrichment.js';

export function isProgramLibraryResearchSuppressed(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const m = metadata as Record<string, unknown>;
  if (m.programLibrarySkipAutoResearch === true) return true;
  const mode = m.programLibraryMode;
  return mode === 'saved' || mode === 'inactive';
}
