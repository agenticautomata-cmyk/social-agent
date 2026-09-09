export {
  WORKBOOK_ID,
  WORKBOOK_CHECKED_DATE,
  type WorkbookBundle,
  type OutreachWorkbookRow,
  type ProgramWorkbookRow,
  type ImportProvenanceV1,
  type OutreachMatch,
  type ProgramMatch,
  type MatchBucket,
} from './types.js';

export {
  ORG_ALIAS_RULES,
  resolveOrgAlias,
  namesLikelySameBusiness,
  significantNameTokens,
} from './org-aliases.js';

export {
  loadWorkbookFixture,
  buildOutreachImportKey,
  buildProgramImportKey,
  mapRouteToChannel,
  mapProgramKind,
  programTypeForLibrary,
  brandNameFromProgram,
  normalizeEmail,
  normalizePhoneDigits,
  normalizeConfidence,
} from './normalize.js';

export {
  buildOutreachProvenance,
  buildProgramProvenance,
  serializeProvenanceBlock,
  parseProvenanceFromNotes,
  upsertProvenanceNotes,
  notesContainImportKey,
} from './provenance.js';

export {
  matchOutreachToDb,
  matchProgramsToDb,
  summarizeBuckets,
  alreadyImported,
  type DbProgramSnapshot,
} from './match.js';

export { planAndApplyWorkbookImport, type ImportApplySummary } from './apply-import.js';
