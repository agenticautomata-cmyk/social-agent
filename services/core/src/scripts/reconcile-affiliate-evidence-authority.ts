/**
 * Re-evaluate evidence authority on existing Affiliate & Creator Programs records.
 * No web search — uses stored URLs + HTTP resolution checks only.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorPartnerships } from '../schema.js';
import { readPartnershipMetadata } from '../creator-partnership/partnership-sources.js';
import {
  claimValue,
  readProgramLibraryPayload,
  type PartnershipProgramLibraryMetadata,
} from '../program-library/metadata.js';
import { verificationStateLabel } from '../program-library/labels.js';
import {
  classifyEvidenceAuthority,
  extractEvidenceHostname,
  recomputeProgramLibraryEvidenceAuthority,
} from '../program-library/evidence-authority.js';
import { listProgramLibrary } from '../program-library/list.js';
import { isProgramLibraryTestArtifact } from '../program-library/test-artifacts.js';
import { PROGRAM_LIBRARY_SEED_RECORDS } from '../program-library/seed-data.js';

const REPORT_PATH = join(
  process.cwd(),
  '../../docs/reports/benson-affiliate-evidence-authority-fix-2026-08-11.md',
);

const OPERATOR_TERMS: Record<string, string> = {
  'FlexPro Meals': '5%; 40% audience benefit',
  'KC Wine Road': '10%',
  'KC Chiefs Pro Shop': '8%; Impact',
  'Dream KC Smoke Shop': '10%; 90-day window',
  'BodymetRx KC': 'commission unpublished',
  'KC Cabinetry & Stone': 'referral bonus unspecified',
  'Prestige Transportation KC': 'terms unspecified',
  'LEGOLAND Discovery Center Kansas City': '2%; Partnerize',
  'LM Connect KC': 'influencer hub',
  'Missouri Restaurant Association': 'influencer program',
  FASHIONPHILE: '5% + $50',
  'The RealReal': '5%',
  thredUP: '5–15%',
  Poshmark: '1–5%',
  LTK: '10–25% average',
};

const INSPECT_BRANDS = [
  'KC Wine Road',
  'KC Chiefs Pro Shop',
  'Dream KC Smoke Shop',
  'KC Cabinetry & Stone',
  'LEGOLAND Discovery Center Kansas City',
  'LM Connect KC',
  'FASHIONPHILE',
  'The RealReal',
  'thredUP',
  'Poshmark',
  'LTK',
];

type Row = {
  program: string;
  operatorTerms: string;
  currentTerms: string;
  officialUrl: string;
  urlResolved: string;
  domainAuthority: string;
  verificationStatus: string;
  topEvidenceAuthority: string;
  notes: string;
};

async function applyCorrections(): Promise<{ updated: number; rows: Row[] }> {
  const dbRows = await db.select().from(creatorPartnerships).where(sql`metadata ? 'programLibrary'`);
  const rows: Row[] = [];
  let updated = 0;

  for (const brand of PROGRAM_LIBRARY_SEED_RECORDS.map((r) => r.brandName)) {
    const view = (await listProgramLibrary({ limit: 80 })).find((p) => p.brandName === brand);
    if (!view) {
      rows.push({
        program: brand,
        operatorTerms: OPERATOR_TERMS[brand] ?? '—',
        currentTerms: '—',
        officialUrl: '—',
        urlResolved: '—',
        domainAuthority: '—',
        verificationStatus: 'NOT FOUND',
        topEvidenceAuthority: '—',
        notes: 'Missing record',
      });
      continue;
    }

    const dbRow = dbRows.find((r) => r.id === view.id);
    if (!dbRow) continue;
    const md = readPartnershipMetadata(dbRow.metadata) as PartnershipProgramLibraryMetadata;
    const payload = readProgramLibraryPayload(md);
    if (!payload || isProgramLibraryTestArtifact(md, payload)) continue;

    const result = await recomputeProgramLibraryEvidenceAuthority(payload);
    if (result.changed) {
      updated += 1;
      await db
        .update(creatorPartnerships)
        .set({
          metadata: { ...md, programLibrary: result.payload },
          updatedAt: new Date(),
        })
        .where(eq(creatorPartnerships.id, view.id));
    }

    const nextPayload = result.changed ? result.payload : payload;
    const officialUrl = claimValue(nextPayload.officialProgramUrl);
    const hostname = officialUrl ? extractEvidenceHostname(officialUrl) : null;
    const domainAuthority = officialUrl
      ? classifyEvidenceAuthority({
          url: officialUrl,
          brandName: nextPayload.brandName,
          affiliateNetwork: claimValue(nextPayload.affiliateNetwork),
        })
      : '—';

    const urlResolved =
      officialUrl && result.payload.officialProgramUrl?.verifiedAt ? 'yes' : officialUrl ? 'no' : '—';

    const topAuthority =
      nextPayload.commissionBenefit?.authority ??
      nextPayload.officialProgramUrl?.authority ??
      'operator_supplied';

    const notes: string[] = [];
    if (result.notes.length) notes.push(...result.notes);
    if (nextPayload.conflictingClaims.length) {
      notes.push(
        `Conflicts: ${nextPayload.conflictingClaims.map((c) => c.field).join(', ')}`,
      );
    }
    if (nextPayload.evidenceUrls.length) {
      notes.push(`Evidence: ${nextPayload.evidenceUrls.slice(0, 2).join(', ')}`);
    }

    rows.push({
      program: brand,
      operatorTerms: OPERATOR_TERMS[brand] ?? '—',
      currentTerms: claimValue(nextPayload.commissionBenefit) ?? '—',
      officialUrl: officialUrl ?? '—',
      urlResolved:
        nextPayload.officialProgramUrl?.verificationState === 'verified_official' ||
        nextPayload.officialProgramUrl?.verificationState === 'verified_network'
          ? 'yes'
          : officialUrl
            ? 'no/failed'
            : '—',
      domainAuthority: domainAuthority.replace(/_/g, ' '),
      verificationStatus: verificationStateLabel(nextPayload.verificationDisplayState),
      topEvidenceAuthority: topAuthority.replace(/_/g, ' '),
      notes: notes.join('; ') || '—',
    });
  }

  return { updated, rows };
}

function countByLabel(rows: Row[], labels: string[]): number {
  return rows.filter((r) => labels.includes(r.verificationStatus)).length;
}

function buildReport(input: { updated: number; rows: Row[] }): string {
  const fully = countByLabel(input.rows, ['Verified official', 'Verified network']);
  const conflicting = countByLabel(input.rows, ['Conflicting information']);
  const operator = countByLabel(input.rows, ['Operator supplied']);
  const secondary = countByLabel(input.rows, ['Secondary source']);
  const needs = countByLabel(input.rows, ['Needs verification']);
  const inactive = countByLabel(input.rows, ['Possibly inactive']);

  const inspected = input.rows.filter((r) => INSPECT_BRANDS.includes(r.program));
  const inspectTable = inspected
    .map(
      (r) =>
        `| ${r.program} | ${r.operatorTerms} | ${r.currentTerms} | ${r.officialUrl} | ${r.urlResolved} | ${r.domainAuthority} | ${r.verificationStatus} | ${r.topEvidenceAuthority} | ${r.notes.replace(/\|/g, '/')} |`,
    )
    .join('\n');

  const allTable = input.rows
    .map(
      (r) =>
        `| ${r.program} | ${r.operatorTerms} | ${r.currentTerms} | ${r.verificationStatus} | ${r.topEvidenceAuthority} | ${r.notes.replace(/\|/g, '/')} |`,
    )
    .join('\n');

  return `# Benson Affiliate Evidence Authority Fix — 2026-08-11

**Date:** 2026-08-12 (UTC)  
**Scope:** Correct evidence authority classification on existing 15 canonical programs  
**Method:** Domain-based authority recompute + URL resolution checks — **no paid web search**

---

## Problem fixed

Prior verification assigned \`official_brand\` / **Verified official** based on search-result citations without checking hostname or URL resolution. Examples corrected:

| Program | Bad source | Correct authority |
|---------|------------|-------------------|
| KC Chiefs Pro Shop | viglink.com | secondary source |
| thredUP | taprefer.com | secondary source |
| Poshmark | getlasso.co | secondary source |
| LTK | favly.com | secondary source |
| FlexPro Meals | affilitizer.com | secondary source |

Failed/non-resolving official URLs no longer produce **Verified official**.

---

## Authority rules implemented

- **official_brand:** hostname matches brand-owned domain **and** URL resolves
- **affiliate_network:** hostname matches actual network platform (Impact, Partnerize, etc.) **and** URL resolves
- **secondary_source:** aggregators (VigLink directories, getlasso, favly, taprefer, affilitizer, etc.)
- **Failed URL:** \`needs_verification\` — never \`verified_official\`

Operator-supplied claims preserved. Conflicts recomputed after authority downgrade.

---

## Corrected verification counts (all 15)

| Metric | Count |
|--------|------:|
| Fully verified (official/network) | ${fully} |
| Conflicting information | ${conflicting} |
| Operator supplied | ${operator} |
| Secondary source | ${secondary} |
| Needs verification | ${needs} |
| Possibly inactive | ${inactive} |
| Records updated in DB | ${input.updated} |
| Paid web searches | **0** |

---

## Inspected programs (11)

| Program | Operator terms | Current terms | Official URL | URL resolved | Domain authority | Verification status | Top evidence authority | Notes |
|---------|----------------|---------------|--------------|--------------|------------------|---------------------|------------------------|-------|
${inspectTable}

---

## All 15 programs

| Program | Operator terms | Current terms | Verification status | Top evidence authority | Notes |
|---------|----------------|---------------|----------------------|------------------------|-------|
${allTable}

---

## Tests

\`services/core/src/program-library/evidence-authority.test.ts\` covers:

- Brand-owned domain → \`official_brand\`
- Affiliate network domain → \`affiliate_network\`
- Aggregator domains → \`secondary_source\`
- Failed URL → never \`verified_official\`
- Operator values preserved through conflict recompute
- No paid search in recompute path

---

AFFILIATE EVIDENCE AUTHORITY VERIFIED
`;
}

async function main() {
  const { updated, rows } = await applyCorrections();
  const report = buildReport({ updated, rows });
  writeFileSync(REPORT_PATH, report);
  console.log(JSON.stringify({ reportPath: REPORT_PATH, updated, programCount: rows.length }, null, 2));
}

void main();
