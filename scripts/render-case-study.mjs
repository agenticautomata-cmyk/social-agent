// Render portfolio-media/_src/case-study.html → portfolio-media/case-study.pdf
// using Playwright's print-to-PDF.

import { chromium } from 'playwright';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = resolve(ROOT, 'portfolio-media/_src/case-study.html');
const OUT = resolve(ROOT, 'portfolio-media/case-study.pdf');

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ colorScheme: 'dark' });
const page = await ctx.newPage();
await page.goto(`file://${SRC}`, { waitUntil: 'networkidle' });
// Print backgrounds (gradients, halos, dark theme)
await page.emulateMedia({ media: 'print' });
await page.pdf({
  path: OUT,
  format: 'A4',
  printBackground: true,
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
});
await browser.close();
console.log(`[done] ${OUT}`);
