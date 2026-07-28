import dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(scriptDir, '../../../../.env') });

const { writeFileSync, mkdirSync, readFileSync, existsSync } = await import('node:fs');
const { runProductionNewsletterDryRun, pickReviewSamples } = await import(
  '../newsletter-intelligence/dry-run-report.js'
);
const { getGmailConnectionStatus } = await import('../gmail-oauth/connections.js');

const outDir = resolve(scriptDir, '../../../../reports');

export function proposedOutputFingerprint(report: {
  acceptedSamples: Array<Record<string, unknown>>;
  rejectedSamples: Array<Record<string, unknown>>;
}): string {
  const accepted = [...report.acceptedSamples]
    .map((s) =>
      [
        s.fingerprint ?? '',
        s.entityName,
        s.title,
        s.layer,
        s.date,
        s.time,
        s.location,
        s.locationOutcome,
        s.verificationStatus,
        s.destination,
        s.gmailMessageId,
      ].join('|'),
    )
    .sort();
  const rejected = [...report.rejectedSamples]
    .map((s) => [s.gmailMessageId, s.entityName, s.title, s.reason].join('|'))
    .sort();
  return createHash('sha256')
    .update(JSON.stringify({ accepted, rejected }))
    .digest('hex')
    .slice(0, 32);
}

function corpusHashFromIds(ids: string[]): string {
  return createHash('sha256').update([...ids].sort().join('\n')).digest('hex').slice(0, 32);
}

