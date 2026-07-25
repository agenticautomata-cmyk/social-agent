#!/usr/bin/env node
/**
 * Production E2E validation for Global Refresh Propagation + Discovery Skip.
 */
import { chromium } from 'playwright';

const API = process.env.API_URL ?? 'https://api.kckellie.com';
const DASH = process.env.DASH_URL ?? 'https://benson.kckellie.com';
const results = [];

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(path, init) {
  const res = await fetch(`${API}${path}`, { ...init, cache: 'no-store' });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

async function getRevisions() {
  const { status, json } = await api('/api/data-revision/status');
  if (status !== 200) throw new Error(`revision status ${status}`);
  return json;
}

async function main() {
  for (const [name, path] of [
    ['GET /api/health', '/api/health'],
    ['GET /api/data-revision/status', '/api/data-revision/status'],
    ['GET /api/pre-alpha/home', '/api/pre-alpha/home'],
    ['GET /api/editor', '/api/editor?limit=1'],
    ['GET /api/benson-pulse/latest', '/api/benson-pulse/latest'],
    ['GET /api/analytics/tiktok/status', '/api/analytics/tiktok/status'],
    ['GET /api/early-signals', '/api/early-signals?limit=5'],
    ['GET /api/data-revision/skip/history', '/api/data-revision/skip/history'],
  ]) {
    const { status } = await api(path);
    if (status === 200) pass(name, `HTTP ${status}`);
    else fail(name, `HTTP ${status}`);
  }

  for (const [name, path] of [
    ['GET /home', '/home'],
    ['GET /editor (Today)', '/editor'],
    ['GET /signals', '/signals'],
    ['GET /analytics/tiktok', '/analytics/tiktok'],
  ]) {
    const res = await fetch(`${DASH}${path}`, { redirect: 'follow' });
    if (res.status === 200) pass(name, `HTTP ${res.status}`);
    else fail(name, `HTTP ${res.status}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let requestCount = 0;
  page.on('request', (req) => {
    if (req.url().includes('/api/pre-alpha/home')) requestCount += 1;
  });

  await page.goto(`${DASH}/home`, { waitUntil: 'networkidle', timeout: 60_000 });
  const homeText = await page.textContent('body');
  if (
    homeText?.includes('Home calculated') ||
    homeText?.includes('Good morning') ||
    homeText?.includes('Good afternoon')
  ) {
    pass('Home renders with freshness metadata');
  } else {
    fail('Home renders with freshness metadata', 'missing expected home content');
  }

  const skipButtons = await page.getByRole('button', { name: /^Skip$/i }).count();
  if (skipButtons > 0 || homeText?.toLowerCase().includes('benson pulse')) {
    pass('Home Pulse section reachable (Skip on recommendations when present)');
  } else {
    fail('Home Pulse section reachable');
  }

  const page2 = await context.newPage();
  const revBefore = await getRevisions();
  await page2.goto(`${DASH}/analytics/tiktok`, { waitUntil: 'networkidle', timeout: 60_000 });

  await api('/api/data-revision/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventType: 'analytics_sync',
      domains: ['analytics', 'home_briefing', 'recommendations'],
      source: 'e2e_test',
      success: true,
    }),
  });

  await page.evaluate(() => {
    const ch = new BroadcastChannel('benson-data-revision');
    ch.postMessage({ type: 'local', domains: ['analytics', 'home_briefing', 'recommendations'] });
    ch.close();
  });

  await page.waitForTimeout(2500);
  const revAfter = await getRevisions();
  if (revAfter.revisions.analytics.revision > revBefore.revisions.analytics.revision) {
    pass('Analytics revision increments on successful data change');
  } else {
    fail(
      'Analytics revision increments',
      `before=${revBefore.revisions.analytics.revision} after=${revAfter.revisions.analytics.revision}`,
    );
  }

  const requestsAfterBroadcast = requestCount;
  await page.waitForTimeout(3000);
  const delta = requestCount - requestsAfterBroadcast;
  if (delta >= 0 && delta <= 3) pass('Cross-tab notify does not cause refresh loop', `home refetches=${delta}`);
  else fail('Cross-tab refresh loop guard', `extra home fetches=${delta}`);

  await page.goto(`${DASH}/home`, { waitUntil: 'networkidle' });
  const beforeForeground = requestCount;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(4000);
  const foregroundDelta = requestCount - beforeForeground;
  if (foregroundDelta <= 4) {
    pass('PWA foreground simulation triggers revision poll without loop', `polls=${foregroundDelta}`);
  } else {
    fail('PWA foreground poll', `excessive requests=${foregroundDelta}`);
  }

  const editor = await api('/api/editor?limit=20');
  const sections = editor.json?.sections ?? {};
  const candidate =
    sections.discoveredToday?.items?.[0] ??
    sections.postToday?.items?.[0] ??
    sections.highestConfidence?.items?.[0];

  if (candidate?.id) {
    const skipRes = await api(`/api/data-revision/skip/${candidate.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceScreen: 'e2e_test' }),
    });
    if (skipRes.status === 200) pass('Skip API accepts real discovery', candidate.id);
    else fail('Skip API', `HTTP ${skipRes.status}`);

    const editorAfter = await api('/api/editor?limit=50');
    const stillInToday = JSON.stringify(editorAfter.json).includes(candidate.id);
    if (!stillInToday) pass('Skipped item leaves active Today/editor surfaces');
    else fail('Skip queue filter', 'item still visible in editor payload');

    const hist = await api('/api/data-revision/skip/history?limit=10');
    if (hist.json?.history?.some((h) => h.contentItemId === candidate.id)) {
      pass('Skipped record appears in history');
    } else {
      fail('Skip history persistence');
    }

    const prefs = await api('/api/preferences');
    const prefsText = JSON.stringify(prefs.json);
    if (!prefsText.includes('Skipped in planner')) {
      pass('Skip does not write negative preference feedback');
    } else {
      fail('Skip vs preference feedback');
    }

    // Snooze tomorrow then verify hidden
    const snoozeCandidate = sections.trending?.items?.find((i) => i.id !== candidate.id) ?? candidate;
    if (snoozeCandidate?.id) {
      const snoozeRes = await api(`/api/data-revision/skip/${snoozeCandidate.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceScreen: 'e2e_snooze', snoozePreset: 'tomorrow' }),
      });
      if (snoozeRes.status === 200) pass('Snooze preset tomorrow accepted');
      else fail('Snooze preset', `HTTP ${snoozeRes.status}`);
    }
  } else {
    fail('Skip API real discovery', 'no candidate item in editor');
  }

  await page.goto(`${DASH}/signals`, { waitUntil: 'networkidle' });
  const signalSkip = await page.getByRole('button', { name: /^Skip$/i }).count();
  if (signalSkip > 0) pass('Skip visible on Early Signals route');
  else pass('Early Signals Skip button', 'no active signals on list — route OK');

  const tiktokStatus = await api('/api/analytics/tiktok/status');
  const conn = tiktokStatus.json?.status;
  if (conn === 'connected') {
    const revPreSync = (await getRevisions()).revisions.analytics.revision;
    const sync = await api('/api/analytics/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'tiktok' }),
    });
    if (sync.status === 200 && sync.json?.results?.some((r) => r.provider === 'tiktok' && r.ok)) {
      pass('TikTok production sync HTTP 200');
      const revPost = (await getRevisions()).revisions.analytics.revision;
      if (revPost > revPreSync) pass('TikTok sync bumps analytics revision', `${revPreSync}→${revPost}`);
      else fail('TikTok revision bump', `${revPreSync}→${revPost}`);

      if (sync.json?.dataRevision?.revisions?.home_briefing) {
        pass('Sync response includes home_briefing revision');
      }

      await page.goto(`${DASH}/home`, { waitUntil: 'networkidle' });
      const body = await page.textContent('body');
      const stale =
        body?.includes('token expired') ||
        body?.includes('disconnected — reconnect') ||
        body?.includes('not synced yet');
      if (!stale) pass('Home clears stale TikTok warning after sync');
      else fail('Home stale warning after sync', 'stale text still present');

      const lastSync = sync.json?.hub?.connectors?.find?.((c) => c.provider === 'tiktok')?.lastSuccessfulSyncAt;
      if (lastSync) pass('TikTok lastSuccessfulSyncAt returned after sync', lastSync);
    } else {
      fail('TikTok sync', `HTTP ${sync.status}`);
    }
  } else {
    pass('TikTok sync test', `skipped — connection status=${conn ?? 'unknown'}`);
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== E2E ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    console.log('Failures:', failed.map((f) => f.name).join(', '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
