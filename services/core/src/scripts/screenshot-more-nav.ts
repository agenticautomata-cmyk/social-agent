import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  applyPlaywrightBrowsersEnv,
  bensonRepoRoot,
  launchManagedChromium,
} from '../playwright-runtime/index.js';

const root = bensonRepoRoot();
applyPlaywrightBrowsersEnv(root);
const outDir = join(root, 'docs', 'ops', 'screenshots');
await mkdir(outDir, { recursive: true });
const browser = await launchManagedChromium();
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto('https://benson.kckellie.com/home', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: /more/i }).click().catch(async () => {
    await page.locator('text=More').last().click();
  });
  await page.waitForTimeout(800);
  // Expand My Info if collapsed
  const myInfo = page.getByText('My Info', { exact: true });
  if (await myInfo.count()) {
    await myInfo.first().click().catch(() => undefined);
    await page.waitForTimeout(400);
  }
  const file = join(outDir, 'queue-trust-2026-09-03-more-my-info-mobile.png');
  await page.screenshot({ path: file, fullPage: true });
  console.log('ok', file);
  await context.close();
} finally {
  await browser.close();
}
