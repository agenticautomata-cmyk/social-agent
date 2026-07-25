#!/usr/bin/env node
/**
 * Browser regression: fail if rendered Home contains suppress-everywhere entity text.
 * Usage: node scripts/verify-suppression-home.mjs [baseUrl]
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? process.env.BENSON_HOME_URL ?? 'https://benson.kckellie.com';
const BANNED = [/maj[- ]?r/i, /maj r thrift/i, /majr thrift/i, /officially off the table/i];

function bodyContainsBanned(text) {
  return BANNED.some((re) => re.test(text));
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();

  const apiRes = await page.request.get(`${BASE.replace(/\/$/, '')}/api/benson-learning/latest`, {
    headers: { Accept: 'application/json' },
  });
  const apiBody = await apiRes.text();
  if (bodyContainsBanned(apiBody)) {
    console.error('FAIL: learning API payload contains banned suppression text');
    console.error(apiBody.slice(0, 500));
    process.exit(1);
  }

  await page.goto(`${BASE.replace(/\/$/, '')}/home`, { waitUntil: 'networkidle' });
  const domText = await page.locator('body').innerText();
  if (bodyContainsBanned(domText)) {
    console.error('FAIL: rendered /home DOM contains banned suppression text');
    console.error(domText.match(/[^\n]{0,120}maj[^\n]*/gi)?.join('\n') ?? domText.slice(0, 500));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, base: BASE, checked: ['learning-api', 'home-dom'] }, null, 2));
} finally {
  await browser.close();
}
