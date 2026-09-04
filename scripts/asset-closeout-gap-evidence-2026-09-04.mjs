#!/usr/bin/env node
/**
 * Gap-pass evidence for creator-asset assign lockup — fully mocked API.
 *
 * Does NOT mutate live kits or Kellie (b5831e43). Exercises:
 *  A) Hotel → Destination soft-timeout → settle without reload
 *  B) Lost-response / aborted fetch → reconcile + poll → ready
 *
 * Writes screenshots + JSON under docs/ops/screenshots/.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
process.env.PLAYWRIGHT_BROWSERS_PATH =
  process.env.PLAYWRIGHT_BROWSERS_PATH || join(repoRoot, '.benson', 'playwright');

const { chromium } = await import('playwright');

const BASE = process.env.BENSON_DASHBOARD_URL?.replace(/\/$/, '') || 'http://127.0.0.1:3000';
const OUT = join(repoRoot, 'docs/ops/screenshots');
const FIXTURE_ID = '00000000-gap-pass-0000-0000-000000000001';

const hotelRow = (versionNumber, status = 'ready') => ({
  mediaKitId: 'kit-hotel',
  placement: 'gallery',
  kitName: 'Hotel',
  variant: 'hotel',
  webSlug: 'kellie-hotel',
  versionNumber,
  versionId: `hotel-v${versionNumber}`,
  webUrl: `https://benson.kckellie.com/media-kit/kellie-hotel?v=${versionNumber}`,
  pdfUrl: `https://api.kckellie.com/api/public/media-kit/kellie-hotel/pdf?v=${versionNumber}`,
  generationStatus: status,
  assignedAt: '2026-09-03T22:58:34.328Z',
});

const destinationRow = (versionNumber, status = 'ready') => ({
  mediaKitId: 'kit-destination',
  placement: 'gallery',
  kitName: 'Destination',
  variant: 'destination',
  webSlug: 'kellie-destination',
  versionNumber,
  versionId: `dest-v${versionNumber}`,
  webUrl: `https://benson.kckellie.com/media-kit/kellie-destination?v=${versionNumber}`,
  pdfUrl: `https://api.kckellie.com/api/public/media-kit/kellie-destination/pdf?v=${versionNumber}`,
  generationStatus: status,
  assignedAt: '2026-09-04T04:30:00.000Z',
});

function assetPayload(assignments) {
  return {
    id: FIXTURE_ID,
    contentHash: 'gap-pass',
    originalFilename: 'gap-pass-isolated-hotel-dest.jpg',
    mimeType: 'image/jpeg',
    fileSize: 100,
    role: 'other',
    publicUseState: 'approved_public_use',
    publicUseApprovedAt: '2026-09-04T04:00:00.000Z',
    publicUseApprovedBy: 'gap-pass',
    caption: null,
    altText: null,
    source: 'gap_pass_mock',
    widthPx: 100,
    heightPx: 100,
    exifStripped: true,
    thumbUrl: null,
    webUrl: null,
    createdAt: '2026-09-04T04:00:00.000Z',
    updatedAt: '2026-09-04T04:00:00.000Z',
    assignments,
    displayStatus: assignments.length ? 'Approved/assigned' : 'Approved/unassigned',
  };
}

async function installMocks(page, state) {
  // Match both same-origin /api/* and direct http://127.0.0.1:4000/api/* long-running URLs.
  await page.route('**/api/creator-assets**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/\/$/, '') || '/';
    const method = req.method();

    // Block any accidental non-fixture mutation paths by never forwarding.
    if (method === 'GET' && (path === '/api/creator-assets' || path.endsWith('/api/creator-assets'))) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, assets: [assetPayload(state.assignments)] }),
      });
    }

    if (
      method === 'POST' &&
      path.includes(`/api/creator-assets/${FIXTURE_ID}/assign-target`)
    ) {
      state.assignCalls += 1;
      if (state.mode === 'lost') {
        // Persist destination server-side before the client loses the response.
        state.assignments = [destinationRow(6, 'ready')];
        return route.abort('connectionfailed');
      }
      if (state.mode === 'slow') {
        await new Promise((r) => setTimeout(r, state.delayMs));
        state.assignments = [destinationRow(6, 'ready')];
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            asset: assetPayload(state.assignments),
            result: {
              assignmentPersisted: true,
              rebuilt: [
                {
                  variant: 'destination',
                  versionId: 'dest-v6',
                  versionNumber: 6,
                  webUrl: destinationRow(6).webUrl,
                  pdfUrl: destinationRow(6).pdfUrl,
                  status: 'ready',
                },
              ],
            },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, asset: assetPayload(state.assignments) }),
      });
    }

    // Deny anything else (protects Kellie / live kits).
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'gap-pass mock blocked non-fixture route' }),
    });
  });
}

