#!/usr/bin/env node
/**
 * Android-sized Playwright smoke against production stack.
 * Screenshots: .acceptance/p2-screenshots/
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = resolve(root, '.acceptance/p2-screenshots');
mkdirSync(shotDir, { recursive: true });

const base =
  process.env.P2_MOBILE_BASE_URL ??
  (process.env.P2_USE_PUBLIC === '1' ? 'https://benson.kckellie.com' : 'http://127.0.0.1:3000');

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('Playwright not installed — run: pnpm exec playwright install chromium');
    process.exit(2);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  });
  const page = await context.newPage();
  const results = [];

  async function shot(name, url) {
    const path = `${shotDir}/${name}.png`;
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path, fullPage: true });
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth > doc.clientWidth + 2;
      });
      results.push({
        name,
        url,
        status: res?.status() ?? 0,
        screenshot: path,
        horizontalOverflow: overflow,
      });
      console.log(`OK ${name} status=${res?.status()} overflow=${overflow}`);
    } catch (err) {
      results.push({ name, url, error: err instanceof Error ? err.message : String(err) });
      console.error(`FAIL ${name}`, err);
    }
  }

  await shot('01-home', `${base}/home`);
  await shot('02-today', `${base}/editor`);
  await shot('03-opportunities', `${base}/opportunities`);
  await shot('04-signals', `${base}/signals`);
  await shot('05-control-tower-unauth', `${base}/admin/control-tower`);

  const adminEmail = process.env.BENSON_ADMIN_EMAILS?.split(',')[0]?.trim();
  if (adminEmail && base.includes('127.0.0.1')) {
    await context.setExtraHTTPHeaders({ 'X-Benson-Admin-Session-Email': adminEmail });
    await shot('06-control-tower-admin', `${base}/admin/control-tower`);
  }

  await browser.close();
  const out = resolve(root, 'reports/p2-mobile-playwright.json');
  writeFileSync(out, JSON.stringify({ base, results, at: new Date().toISOString() }, null, 2));
  const failed = results.filter((r) => r.error || r.status >= 500 || r.horizontalOverflow);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
