import { sql, eq, inArray } from 'drizzle-orm';
import { db } from '../db.js';
import { contentItems, creatorPartnerships } from '../schema.js';
import { readPartnershipMetadata } from '../creator-partnership/partnership-sources.js';
import { readProgramLibraryPayload } from '../program-library/metadata.js';
import { isProgramLibraryTestArtifact } from '../program-library/test-artifacts.js';
import { remediateMockProgramLibraryEnrichment } from '../program-library/remediate-mock-enrichment.js';
import { normalizeProgramLibraryVerificationState } from '../program-library/normalize-verification.js';
import { seedProgramLibrary, PROGRAM_LIBRARY_SEED_RECORDS } from '../program-library/index.js';
import { buildCanonicalProgramIdentity } from '../program-library/canonical.js';

async function inspectArtifacts() {
  const rows = await db
    .select()
    .from(creatorPartnerships)
    .where(sql`metadata ? 'programLibrary'`);

  const artifacts: Array<{ id: string; brand: string; sourceScreen?: string }> = [];
  for (const row of rows) {
    const md = readPartnershipMetadata(row.metadata);
    const payload = readProgramLibraryPayload(md);
    if (!payload) continue;
    if (isProgramLibraryTestArtifact(md, payload)) {
      artifacts.push({
        id: row.id,
        brand: payload.brandName,
        sourceScreen: md.sourceScreen,
      });
    }
  }
  return artifacts;
}

async function inspectBrand(brandName: string) {
  const rows = await db
    .select()
    .from(creatorPartnerships)
    .where(sql`metadata ? 'programLibrary'`);
  for (const row of rows) {
    const md = readPartnershipMetadata(row.metadata);
    const payload = readProgramLibraryPayload(md);
    if (!payload || payload.brandName !== brandName) continue;
    return { id: row.id, metadata: md, payload };
  }
  return null;
}

async function main() {
  const cmd = process.argv[2] ?? 'inspect';

  if (cmd === 'inspect') {
    const artifacts = await inspectArtifacts();
    console.log(JSON.stringify({ artifactCount: artifacts.length, artifacts }, null, 2));

    for (const brand of ['LTK', 'Poshmark']) {
      const row = await inspectBrand(brand);
      if (!row) {
        console.log(`${brand}: NOT FOUND`);
        continue;
      }
      console.log(
        `\n=== ${brand} ===\n`,
        JSON.stringify(
          {
            id: row.id,
            verificationDisplayState: row.payload.verificationDisplayState,
            commissionBenefit: row.payload.commissionBenefit,
            conflictingClaims: row.payload.conflictingClaims,
            evidenceUrls: row.payload.evidenceUrls,
            lastVerifiedAt: row.payload.lastVerifiedAt,
            lastEnrichmentAttemptAt: row.metadata.lastEnrichmentAttemptAt,
            lastEnrichmentResult: row.metadata.lastEnrichmentResult,
          },
          null,
          2,
        ),
      );
    }
    return;
  }

  if (cmd === 'cleanup') {
    const artifacts = await inspectArtifacts();
    const ids = artifacts.map((a) => a.id);
    let deletedContentItems = 0;
    if (ids.length > 0) {
      const partnerships = await db
        .select({ id: creatorPartnerships.id, contentItemId: creatorPartnerships.contentItemId })
        .from(creatorPartnerships)
        .where(inArray(creatorPartnerships.id, ids));
      const contentIds = partnerships.map((p) => p.contentItemId).filter(Boolean) as string[];
      deletedContentItems = contentIds.length;

      await db.delete(creatorPartnerships).where(inArray(creatorPartnerships.id, ids));
      if (contentIds.length > 0) {
        await db.delete(contentItems).where(inArray(contentItems.id, contentIds));
      }
    }

    let remediated = 0;
    const rows = await db
      .select()
      .from(creatorPartnerships)
      .where(sql`metadata ? 'programLibrary'`);
    for (const row of rows) {
      const md = readPartnershipMetadata(row.metadata);
      const payload = readProgramLibraryPayload(md);
      if (!payload || isProgramLibraryTestArtifact(md, payload)) continue;

      const mockResult = remediateMockProgramLibraryEnrichment(payload);
      const normResult = normalizeProgramLibraryVerificationState(mockResult.payload);
      if (!mockResult.changed && !normResult.changed) continue;

      remediated += 1;
      await db
        .update(creatorPartnerships)
        .set({
          metadata: {
            ...md,
            programLibrary: normResult.payload,
            ...(mockResult.changed
              ? {
                  lastEnrichmentAttemptAt: undefined,
                  lastEnrichmentResult: 'remediated_mock_evidence',
                  nextEligibleEnrichmentAt: undefined,
                }
              : {}),
          },
          updatedAt: new Date(),
        })
        .where(eq(creatorPartnerships.id, row.id));
    }

    const seed = await seedProgramLibrary();
    const missing: string[] = [];
    for (const row of PROGRAM_LIBRARY_SEED_RECORDS) {
      const id = buildCanonicalProgramIdentity({
        brandName: row.brandName,
        programName: row.programName,
        affiliateNetwork: row.affiliateNetwork ?? undefined,
      });
      if (!seed.canonicalIdentities.includes(id)) missing.push(row.brandName);
    }

    const remaining = await inspectArtifacts();
    console.log(
      JSON.stringify(
        {
          deletedPartnerships: ids.length,
          deletedContentItems,
          remediatedMockEnrichment: remediated,
          seedUpdated: seed.updated,
          seedCanonical: seed.canonicalIdentities.length,
          missingSeeds: missing,
          remainingArtifacts: remaining.length,
        },
        null,
        2,
      ),
    );
  }
}

void main();