async function main() {
  const fingerprintOnlyPath = process.env.NEWSLETTER_DRY_RUN_FINGERPRINT_ONLY_FROM;
  if (fingerprintOnlyPath) {
    if (!existsSync(fingerprintOnlyPath)) {
      throw new Error(`Fingerprint-only report not found: ${fingerprintOnlyPath}`);
    }
    const prior = JSON.parse(readFileSync(fingerprintOnlyPath, 'utf8')) as {
      report: {
        acceptedSamples: Array<Record<string, unknown>>;
        rejectedSamples: Array<Record<string, unknown>>;
        messageIds?: string[];
        corpusHash?: string;
        totals: Record<string, number>;
      };
      outputFingerprint?: string;
    };
    const fp1 = prior.outputFingerprint ?? proposedOutputFingerprint(prior.report);
    const fp2 = proposedOutputFingerprint(prior.report);
    const ids = prior.report.messageIds ?? [];
    const ch = corpusHashFromIds(ids);
    console.log(
      JSON.stringify(
        {
          mode: 'fingerprint_only',
          from: fingerprintOnlyPath,
          corpusCount: ids.length,
          corpusHashPrior: prior.report.corpusHash ?? null,
          corpusHashRecomputed: ch,
          corpusHashMatch: !prior.report.corpusHash || prior.report.corpusHash === ch,
          fingerprintPrior: fp1,
          fingerprintRecomputed: fp2,
          fingerprintMatch: fp1 === fp2,
          totals: prior.report.totals,
        },
        null,
        2,
      ),
    );
    if (fp1 !== fp2) process.exit(2);
    return;
  }

  const sinceDays = Number(process.env.NEWSLETTER_DRY_RUN_DAYS ?? '180');
  const maxMessages = Number(process.env.NEWSLETTER_DRY_RUN_MAX ?? '300');
  const skipOcr = process.env.NEWSLETTER_SKIP_OCR === '1';
  const corpusEnv = process.env.NEWSLETTER_DRY_RUN_CORPUS;
  const pinPath = process.env.NEWSLETTER_DRY_RUN_PIN_IDS_FILE;

  const gmail = await getGmailConnectionStatus();
  console.log(`Gmail: ${gmail.status}${gmail.connection?.email ? ` (${gmail.connection.email})` : ''}`);

  let corpusSource: 'gmail' | 'discovery_db' | 'auto' = 'auto';
  if (corpusEnv === 'gmail' || corpusEnv === 'discovery_db' || corpusEnv === 'auto') {
    corpusSource = corpusEnv;
  } else if (gmail.status === 'credentials_missing' || gmail.status === 'disconnected') {
    corpusSource = 'discovery_db';
  } else {
    corpusSource = 'gmail';
  }

  let pinnedMessageIds: string[] | undefined;
  if (pinPath) {
    pinnedMessageIds = JSON.parse(readFileSync(pinPath, 'utf8')) as string[];
    console.log(`Pinned message IDs: ${pinnedMessageIds.length} from ${pinPath}`);
    console.log(`Pinned corpusHash: ${corpusHashFromIds(pinnedMessageIds)}`);
  }

  console.log(
    `Running production newsletter dry-run (${sinceDays}d, max ${maxMessages}, corpus=${corpusSource}, ocr=${skipOcr ? 'off' : 'on'})…`,
  );
  const report = await runProductionNewsletterDryRun({
    sinceDays,
    maxMessages,
    skipOcr,
    corpusSource,
    pinnedMessageIds,
  });
  const samples = pickReviewSamples(report);
  const outputFingerprint = proposedOutputFingerprint(report);
  const fingerprintRepeat = proposedOutputFingerprint(report);

  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = resolve(outDir, `newsletter-dry-run-${stamp}.json`);
  const idsPath = resolve(outDir, `newsletter-dry-run-${stamp}.message-ids.json`);
  if (report.messageIds?.length) {
    writeFileSync(idsPath, JSON.stringify(report.messageIds, null, 2));
  }
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        report,
        samples,
        outputFingerprint,
        fingerprintRepeat,
        fingerprintMatch: outputFingerprint === fingerprintRepeat,
        runMeta: {
          sinceDays,
          maxMessages,
          skipOcr,
          corpusSource,
          pinned: Boolean(pinnedMessageIds),
          pinPath: pinPath ?? null,
          corpusCount: report.corpusCount,
          corpusHash: report.corpusHash,
        },
      },
      null,
      2,
    ),
  );

  console.log('\n=== NEWSLETTER PINNED PRODUCTION DRY-RUN ===');
  console.log('corpusSource:', report.corpusSource);
  console.log('corpusCount:', report.corpusCount);
  console.log('corpusHash:', report.corpusHash);
  console.log('outputFingerprint:', outputFingerprint);
  console.log('fingerprintRepeat:', fingerprintRepeat);
  console.log('fingerprintMatch:', outputFingerprint === fingerprintRepeat);
  console.log(JSON.stringify(report.totals, null, 2));
  console.log('\nSynthetic acceptance:', JSON.stringify(report.syntheticAcceptance, null, 2));
  console.log(
    '\nAccuracy evaluation:',
    JSON.stringify(
      {
        entityPrecision: report.accuracyEvaluation.entityPrecision,
        entityRecall: report.accuracyEvaluation.entityRecall,
        occurrencePrecision: report.accuracyEvaluation.occurrencePrecision,
        occurrenceRecall: report.accuracyEvaluation.occurrenceRecall,
        dateAccuracy: report.accuracyEvaluation.dateAccuracy,
        timeAccuracy: report.accuracyEvaluation.timeAccuracy,
        locationAccuracy: report.accuracyEvaluation.locationAccuracy,
        duplicateRate: report.accuracyEvaluation.duplicateRate,
        falseCalendarRate: report.accuracyEvaluation.falseCalendarRate,
        denominators: report.accuracyEvaluation.denominators,
        exclusions: report.accuracyEvaluation.exclusions.slice(0, 30),
        mismatches: report.accuracyEvaluation.mismatches.slice(0, 30),
        exactMisses: report.accuracyEvaluation.exactMisses.slice(0, 20),
      },
      null,
      2,
    ),
  );
  console.log('\nLife of the Party proofs:', JSON.stringify(report.qualityProofs?.lifeOfTheParty ?? [], null, 2));
  console.log(
    '\nNational retail FPs:',
    report.qualityProofs?.nationalRetailFalsePositives.length ?? 0,
  );
  console.log(
    '\nUnresolved physical locations:',
    report.qualityProofs?.unresolvedPhysicalLocations.length ?? 0,
  );
  console.log('\nDuplicate clusters:', report.duplicateClusters.length);
  console.log('\nBlocking gates:', report.blockingGates);
  console.log(`\nFull report: ${jsonPath}`);

  const blockingFailed = Object.entries(report.blockingGates).filter(([, v]) => !v);
  if (blockingFailed.length) {
    console.log('\n⚠ Blocking gates not yet green:', blockingFailed.map(([k]) => k).join(', '));
  } else {
    console.log('\nAll blocking gates green — live backfill still requires explicit approval.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
