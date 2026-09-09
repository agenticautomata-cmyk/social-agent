import {
  WORKBOOK_ID,
  type ImportProvenanceV1,
  type OutreachWorkbookRow,
  type ProgramWorkbookRow,
  type WorkbookConfidence,
  type ContactChannelConcept,
  type ProposedContactEvidenceState,
  type ProgramIntelligenceKind,
} from './types.js';

const BEGIN = '[[benson-contact-import:v1]]';
const END = '[[/benson-contact-import]]';

export function buildOutreachProvenance(input: {
  row: OutreachWorkbookRow;
  importKey: string;
  workbookFileName: string;
  checkedDate: string;
  channelConcept: ContactChannelConcept;
  proposedEvidenceState: ProposedContactEvidenceState;
  importedAt?: string;
}): ImportProvenanceV1 {
  return {
    v: 1,
    workbookId: WORKBOOK_ID,
    workbookFileName: input.workbookFileName,
    checkedDate: input.checkedDate,
    sheet: 'Outreach Directory',
    sheetRow: input.row.sheetRow,
    importKey: input.importKey,
    confidence: input.row.confidence,
    routeType: input.row.routeType,
    bestUse: input.row.bestUse,
    geoArea: input.row.area,
    sourceUrl: input.row.sourceUrl,
    workbookNotes: input.row.notes,
    channelConcept: input.channelConcept,
    proposedEvidenceState: input.proposedEvidenceState,
    importedAt: input.importedAt ?? new Date().toISOString(),
    verificationMethod: 'workbook_import',
    permanentVerification: false,
  };
}

export function buildProgramProvenance(input: {
  row: ProgramWorkbookRow;
  importKey: string;
  workbookFileName: string;
  checkedDate: string;
  programKind: ProgramIntelligenceKind;
  confidence?: WorkbookConfidence;
  importedAt?: string;
}): ImportProvenanceV1 {
  return {
    v: 1,
    workbookId: WORKBOOK_ID,
    workbookFileName: input.workbookFileName,
    checkedDate: input.checkedDate,
    sheet: 'Programs',
    sheetRow: input.row.sheetRow,
    importKey: input.importKey,
    confidence: input.confidence ?? 'High',
    sourceUrl: input.row.sourceUrl,
    workbookNotes: input.row.howToUse,
    programKind: input.programKind,
    importedAt: input.importedAt ?? new Date().toISOString(),
    verificationMethod: 'workbook_import',
    permanentVerification: false,
  };
}

export function serializeProvenanceBlock(provenance: ImportProvenanceV1): string {
  return `${BEGIN}\n${JSON.stringify(provenance, null, 2)}\n${END}`;
}

export function parseProvenanceFromNotes(notes: string | null | undefined): ImportProvenanceV1 | null {
  const text = notes ?? '';
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start < 0 || end < 0 || end <= start) return null;
  const json = text.slice(start + BEGIN.length, end).trim();
  try {
    const parsed = JSON.parse(json) as ImportProvenanceV1;
    if (parsed?.v !== 1 || !parsed.importKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Merge provenance into notes without destroying unrelated operator text. */
export function upsertProvenanceNotes(
  existingNotes: string | null | undefined,
  provenance: ImportProvenanceV1,
): string {
  const block = serializeProvenanceBlock(provenance);
  const text = existingNotes ?? '';
  const start = text.indexOf(BEGIN);
  const end = text.indexOf(END);
  if (start >= 0 && end > start) {
    return `${text.slice(0, start).trimEnd()}\n\n${block}\n${text.slice(end + END.length).trimStart()}`.trim();
  }
  if (!text.trim()) return block;
  return `${text.trim()}\n\n${block}`;
}

export function notesContainImportKey(notes: string | null | undefined, importKey: string): boolean {
  const parsed = parseProvenanceFromNotes(notes);
  if (parsed?.importKey === importKey) return true;
  return (notes ?? '').includes(importKey);
}
