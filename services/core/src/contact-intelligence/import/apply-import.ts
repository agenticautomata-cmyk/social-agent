/**
 * Idempotent apply plan for workbook import.
 * Writes fill nulls / attach provenance; never duplicate import keys;
 * never overwrite conflicting emails (records evidenceConflictNote instead).
 *
 * Proposed evidence states are applied only when the existing state is weaker
 * (unknown / inferred_unverified) OR the row is brand new — so workbook import
 * does not silently downgrade a stronger discovery-verified contact.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../../db.js';
import { sponsorContacts } from '../../schema.js';
import { saveProgramToLibrary } from '../../program-library/save.js';
import { contactEvidenceRank, normalizeContactEvidenceState } from '../../partnership-contracts/contact-evidence.js';
import {
  brandNameFromProgram,
  mapRouteToChannel,
  normalizeEmail,
  normalizePhoneDigits,
  programTypeForLibrary,
} from './normalize.js';
import { matchOutreachToDb, matchProgramsToDb, type DbProgramSnapshot } from './match.js';
import {
  buildOutreachProvenance,
  buildProgramProvenance,
  upsertProvenanceNotes,
} from './provenance.js';
import type {
  DbContactSnapshot,
  OutreachMatch,
  ProgramMatch,
  ProposedContactEvidenceState,
  WorkbookBundle,
} from './types.js';

export type ImportApplySummary = {
  dryRun: boolean;
  outreach: {
    inserted: number;
    updated: number;
    skippedEquivalent: number;
    skippedConflict: number;
    skippedIdempotent: number;
  };
  programs: {
    inserted: number;
    updated: number;
    skipped: number;
  };
  actions: string[];
};

function shouldApplyProposedState(
  existing: string | null | undefined,
  proposed: ProposedContactEvidenceState,
): boolean {
  const cur = normalizeContactEvidenceState(existing);
  if (cur === 'unknown' || cur === 'inferred_unverified') return true;
  // Allow upgrade when proposed ranks higher (e.g. general → role).
  return contactEvidenceRank(proposed) > contactEvidenceRank(cur);
}

async function loadDbContacts(): Promise<DbContactSnapshot[]> {
  const rows = await db.select().from(sponsorContacts);
  return rows.map((r) => ({
    id: r.id,
    businessName: r.businessName,
    contactName: r.contactName,
    email: r.email,
    phone: r.phone,
    website: r.website,
    contactEvidenceState: r.contactEvidenceState,
    evidenceUrl: r.evidenceUrl,
    contactFormUrl: r.contactFormUrl,
    contactRole: r.contactRole,
    notes: r.notes,
    mergedIntoId: r.mergedIntoId,
    evidenceCapturedAt: r.evidenceCapturedAt,
    lastRecheckedAt: r.lastRecheckedAt,
    verificationMethod: r.verificationMethod,
  }));
}

async function loadDbPrograms(): Promise<DbProgramSnapshot[]> {
  const rows = (await db.execute(sql`
    SELECT id,
           brand_name AS "brandName",
           metadata->'programLibrary'->>'programName' AS "programName",
           metadata->'programLibrary'->>'canonicalIdentity' AS "canonicalIdentity",
           metadata->'programLibrary'->'officialProgramUrl'->>'value' AS "officialUrl",
           metadata->'programLibrary'->'applicationUrl'->>'value' AS "applicationUrl",
           metadata->'programLibrary'->>'verificationDisplayState' AS "verificationState"
    FROM creator_partnerships
    WHERE metadata ? 'programLibrary'
  `)) as unknown as DbProgramSnapshot[];
  return Array.isArray(rows) ? rows : [];
}

function evidenceCapturedAt(checkedDate: string): Date {
  return new Date(`${checkedDate}T12:00:00.000Z`);
}

export async function planAndApplyWorkbookImport(input: {
  bundle: WorkbookBundle;
  apply: boolean;
}): Promise<{
  summary: ImportApplySummary;
  outreachMatches: OutreachMatch[];
  programMatches: ProgramMatch[];
}> {
  const contacts = await loadDbContacts();
  const programs = await loadDbPrograms();
  const outreachMatches = matchOutreachToDb(input.bundle, contacts);
  const programMatches = matchProgramsToDb(input.bundle, programs);

  const summary: ImportApplySummary = {
    dryRun: !input.apply,
    outreach: {
      inserted: 0,
      updated: 0,
      skippedEquivalent: 0,
      skippedConflict: 0,
      skippedIdempotent: 0,
    },
    programs: { inserted: 0, updated: 0, skipped: 0 },
    actions: [],
  };

  const importedAt = new Date().toISOString();
  const checkedDate = input.bundle.meta.checkedDate;
  const workbookFileName = input.bundle.meta.workbookFileName;

  for (const match of outreachMatches) {
    const route = mapRouteToChannel(match.row);
    const provenance = buildOutreachProvenance({
      row: match.row,
      importKey: match.importKey,
      workbookFileName,
      checkedDate,
      channelConcept: match.channelConcept,
      proposedEvidenceState: match.proposedEvidenceState,
      importedAt,
    });

    if (match.bucket === 'conflicting' && match.dbContact) {
      summary.outreach.skippedConflict += 1;
      const note = [
        `Workbook import conflict for ${match.canonicalBusinessName}:`,
        ...match.conflictNotes,
        `importKey=${match.importKey}`,
      ].join(' ');
      summary.actions.push(`CONFLICT keep-db ${match.dbContact.id}: ${note}`);
      if (input.apply) {
        const existingNotes = match.dbContact.notes;
        await db
          .update(sponsorContacts)
          .set({
            evidenceConflictNote: note.slice(0, 2000),
            notes: upsertProvenanceNotes(existingNotes, provenance),
            updatedAt: new Date(),
          })
          .where(eq(sponsorContacts.id, match.dbContact.id));
      }
      continue;
    }

    if (match.bucket === 'equivalent' && match.dbContact) {
      // Refresh provenance only — idempotent.
      summary.outreach.skippedEquivalent += 1;
      summary.actions.push(`EQUIVALENT provenance-refresh ${match.dbContact.id} ${match.importKey}`);
      if (input.apply) {
        await db
          .update(sponsorContacts)
          .set({
            notes: upsertProvenanceNotes(match.dbContact.notes, provenance),
            verificationMethod: match.dbContact.verificationMethod ?? 'workbook_import',
            updatedAt: new Date(),
          })
          .where(eq(sponsorContacts.id, match.dbContact.id));
      }
      continue;
    }

    if (match.dbContact && (match.bucket === 'incomplete' || match.bucket === 'stale')) {
      const dbc = match.dbContact;
      const email = normalizeEmail(match.row.email);
      const phone = normalizePhoneDigits(match.row.phone);
      const patch: Record<string, unknown> = {
        notes: upsertProvenanceNotes(dbc.notes, provenance),
        updatedAt: new Date(),
        verificationMethod: 'workbook_import',
        evidenceCapturedAt: evidenceCapturedAt(checkedDate),
        evidenceIsOfficial: true,
      };
      if (!dbc.contactName && match.row.contact) patch.contactName = match.row.contact;
      if (!dbc.email && email) patch.email = email;
      if (!dbc.phone && match.row.phone) patch.phone = match.row.phone;
      if (!dbc.contactRole && match.row.titleDesk) patch.contactRole = match.row.titleDesk;
      if (!dbc.evidenceUrl && match.row.sourceUrl) patch.evidenceUrl = match.row.sourceUrl;
      if (!dbc.contactFormUrl && route.proposedEvidenceState === 'official_contact_form' && match.row.sourceUrl) {
        patch.contactFormUrl = match.row.sourceUrl;
      }
      if (route.nextContactPath) patch.nextContactPath = route.nextContactPath;
      if (shouldApplyProposedState(dbc.contactEvidenceState, match.proposedEvidenceState)) {
        patch.contactEvidenceState = match.proposedEvidenceState;
        // Keep legacy field loosely aligned for older UI.
        patch.contactVerificationStatus =
          match.proposedEvidenceState === 'verified_named_decision_maker'
            ? 'verified_direct_email'
            : match.proposedEvidenceState === 'verified_role_inbox'
              ? 'verified_role_email'
              : match.proposedEvidenceState === 'official_general_inbox'
                ? 'generic_business_contact'
                : match.proposedEvidenceState === 'official_contact_form'
                  ? 'official_contact_form'
                  : dbc.contactEvidenceState === 'unknown'
                    ? 'missing'
                    : 'found_unverified';
      }
      if (phone && route.channelConcept === 'phone') {
        patch.contactPhonePublic = match.row.phone;
      }
      if (match.row.category && !dbc.businessName) {
        /* category applied on insert */
      }

      summary.outreach.updated += 1;
      summary.actions.push(
        `UPDATE ${dbc.id} ${match.canonicalBusinessName} bucket=${match.bucket} key=${match.importKey}`,
      );
      if (input.apply) {
        await db.update(sponsorContacts).set(patch).where(eq(sponsorContacts.id, dbc.id));
      }
      continue;
    }

    // new
    const email = normalizeEmail(match.row.email);
    summary.outreach.inserted += 1;
    summary.actions.push(
      `INSERT ${match.canonicalBusinessName} <${email ?? 'no-email'}> key=${match.importKey}`,
    );
    if (input.apply) {
      await db.insert(sponsorContacts).values({
        businessName: match.canonicalBusinessName,
        contactName: match.row.contact,
        email,
        phone: match.row.phone,
        website: null,
        category: match.row.category,
        notes: upsertProvenanceNotes(
          match.row.notes ? `Workbook: ${match.row.notes}` : null,
          provenance,
        ),
        status: 'lead',
        contactVerificationStatus:
          match.proposedEvidenceState === 'verified_named_decision_maker'
            ? 'verified_direct_email'
            : match.proposedEvidenceState === 'verified_role_inbox'
              ? 'verified_role_email'
              : match.proposedEvidenceState === 'official_general_inbox'
                ? 'generic_business_contact'
                : match.proposedEvidenceState === 'official_contact_form'
                  ? 'official_contact_form'
                  : 'missing',
        contactEvidenceState: match.proposedEvidenceState,
        contactRole: match.row.titleDesk,
        contactFormUrl:
          match.proposedEvidenceState === 'official_contact_form' ? match.row.sourceUrl : null,
        contactPhonePublic: route.channelConcept === 'phone' ? match.row.phone : null,
        evidenceUrl: match.row.sourceUrl,
        evidenceCapturedAt: evidenceCapturedAt(checkedDate),
        evidenceIsOfficial: true,
        verificationMethod: 'workbook_import',
        nextContactPath: route.nextContactPath,
        representsBusiness: match.canonicalBusinessName,
      });
    }
  }

  for (const match of programMatches) {
    const provenance = buildProgramProvenance({
      row: match.row,
      importKey: match.importKey,
      workbookFileName,
      checkedDate,
      programKind: match.programKind,
      importedAt,
    });
    const benefit = match.row.benefitPay;
    const isCommission = benefit && /\d+\s*%/.test(benefit);
    const cookie = benefit?.match(/(\d+)\s*-?\s*day/i)?.[0] ?? null;
    const network = /awin/i.test(match.row.program) || /awin/i.test(match.row.sourceUrl ?? '')
      ? 'Awin'
      : null;

    const programNotes = [
      match.row.howToUse,
      `programKind=${match.programKind}`,
      upsertProvenanceNotes(null, provenance),
    ]
      .filter(Boolean)
      .join('\n\n');

    if (match.bucket === 'new') {
      summary.programs.inserted += 1;
      summary.actions.push(`PROGRAM INSERT ${match.row.program} kind=${match.programKind}`);
      if (input.apply) {
        await saveProgramToLibrary({
          brandName: match.brandName || brandNameFromProgram(match.row),
          programName: match.row.program,
          programType: programTypeForLibrary(match.programKind) as
            | 'affiliate'
            | 'creator'
            | 'influencer'
            | 'referral'
            | 'ambassador'
            | 'other',
          scope: 'kc_local',
          commissionBenefit: isCommission ? benefit : null,
          audienceBenefit: !isCommission ? benefit : null,
          affiliateNetwork: network,
          cookieWindow: cookie,
          eligibility: match.row.requirements,
          officialProgramUrl: match.row.sourceUrl,
          applicationUrl: match.row.sourceUrl,
          notes: programNotes,
          locationNote: 'Kansas City metro / regional (workbook 2026-09-08)',
          evidenceUrls: match.row.sourceUrl ? [match.row.sourceUrl] : [],
          operatorSuppliedMasterList: true,
          sourceScreen: 'kc_pr_directory_import',
        });
      }
    } else {
      summary.programs.updated += 1;
      summary.actions.push(
        `PROGRAM UPDATE ${match.dbProgramId} ${match.row.program} (enrich via save)`,
      );
      if (input.apply) {
        await saveProgramToLibrary({
          brandName: match.brandName || brandNameFromProgram(match.row),
          programName: match.row.program,
          programType: programTypeForLibrary(match.programKind) as
            | 'affiliate'
            | 'creator'
            | 'influencer'
            | 'referral'
            | 'ambassador'
            | 'other',
          scope: 'kc_local',
          commissionBenefit: isCommission ? benefit : null,
          audienceBenefit: !isCommission ? benefit : null,
          affiliateNetwork: network,
          cookieWindow: cookie,
          eligibility: match.row.requirements,
          officialProgramUrl: match.row.sourceUrl,
          applicationUrl: match.row.sourceUrl,
          notes: programNotes,
          locationNote: 'Kansas City metro / regional (workbook 2026-09-08)',
          evidenceUrls: match.row.sourceUrl ? [match.row.sourceUrl] : [],
          operatorSuppliedMasterList: true,
          sourceScreen: 'kc_pr_directory_import',
        });
      }
    }
  }

  return { summary, outreachMatches, programMatches };
}
