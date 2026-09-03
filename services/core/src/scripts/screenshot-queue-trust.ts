import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  applyPlaywrightBrowsersEnv,
  bensonRepoRoot,
  launchManagedChromium,
} from '../playwright-runtime/index.js';

const DATE = '2026-09-03';
const PREFIX = 'queue-trust';
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const targets: Array<[string, string]> = [
  ['creator-assets', 'https://benson.kckellie.com/creator-assets'],
  ['media-kits', 'https://benson.kckellie.com/media-kits'],
  ['approvals', 'https://benson.kckellie.com/email/approvals'],
  ['form-packets', 'https://benson.kckellie.com/email/form-packets'],
  ['media-kit-hotel', 'https://benson.kckellie.com/media-kit/kellie-hotel?v=2'],
  ['home', 'https://benson.kckellie.com/home'],
];

const root = bensonRepoRoot();
applyPlaywrightBrowsersEnv(root);
const outDir = join(root, 'docs', 'ops', 'screenshots');
await mkdir(outDir, { recursive: true });
const browser = await launchManagedChromium();
try {
  for (const [label, url] of targets) {
    for (const [sizeName, size] of [
      ['mobile', MOBILE],
      ['desktop', DESKTOP],
    ] as const) {
      const context = await browser.newContext({
        viewport: size,
        deviceScaleFactor: 2,
        isMobile: sizeName === 'mobile',
        hasTouch: sizeName === 'mobile',
      });
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForTimeout(1500);
        const file = join(outDir, `${PREFIX}-${DATE}-${label}-${sizeName}.png`);
        await page.screenshot({ path: file, fullPage: true });
        console.log('ok', file);
      } catch (e) {
        console.log('FAIL', label, sizeName, (e as Error).message.slice(0, 200));
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
