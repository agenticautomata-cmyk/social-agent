/**
 * Read-only match report: KC PR workbook fixture vs live DB.
 *
 *   pnpm exec tsx src/scripts/match-kc-pr-directory.ts
 *   pnpm exec tsx src/scripts/match-kc-pr-directory.ts --fixture /path/to.json
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db.js';
import { sponsorContacts } from '../schema.js';
import { sql } from 'drizzle-orm';
import {
  loadWorkbookFixture,
  matchOutreachToDb,
  matchProgramsToDb,
  summarizeBuckets,
  type DbProgramSnapshot,
} from '../contact-intelligence/import/index.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
const DEFAULT_FIXTURE = resolve(
  ROOT,
  'docs/ops/fixtures/kc-pr-affiliate-directory-2026-09-08.json',
);

async function main() {
  const fixtureArg = process.argv.find((a) => a.startsWith('--fixture='))?.slice('--fixture='.length);
  const fixturePath = fixtureArg ? resolve(fixtureArg) : DEFAULT_FIXTURE;
  const bundle = loadWorkbookFixture(JSON.parse(readFileSync(fixturePath, 'utf8')));

  const contactRows = await db.select().from(sponsorContacts);
  const contacts = contactRows.map((r) => ({
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

  const programs = (await db.execute(sql`
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

  const outreachMatches = matchOutreachToDb(bundle, contacts);
  const programMatches = matchProgramsToDb(bundle, Array.isArray(programs) ? programs : []);

  const report = {
    generatedAt: new Date().toISOString(),
    fixturePath,
    workbookChecked: bundle.meta.checkedDate,
    db: {
      sponsorContacts: contacts.length,
      activeContacts: contacts.filter((c) => !c.mergedIntoId).length,
      programLibrary: Array.isArray(programs) ? programs.length : 0,
    },
    outreach: {
      counts: summarizeBuckets(outreachMatches),
      rows: outreachMatches.map((m) => ({
        bucket: m.bucket,
        establishment: m.row.establishment,
        canonical: m.canonicalBusinessName,
        email: m.row.email,
        importKey: m.importKey,
        proposedEvidenceState: m.proposedEvidenceState,
        dbId: m.dbContact?.id ?? null,
        dbBusiness: m.dbContact?.businessName ?? null,
        dbEmail: m.dbContact?.email ?? null,
        dbEvidence: m.dbContact?.contactEvidenceState ?? null,
        conflicts: m.conflictNotes,
      })),
    },
    programs: {
      counts: summarizeBuckets(programMatches),
      rows: programMatches.map((m) => ({
        bucket: m.bucket,
        program: m.row.program,
        kind: m.programKind,
        importKey: m.importKey,
        dbProgramId: m.dbProgramId,
      })),
    },
  };

  console.log(JSON.stringify(report, null, 2));
  console.error('\nOutreach counts:', report.outreach.counts);
  console.error('Program counts:', report.programs.counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
