import { chromium, devices } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/ops/proofs/eventbrite-watchlist-trust-2026-09-09');
const shots = path.join(root, 'docs/ops/screenshots');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(shots, { recursive: true });
const base = process.env.DASHBOARD_URL || 'http://127.0.0.1:3000';
const id = process.env.EVENTBRITE_WATCHER_ID || 'd72be304-9338-42fc-ba12-8131dab2ed9d';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();
await page.goto(`${base}/watchlist`, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(1000);
// Scroll sources list into view — find Eventbrite card
const eb = page.getByText('Eventbrite · Kansas City').first();
await eb.waitFor({ timeout: 30000 });
await eb.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
const listPath = path.join(out, 'watchlist-list-mobile.png');
await page.screenshot({ path: listPath, fullPage: false });
await page.goto(`${base}/watchlist/${id}`, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(1200);
const detailPath = path.join(out, 'watchlist-eventbrite-detail-mobile.png');
await page.screenshot({ path: detailPath, fullPage: true });
fs.copyFileSync(listPath, path.join(shots, 'eventbrite-watchlist-list-2026-09-09-mobile.png'));
fs.copyFileSync(detailPath, path.join(shots, 'eventbrite-watchlist-detail-2026-09-09-mobile.png'));
await browser.close();
console.log(JSON.stringify({ listPath, detailPath }, null, 2));
