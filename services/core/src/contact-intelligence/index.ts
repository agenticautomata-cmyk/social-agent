/**
 * Contact intelligence package root.
 */

export * from './discovery/index.js';
export * from './labels.js';
export * from './types.js';
export * from './store.js';
export * from './route-map.js';
export {
  loadWorkbookFixture,
  mapRouteToChannel,
  mapProgramKind,
  buildOutreachImportKey,
  buildProgramImportKey,
  WORKBOOK_CHECKED_DATE,
  WORKBOOK_ID,
} from './import/normalize.js';
export { planAndApplyWorkbookImport } from './import/apply-import.js';
export { matchOutreachToDb, matchProgramsToDb, summarizeBuckets } from './import/match.js';
export {
  buildOutreachProvenance,
  buildProgramProvenance,
  parseProvenanceFromNotes,
  upsertProvenanceNotes,
} from './import/provenance.js';
export { resolveOrgAlias, ORG_ALIAS_RULES } from './import/org-aliases.js';
export type * from './import/types.js';
