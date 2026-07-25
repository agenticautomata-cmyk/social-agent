import { auditOpenAiSpend } from '../llm-spend/index.js';

const periodDays = Number(process.argv[2] ?? 7);

async function main() {
  const summary = await auditOpenAiSpend(periodDays);

  console.log(`\n=== Benson OpenAI spend audit (${periodDays}d) ===\n`);
  console.log(`Tracked tables:     $${summary.trackedCostUsd.toFixed(4)}`);
  console.log(`Usage events table: $${summary.eventsCostUsd.toFixed(4)}`);
  console.log(`Total:              $${summary.totalCostUsd.toFixed(4)}`);
  console.log(`Daily average:      $${summary.dailyAverageUsd.toFixed(4)}`);
  console.log(`Today:              $${summary.todayCostUsd.toFixed(4)}`);
  if (summary.budgetUsd != null) {
    console.log(
      `Budget:             $${summary.budgetUsd.toFixed(2)}${summary.budgetExceeded ? ' (EXCEEDED)' : ''}`,
    );
  }

  console.log('\nBreakdown by source:');
  for (const row of summary.breakdown) {
    console.log(`  ${row.source.padEnd(22)} ${String(row.runs).padStart(4)} runs  $${row.costUsd.toFixed(4)}`);
  }

  console.log('\nWorker activity (usage events):');
  console.log(`  discovery runs:     ${summary.workerActivity.discoveryRuns}`);
  console.log(`  scoring events:     ${summary.workerActivity.scoringEvents}`);
  console.log(`  digest events:      ${summary.workerActivity.digestEvents}`);
  console.log(`  web search events:  ${summary.workerActivity.webSearchEvents}`);

  if (summary.roiThrottle.active) {
    console.log(
      `\nROI throttle active (${summary.roiThrottle.reason}): queries=${summary.roiThrottle.discoveryQueryCount}, scoring limit=${summary.roiThrottle.scoringBatchLimit}`,
    );
  }

  if (summary.topAskConversations.length > 0) {
    console.log('\nTop Ask Benson conversations:');
    for (const row of summary.topAskConversations) {
      console.log(
        `  ${row.conversationId.slice(0, 8)}…  ${row.messages} msgs  $${row.costUsd.toFixed(4)}`,
      );
    }
  }

  console.log('');
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
