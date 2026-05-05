// Captures dashboard screenshots into docs/screenshots/*.png
//
// Usage:  node scripts/screenshot.mjs

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../docs/screenshots');
const BASE = process.env.DASHBOARD_URL ?? 'http://localhost:3100';

const SHOTS = [
  { path: '/',                   file: 'overview.png',  width: 1440, height: 1100 },
  { path: '/campaigns',          file: 'campaigns.png', width: 1440, height: 900 },
  { path: '/queue',              file: 'queue.png',     width: 1440, height: 1200 },
  { path: '/approvals',          file: 'approvals.png', width: 1440, height: 1300 },
  { path: '/runs',               file: 'runs.png',      width: 1440, height: 1100 },
];

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  for (const shot of SHOTS) {
    const ctx = await browser.newContext({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: 2, // retina
      colorScheme: 'dark',
    });
    const page = await ctx.newPage();
    const url = BASE + shot.path;
    console.log(`[shot] ${url} → ${shot.file}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(800); // let any lazy content settle
    await page.screenshot({
      path: resolve(OUT, shot.file),
      fullPage: false,
      type: 'png',
    });
    await ctx.close();
  }

  await browser.close();
  console.log(`[done] ${SHOTS.length} screenshots → ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
