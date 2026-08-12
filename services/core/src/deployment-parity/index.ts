/**
 * Deployment parity — compares a source/build fingerprint against what is
 * actually running. Commit hash alone is not valid because the working tree
 * often contains significant uncommitted changes.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type DeploymentParity = {
  status: 'MATCH' | 'DRIFT' | 'UNKNOWN';
  sourceFingerprint: string | null;
  apiFingerprint: string | null;
  dashboardFingerprint: string | null;
  workerFingerprint: string | null;
  apiStartedAt: string | null;
  dashboardBuiltAt: string | null;
  workerStartedAt: string | null;
  message: string;
};

function resolveRoot(cwd = process.cwd()): string {
  if (existsSync(join(cwd, 'pnpm-workspace.yaml'))) return cwd;
  if (existsSync(join(cwd, '../..', 'pnpm-workspace.yaml'))) return join(cwd, '../..');
  return cwd;
}

const FINGERPRINT_PATHS = [
  'package.json',
  'pnpm-lock.yaml',
  'services/api/src',
  'services/core/src',
  'services/workers/src',
  'dashboard/app',
  'dashboard/components',
  'dashboard/lib',
  'dashboard/package.json',
  'db/migrations',
  'scripts/benson-runtime-lib.sh',
];

const SKIP_DIR_NAMES = new Set(['node_modules', '.next', 'dist', 'coverage', '.git']);

function listFiles(root: string, rel: string, out: string[]): void {
  const abs = join(root, rel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isFile()) {
    out.push(rel);
    return;
  }
  if (!st.isDirectory()) return;
  for (const name of readdirSync(abs).sort()) {
    if (SKIP_DIR_NAMES.has(name)) continue;
    if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) continue;
    listFiles(root, join(rel, name), out);
  }
}

export async function computeSourceFingerprint(root = resolveRoot()): Promise<string> {
  const files: string[] = [];
  for (const p of FINGERPRINT_PATHS) listFiles(root, p, files);
  files.sort();

  const hash = createHash('sha256');
  for (const rel of files) {
    hash.update(rel);
    hash.update('\0');
    const abs = join(root, rel);
    try {
      const st = statSync(abs);
      hash.update(String(st.size));
      hash.update('\0');
      hash.update(String(Math.floor(st.mtimeMs)));
      hash.update('\0');
      if (st.size > 0 && st.size < 1_500_000 && /\.(ts|tsx|js|mjs|json|sql|sh|yml|yaml|css)$/.test(rel)) {
        hash.update(readFileSync(abs));
      }
      hash.update('\n');
    } catch {
      hash.update('missing\n');
    }
  }
  return hash.digest('hex').slice(0, 16);
}

type RuntimeManifest = {
  fingerprint?: string;
  startedAt?: string;
  builtAt?: string;
  role?: string;
};

function readJsonFile(path: string): RuntimeManifest | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as RuntimeManifest;
  } catch {
    return null;
  }
}

export async function readDeploymentParity(root = resolveRoot()): Promise<DeploymentParity> {
  const logDir = join(root, '.logs', 'pre-alpha');
  const sourceFingerprint = await computeSourceFingerprint(root).catch(() => null);

  const api = readJsonFile(join(logDir, 'api.runtime.json'));
  const workers = readJsonFile(join(logDir, 'workers.runtime.json'));
  const dashboard = readJsonFile(join(logDir, 'dashboard.runtime.json'));
  const deployed = readJsonFile(join(logDir, 'deployed.fingerprint.json'));

  const apiFingerprint = api?.fingerprint ?? deployed?.fingerprint ?? null;
  const workerFingerprint = workers?.fingerprint ?? deployed?.fingerprint ?? null;
  const dashboardFingerprint = dashboard?.fingerprint ?? deployed?.fingerprint ?? null;

  const running = [apiFingerprint, workerFingerprint, dashboardFingerprint].filter(Boolean) as string[];
  let status: DeploymentParity['status'] = 'UNKNOWN';
  let message = 'Deployment fingerprints not recorded yet — run pnpm benson:deploy-local.';

  if (sourceFingerprint && running.length > 0) {
    const allMatch = running.every((fp) => fp === sourceFingerprint);
    if (allMatch && running.length >= 2) {
      status = 'MATCH';
      message = 'Source and runtime fingerprints match.';
    } else {
      status = 'DRIFT';
      message = 'Source changes are not deployed.';
    }
  }

  return {
    status,
    sourceFingerprint,
    apiFingerprint,
    dashboardFingerprint,
    workerFingerprint,
    apiStartedAt: api?.startedAt ?? null,
    dashboardBuiltAt: dashboard?.builtAt ?? dashboard?.startedAt ?? null,
    workerStartedAt: workers?.startedAt ?? null,
    message,
  };
}

/** Write a fingerprint file for a role after a successful start/build. */
export function writeRuntimeFingerprint(
  role: 'api' | 'workers' | 'dashboard' | 'deployed',
  fingerprint: string,
  root = resolveRoot(),
  extra: Record<string, string | null> = {},
): void {
  const logDir = join(root, '.logs', 'pre-alpha');
  mkdirSync(logDir, { recursive: true });
  const file =
    role === 'deployed' ? 'deployed.fingerprint.json' : `${role}.runtime.json`;
  writeFileSync(
    join(logDir, file),
    JSON.stringify(
      {
        role,
        fingerprint,
        startedAt: new Date().toISOString(),
        builtAt: extra.builtAt ?? null,
        ...extra,
      },
      null,
      2,
    ),
  );
}
