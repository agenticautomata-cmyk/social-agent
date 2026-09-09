import { normalizeBusinessNameKey } from '../../sponsor-outreach/canonicalize.js';
import {
  namesLikelySameBusiness,
  resolveOrgAlias,
} from './org-aliases.js';
import {
  buildOutreachImportKey,
  buildProgramImportKey,
  brandNameFromProgram,
  mapProgramKind,
  mapRouteToChannel,
  normalizeEmail,
  normalizePhoneDigits,
} from './normalize.js';
import { notesContainImportKey, parseProvenanceFromNotes } from './provenance.js';
import type {
  DbContactSnapshot,
  MatchBucket,
  OutreachMatch,
  OutreachWorkbookRow,
  ProgramMatch,
  ProgramWorkbookRow,
  WorkbookBundle,
} from './types.js';

export type DbProgramSnapshot = {
  id: string;
  brandName: string;
  programName: string | null;
  canonicalIdentity: string | null;
  officialUrl: string | null;
  applicationUrl: string | null;
  verificationState: string | null;
  metadataNotes?: string | null;
};

function scoreCandidate(row: OutreachWorkbookRow, c: DbContactSnapshot): number {
  const email = normalizeEmail(row.email);
  const dbEmail = normalizeEmail(c.email);
  let score = 0;
  if (email && dbEmail && email === dbEmail) score += 100;
  const org = resolveOrgAlias({
    businessName: row.establishment,
    email: row.email,
    websiteOrSourceUrl: row.sourceUrl,
  });
  // Resolve DB org from name + email only — never evidenceUrl (third-party listings).
  const dbOrg = resolveOrgAlias({
    businessName: c.businessName,
    email: c.email,
    websiteOrSourceUrl: c.website,
  });
  if (org.orgKey === dbOrg.orgKey && !org.orgKey.startsWith('name:')) score += 50;
  if (namesLikelySameBusiness(row.establishment, c.businessName)) score += 30;
  if (normalizeBusinessNameKey(row.establishment) === normalizeBusinessNameKey(c.businessName)) {
    score += 20;
  }
  const phone = normalizePhoneDigits(row.phone);
  const dbPhone = normalizePhoneDigits(c.phone);
  if (phone && dbPhone && phone === dbPhone) score += 15;
  return score;
}

function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeBusinessNameKey(a ?? '');
  const nb = normalizeBusinessNameKey(b ?? '');
  return Boolean(na && nb && na === nb);
}

