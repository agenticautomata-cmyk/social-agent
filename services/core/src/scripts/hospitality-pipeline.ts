/**
 * Runs the hospitality pipeline and prints what each business resolved to.
 *
 * `--dry-run` evaluates and prints without writing, so the qualification decisions can
 * be inspected before anything reaches Kellie's queue.
 */
import { runHospitalityPipeline } from '../hospitality-pitch/pipeline.js';

const dryRun = process.argv.includes('--dry-run');
const onlyArg = process.argv.find((arg) => arg.startsWith('--business='));

async function main(): Promise<void> {
  const outcomes = await runHospitalityPipeline({
    persist: !dryRun,
    onlyBusiness: onlyArg?.slice('--business='.length),
  });

  console.log(
    `${dryRun ? 'Dry run' : 'Pipeline run'} over ${outcomes.length} business(es) with facts\n`,
  );

  const queued = outcomes.filter((o) => o.draftedEmailId);
  const surfaced = outcomes.filter((o) => o.qualification.surfaceToKellie);

  for (const outcome of outcomes) {
    const q = outcome.qualification;
    console.log(`${outcome.businessName}`);
    console.log(
      `  qualification ${q.score} — ${q.surfaceToKellie ? 'SURFACE' : 'hold back'}: ${q.verdict}`,
    );
    for (const factor of q.factors.filter((f) => f.points !== 0)) {
      console.log(
        `    ${factor.points > 0 ? '+' : ''}${factor.points}/${factor.max} ${factor.reason}`,
      );
    }
    for (const item of q.disqualifiers) console.log(`    DISQUALIFIED: ${item}`);
    if (q.missing.length > 0) console.log(`  missing: ${q.missing.join('; ')}`);
    if (outcome.readiness) {
      console.log(`  readiness: ${outcome.readiness.state}`);
      for (const block of outcome.readiness.blocks) {
        console.log(`    [${block.code}] ${block.message}`);
        console.log(`      next: ${block.nextStep}`);
      }
    }
    if (outcome.draftedEmailId) {
      console.log(`  DRAFT QUEUED for approval: ${outcome.draftedEmailId}`);
    } else if (outcome.draftPreview) {
      console.log(`  WOULD QUEUE — subject: ${outcome.draftPreview.subject}`);
      for (const line of outcome.draftPreview.body.split('\n')) {
        console.log(`    ${line}`);
      }
    } else if (outcome.blockedReason) {
      console.log(`  no draft: ${outcome.blockedReason}`);
    }
    console.log('');
  }

  console.log(
    `${surfaced.length} worth surfacing, ${queued.length} draft(s) queued for Kellie's approval.`,
  );
}

void main();
