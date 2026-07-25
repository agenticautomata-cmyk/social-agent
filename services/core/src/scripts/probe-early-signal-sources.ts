import { probeAllCatalogSources } from '../early-signals/source-probe.js';

async function main() {
  const report = await probeAllCatalogSources();
  console.log(JSON.stringify(report, null, 2));
  if (report.activeFailing > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
