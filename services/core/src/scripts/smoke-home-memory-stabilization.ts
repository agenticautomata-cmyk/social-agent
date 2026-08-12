/**
 * Memory smoke for Home stabilization — run with workers OFF and fresh API.
 *   pnpm exec tsx src/scripts/smoke-home-memory-stabilization.ts
 */
import { getHomeComputationMetrics, readProcessRssKb } from '../pre-alpha/home-computation-metrics.js';
import { resetHomeSingleflightForTests } from '../pre-alpha/home.js';

const API = process.env.API_BASE ?? 'http://127.0.0.1:4000';

async function fetchHome(label: string) {
  const t0 = Date.now();
  const res = await fetch(`${API}/api/pre-alpha/home`);
  const text = await res.text();
  return {
    label,
    status: res.status,
    ms: Date.now() - t0,
    bytes: text.length,
    rssKb: readProcessRssKb(),
  };
}

async function main() {
  resetHomeSingleflightForTests();
  const baseline = { rssKb: readProcessRssKb(), at: new Date().toISOString() };
  console.log(JSON.stringify({ phase: 'baseline_api_process_rss_unavailable_in_script', note: 'Use shell ps on API node PID', baseline }, null, 2));

  const single = await fetchHome('single');
  await new Promise((r) => setTimeout(r, 30_000));
  const singlePlus30 = { rssKb: readProcessRssKb() };

  await new Promise((r) => setTimeout(r, 270_000));
  const singlePlus5m = { rssKb: readProcessRssKb() };

  const concurrentStart = Date.now();
  const [a, b] = await Promise.all([fetchHome('concurrent-a'), fetchHome('concurrent-b')]);
  const metrics = getHomeComputationMetrics();

  console.log(
    JSON.stringify(
      {
        single,
        singlePlus30,
        singlePlus5m,
        concurrent: { a, b, wallMs: Date.now() - concurrentStart, metrics },
        note: 'RSS from script process; correlate API node RSS via ps during curl from shell',
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
