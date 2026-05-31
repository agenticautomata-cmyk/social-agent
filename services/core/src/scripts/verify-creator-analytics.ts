import { computePlatformDashboard } from '../creator-analytics/dashboard.js';

async function main() {
  const d = await computePlatformDashboard('tiktok', true);
  console.log('sponsor perf', d.sponsorPerformance.map((s) => `${s.key}:${s.performanceIndex}`));
  console.log(
    'all sponsor check',
    d.sponsorPerformance.find((s) => s.videoCount >= 2 && s.performanceIndex >= 1.1),
  );
  console.log('recs', d.recommendations);
}

main();
