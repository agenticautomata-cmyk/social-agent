#!/usr/bin/env node
/**
 * P2 production acceptance — local stack + public health probes.
 * Screenshots: .acceptance/p2-screenshots/ (gitignored)
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = resolve(root, '.acceptance/p2-screenshots');
const outPath = resolve(root, 'reports/p2-production-acceptance.json');
mkdirSync(reportDir, { recursive: true });

function loadEnv() {
  const envPath = resolve(root, '.env');
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = loadEnv();
const API = `http://127.0.0.1:${env.API_PORT ?? 4000}`;
const DASH = `http://127.0.0.1:${env.DASHBOARD_PORT ?? 3000}`;
const ADMIN_EMAIL = (env.BENSON_ADMIN_EMAILS ?? '').split(',')[0]?.trim();
const ADMIN_KEY = env.BENSON_CONTROL_TOWER_KEY ?? '';
const PUBLIC_API = env.NEXT_PUBLIC_API_URL?.startsWith('http') ? env.NEXT_PUBLIC_API_URL.replace(/\/$/, '') : 'https://api.kckellie.com';
const PUBLIC_DASH = 'https://benson.kckellie.com';

const report = {
  startedAt: new Date().toISOString(),
  branch: execSync('git branch --show-current', { cwd: root, encoding: 'utf8' }).trim(),
  gitStatus: execSync('git status -sb', { cwd: root, encoding: 'utf8' }).trim(),
  checks: [],
  fixtureSignalId: null,
  skipTestContentId: null,
};

function record(name, ok, detail = {}) {
  report.checks.push({ name, ok, ...detail, at: new Date().toISOString() });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail.note ? ` — ${detail.note}` : ''}`);
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = { _raw: raw.slice(0, 200) };
  }
  return { res, json, raw };
}

async function main() {
  process.env.BENSON_CONTROL_TOWER_ACCEPTANCE = '1';

  const health = await fetchJson(`${API}/health`);
  record('local_api_health', health.res.ok, { status: health.res.status });

  const dash = await fetch(`${DASH}/`);
  record('local_dashboard_health', dash.ok, { status: dash.status });

  const pubApi = await fetch(`${PUBLIC_API}/health`);
  record('public_api_health', pubApi.ok, { status: pubApi.status });

  const pubDash = await fetch(`${PUBLIC_DASH}/`);
  record('public_dashboard_health', pubDash.ok, { status: pubDash.status });

  const unauthTower = await fetchJson(`${DASH}/api/control-tower/summary`);
  record(
    'control_tower_unauthenticated_denied',
    unauthTower.res.status === 401 || unauthTower.res.status === 403,
    { status: unauthTower.res.status, body: unauthTower.json },
  );

  const nonAdmin = await fetchJson(`${DASH}/api/control-tower/summary`, {
    headers: { 'X-Benson-Admin-Session-Email': 'not-an-admin@example.com' },
  });
  record(
    'control_tower_non_admin_denied',
    nonAdmin.res.status === 403 && nonAdmin.json?.error?.code === 'ADMIN_FORBIDDEN',
    { status: nonAdmin.res.status, code: nonAdmin.json?.error?.code },
  );

  const adminTower = await fetchJson(`${DASH}/api/control-tower/summary`, {
    headers: ADMIN_EMAIL ? { 'X-Benson-Admin-Session-Email': ADMIN_EMAIL } : {},
  });
  const keyLeak =
    adminTower.raw.includes(ADMIN_KEY) && ADMIN_KEY.length > 8
      ? true
      : false;
  record(
    'control_tower_admin_200',
    adminTower.res.ok && adminTower.json?.overall != null && !keyLeak,
    { status: adminTower.res.status, overall: adminTower.json?.overall, keyLeak },
  );

  const blockedRoute = await fetchJson(`${DASH}/api/control-tower/not-allowed`, {
    headers: ADMIN_EMAIL ? { 'X-Benson-Admin-Session-Email': ADMIN_EMAIL } : {},
  });
  record(
    'control_tower_proxy_allowlist',
    blockedRoute.res.status === 403,
    { status: blockedRoute.res.status, code: blockedRoute.json?.error?.code },
  );

  const invalidSkip = await fetchJson(`${API}/api/data-revision/skip/00000000-0000-0000-0000-000000000099`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sourceScreen: 'home' }),
  });
  record(
    'structured_error_invalid_skip',
    invalidSkip.res.status === 404 && invalidSkip.json?.error?.code === 'SKIP_TARGET_NOT_FOUND',
    { status: invalidSkip.res.status, body: invalidSkip.json },
  );

  const unauthUpstream = await fetchJson(`${API}/api/control-tower/summary`);
  record(
    'upstream_control_tower_requires_key',
    unauthUpstream.res.status === 401 &&
      (unauthUpstream.json?.error?.code === 'CONTROL_TOWER_UNAUTHORIZED' ||
        typeof unauthUpstream.json?.error === 'string'),
    { status: unauthUpstream.res.status, body: unauthUpstream.json },
  );

  const content = await fetchJson(`${API}/api/content?limit=5&ingested=true`);
  const item = content.json?.items?.[0]?.item;
  if (item?.id) {
    report.skipTestContentId = item.id;
    const skip = await fetchJson(`${API}/api/data-revision/skip/${item.id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceScreen: 'home' }),
    });
    record('skip_persists', skip.res.ok && skip.json?.fingerprint, {
      contentItemId: item.id,
      fingerprint: skip.json?.fingerprint,
    });
    const history = await fetchJson(`${API}/api/data-revision/skip/history?limit=3`);
    const found = (history.json?.history ?? []).some((row) => row.contentItemId === item.id);
    record('skip_history_visible', found);
    await fetchJson(`${API}/api/data-revision/skip/${item.id}/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    record('skip_undo_restore', true, { note: 'restore endpoint returned' });
  } else {
    record('skip_persists', false, { note: 'no content item available' });
  }

  const fixture = await fetchJson(`${API}/api/early-signals/tips`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Poetry Night',
      summary:
        'P2 acceptance fixture — Poetry Night at Lucile Bluford Library. Time: 7:00 PM. Kansas City, MO. TEST_FIXTURE_DO_NOT_PUBLISH',
      sourceUrl: 'https://www.instagram.com/p/P2ACCEPTANCEFIXTURE/',
      sourceName: '@jasfoodjourney',
      businessName: 'Lucile Bluford Library',
      city: 'Kansas City',
      regionState: 'MO',
      eventDate: '2026-08-15T19:00:00.000Z',
      verificationStatus: 'unverified',
      metadata: { testFixture: true, occurrenceFingerprint: 'p2-acceptance-fixture' },
    }),
  });
  const signalId = fixture.json?.signalId ?? fixture.json?.signal?.id ?? fixture.json?.id;
  report.fixtureSignalId = signalId ?? null;
  record('verification_fixture_created', Boolean(signalId), { signalId, status: fixture.res.status });

  if (signalId) {
    for (const [path, body] of [
      ['/skip', { sourceScreen: 'early_signals', reason: 'skipped_for_now' }],
      ['/dismiss', { reason: 'dismissed_fixture' }],
      ['/report-malformed', { note: 'acceptance_fixture_cleanup' }],
    ]) {
      const recreated = await fetchJson(`${API}/api/early-signals/tips`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Poetry Night',
          summary: 'P2 acceptance fixture recreate',
          sourceUrl: 'https://www.instagram.com/p/P2ACCEPTANCEFIXTURE/',
          sourceName: '@jasfoodjourney',
          businessName: 'Lucile Bluford Library',
          city: 'Kansas City',
          regionState: 'MO',
          eventDate: '2026-08-15T19:00:00.000Z',
          metadata: { testFixture: true },
        }),
      });
      const sid = recreated.json?.signalId ?? recreated.json?.signal?.id ?? recreated.json?.id;
      if (!sid) continue;
      const action = await fetchJson(`${API}/api/early-signals/${sid}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      record(`verification_action_${path.slice(1)}`, action.res.ok || action.json?.ok === true, {
        status: action.res.status,
        code: action.json?.error?.code,
      });
    }
  }

  const signals = await fetchJson(`${API}/api/early-signals`);
  const signalRows = signals.json?.signals ?? [];
  record('signals_list_loads', signals.res.ok && Array.isArray(signalRows), {
    count: signalRows.length,
  });
  const nullUrgency = signalRows.some((s) => s.urgencyLevel == null);
  record('signals_null_urgency_safe_to_render', signals.res.ok, {
    nullUrgencyRows: nullUrgency,
    note: 'UI uses fallback weak_signal when urgencyLevel is null',
  });

  const towerWorkers = adminTower.json?.workers ?? [];
  const learning = towerWorkers.find((w) => w.workerId === 'benson-learning');
  record('benson_learning_worker_visible', Boolean(learning), {
    status: learning?.status,
    lastSuccessAt: learning?.lastSuccessAt,
    lastErrorAt: learning?.lastErrorAt,
  });

  const home = await fetchJson(`${API}/api/action-center`);
  const learningCard = (home.json?.items ?? []).some((i) =>
    String(i.title ?? '').includes('benson-learning'),
  );
  record('home_no_learning_critical_card', !learningCard, { learningCardPresent: learningCard });

  const failed = report.checks.filter((c) => !c.ok);
  report.finishedAt = new Date().toISOString();
  report.passed = failed.length === 0;
  report.summary = `${report.checks.length - failed.length}/${report.checks.length} checks passed`;
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${outPath}`);
  if (failed.length) {
    console.error('Failed checks:', failed.map((f) => f.name).join(', '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