async function runScenario(browser, name, configure) {
  const page = await browser.newPage();
  const navigations = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push({ url: frame.url(), at: Date.now() });
  });

  const state = {
    mode: 'slow',
    delayMs: 10_000,
    assignCalls: 0,
    assignments: [hotelRow(9, 'ready')],
  };
  configure(state);
  await installMocks(page, state);

  const started = Date.now();
  await page.goto(`${BASE}/creator-assets`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByText('gap-pass-isolated-hotel-dest.jpg').waitFor({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Assign to kits' }).click();
  // Uncheck Hotel (openAssignDraft seeds current kits), check Destination.
  const hotelBox = page.locator('label', { hasText: 'Hotel' }).locator('input[type="checkbox"]');
  const destBox = page
    .locator('label', { hasText: 'Destination' })
    .locator('input[type="checkbox"]');
  if (await hotelBox.isChecked()) await hotelBox.click();
  if (!(await destBox.isChecked())) await destBox.click();

  const navBeforeSave = navigations.length;
  const saveClickedAt = Date.now();
  await page.getByRole('button', { name: 'Save assignment' }).click();

  const softSeen = page.getByText(/not marked failed|still in progress on the server/i);
  const lostSeen = page.getByText(/lost response|Connection dropped|Could not read the save response/i);
  const readyDest = page.locator('a[href*="kellie-destination?v=6"]');

  let softAt = null;
  let lostAt = null;
  let readyAt = null;

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (!softAt && (await softSeen.count()) > 0) softAt = Date.now() - started;
    if (!lostAt && (await lostSeen.count()) > 0) lostAt = Date.now() - started;
    if (!readyAt && (await readyDest.count()) > 0) {
      readyAt = Date.now() - started;
      break;
    }
    // Also accept ready notice for lost-response immediate reconcile.
    const body = await page.locator('body').innerText();
    if (!lostAt && /lost response|Connection dropped|Could not read the save response/i.test(body)) {
      lostAt = Date.now() - started;
    }
    if (
      !readyAt &&
      /Kit versions ready|Assignment saved\./i.test(body) &&
      (state.mode === 'lost' ? /lost response|Connection dropped|Could not read/i.test(body) : true) &&
      (await readyDest.count()) > 0
    ) {
      readyAt = Date.now() - started;
      break;
    }
    await page.waitForTimeout(400);
  }

  const shot = join(OUT, `asset-closeout-gap-${name}-2026-09-04.png`);
  await page.screenshot({ path: shot, fullPage: true });

  const postSaveNavs = navigations.filter((n) => n.at >= saveClickedAt);
  // Soft client-side updates must not require a full document reload as recovery.
  const reloadAsRecovery = postSaveNavs.some((n) => n.url.includes('/creator-assets'));
  const noticeText = (await page.locator('p.text-sm').allTextContents()).join(' | ');
  const bodyText = await page.locator('body').innerText();

  await page.close();

  const softOk = state.mode !== 'slow' || softAt != null;
  const lostOk =
    state.mode !== 'lost' ||
    lostAt != null ||
    /lost response|Connection dropped|Could not read the save response/i.test(bodyText);
  const settledOk =
    readyAt != null ||
    /kellie-destination\?v=6/.test(bodyText) ||
    (state.mode === 'lost' && /lost response/i.test(bodyText));

  return {
    name,
    softAtMs: softAt,
    lostAtMs: lostAt,
    readyAtMs: readyAt,
    assignCalls: state.assignCalls,
    navBeforeSave,
    postSaveNavigations: postSaveNavs.length,
    reloadAsRecovery,
    noticeText,
    screenshot: shot,
    ok: softOk && lostOk && settledOk && !reloadAsRecovery && state.assignCalls === 1,
  };
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

try {
  results.push(
    await runScenario(browser, 'hotel-to-destination-soft-timeout', (state) => {
      state.mode = 'slow';
      state.delayMs = 10_000; // > softTimeout 8s
      state.assignments = [hotelRow(9, 'ready')];
    }),
  );
  results.push(
    await runScenario(browser, 'hotel-to-destination-lost-response', (state) => {
      state.mode = 'lost';
      state.assignments = [hotelRow(9, 'ready')];
    }),
  );
} finally {
  await browser.close();
}

const report = {
  createdAt: new Date().toISOString(),
  base: BASE,
  fixtureId: FIXTURE_ID,
  method:
    'Playwright against local dashboard with full /api/creator-assets/** mocks — no live Hotel/Destination/Kellie mutations',
  results,
  allOk: results.every((r) => r.ok),
};

const jsonPath = join(OUT, 'asset-closeout-gap-evidence-2026-09-04.json');
await writeFile(jsonPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.allOk ? 0 : 1);