function pickBestContact(
  row: OutreachWorkbookRow,
  contacts: DbContactSnapshot[],
): DbContactSnapshot | null {
  const active = contacts.filter((c) => !c.mergedIntoId);
  const email = normalizeEmail(row.email);

  // Exact email always wins — same inbox is the same contact row.
  if (email) {
    const byEmail = active.find((c) => normalizeEmail(c.email) === email);
    if (byEmail) return byEmail;
  }

  // Same org + same named person (or same role desk when workbook has no distinct person).
  let best: DbContactSnapshot | null = null;
  let bestScore = 0;
  for (const c of active) {
    const score = scoreCandidate(row, c);
    if (score < 50) continue;

    const dbEmail = normalizeEmail(c.email);
    // Different published emails at the same org are different contacts (Visit KC ×2).
    // Only treat as the same row when person/role also aligns, or when DB has no email yet.
    if (email && dbEmail && email !== dbEmail) {
      const personAligns =
        namesMatch(row.contact, c.contactName) ||
        (!row.contact?.trim() &&
          !c.contactName?.trim() &&
          namesMatch(row.titleDesk, c.contactRole));
      if (!personAligns) continue;
    }

    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function classifyOutreach(
  row: OutreachWorkbookRow,
  db: DbContactSnapshot | null,
  checkedDate: string,
): { bucket: MatchBucket; conflictNotes: string[] } {
  if (!db) return { bucket: 'new', conflictNotes: [] };

  const conflictNotes: string[] = [];
  const email = normalizeEmail(row.email);
  const dbEmail = normalizeEmail(db.email);
  if (email && dbEmail && email !== dbEmail) {
    // Same person/role slot with two different emails = real conflict to quarantine.
    conflictNotes.push(`email: workbook=${email} db=${dbEmail}`);
  }

  if (conflictNotes.length > 0) {
    return { bucket: 'conflicting', conflictNotes };
  }

  const phone = normalizePhoneDigits(row.phone);
  const dbPhone = normalizePhoneDigits(db.phone);
  const wbHasMore =
    (email && !dbEmail) ||
    (phone && !dbPhone) ||
    (Boolean(row.contact?.trim()) && !db.contactName?.trim()) ||
    (Boolean(row.sourceUrl) && !db.evidenceUrl) ||
    (Boolean(row.titleDesk) && !db.contactRole);

  const evidenceWeak =
    db.contactEvidenceState === 'unknown' ||
    db.contactEvidenceState === 'inferred_unverified';

  const check = new Date(`${checkedDate}T00:00:00Z`);
  const captured = db.evidenceCapturedAt ? new Date(db.evidenceCapturedAt) : null;
  const rechecked = db.lastRecheckedAt ? new Date(db.lastRecheckedAt) : null;
  const lastFresh = rechecked ?? captured;
  const solelyStale =
    lastFresh != null &&
    lastFresh < check &&
    !wbHasMore &&
    !evidenceWeak &&
    email != null &&
    dbEmail === email;

  if (solelyStale) return { bucket: 'stale', conflictNotes };

  if (wbHasMore || evidenceWeak) {
    return { bucket: 'incomplete', conflictNotes };
  }

  // Same email + non-weak evidence = equivalent
  if (email && dbEmail === email) {
    return { bucket: 'equivalent', conflictNotes };
  }

  return { bucket: 'incomplete', conflictNotes };
}

export function matchOutreachToDb(
  bundle: WorkbookBundle,
  contacts: DbContactSnapshot[],
): OutreachMatch[] {
  const checkedDate = bundle.meta.checkedDate;
  return bundle.outreach.map((row) => {
    const org = resolveOrgAlias({
      businessName: row.establishment,
      email: row.email,
      websiteOrSourceUrl: row.sourceUrl,
    });
    const channel = mapRouteToChannel(row);
    const importKey = buildOutreachImportKey(row);

    // Prefer existing row that already carries this import key (idempotent).
    const byKey =
      contacts.find((c) => !c.mergedIntoId && notesContainImportKey(c.notes, importKey)) ?? null;
    const dbContact = byKey ?? pickBestContact(row, contacts);
    const { bucket, conflictNotes } = classifyOutreach(row, dbContact, checkedDate);

    return {
      bucket,
      row,
      orgKey: org.orgKey,
      canonicalBusinessName: org.canonicalName,
      importKey,
      channelConcept: channel.channelConcept,
      proposedEvidenceState: channel.proposedEvidenceState,
      dbContact,
      conflictNotes,
    };
  });
}

export function matchProgramsToDb(
  bundle: WorkbookBundle,
  programs: DbProgramSnapshot[],
): ProgramMatch[] {
  return bundle.programs.map((row) => {
    const importKey = buildProgramImportKey(row);
    const programKind = mapProgramKind(row.type);
    const brandName = brandNameFromProgram(row);
    const url = (row.sourceUrl ?? '').trim().toLowerCase();

    const hit =
      programs.find((p) => {
        const ou = (p.officialUrl ?? p.applicationUrl ?? '').trim().toLowerCase();
        if (url && ou) {
          try {
            const host = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
            if (ou.includes(host.replace(/^www\./, ''))) return true;
            if (ou === url) return true;
          } catch {
            /* ignore */
          }
        }
        const pn = (p.programName ?? '').toLowerCase();
        const bn = (p.brandName ?? '').toLowerCase();
        if (bn && brandName.toLowerCase() === bn) return true;
        if (pn && (pn.includes(row.program.toLowerCase().slice(0, 24)) || row.program.toLowerCase().includes(pn.slice(0, 24)))) {
          return true;
        }
        return false;
      }) ?? null;

    if (!hit) {
      return {
        bucket: 'new' as const,
        row,
        importKey,
        programKind,
        brandName,
        dbProgramId: null,
        conflictNotes: [],
      };
    }

    return {
      bucket: 'incomplete' as const,
      row,
      importKey,
      programKind,
      brandName,
      dbProgramId: hit.id,
      conflictNotes: [],
    };
  });
}

export function summarizeBuckets<T extends { bucket: string }>(
  matches: T[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of matches) {
    out[m.bucket] = (out[m.bucket] ?? 0) + 1;
  }
  return out;
}

export function alreadyImported(contact: DbContactSnapshot, importKey: string): boolean {
  if (notesContainImportKey(contact.notes, importKey)) return true;
  const parsed = parseProvenanceFromNotes(contact.notes);
  return parsed?.importKey === importKey;
}
