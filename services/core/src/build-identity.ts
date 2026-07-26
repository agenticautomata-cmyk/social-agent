import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type BuildIdentity = {
  gitCommit: string | null;
  releaseTag: string | null;
  buildTime: string | null;
  processStartedAt: string;
  serviceName: string;
  environment: string;
  supervisor: string | null;
};

const PROCESS_STARTED_AT = new Date().toISOString();

function readEnvFileValue(path: string, key: string): string | null {
  try {
    const text = readFileSync(path, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      if (trimmed.slice(0, eq) === key) {
        const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        return value || null;
      }
    }
  } catch {
    // optional file
  }
  return null;
}

function gitValue(args: string[]): string | null {
  try {
    const repoRoot = process.env.BENSON_REPO_ROOT ?? process.cwd();
    const out = execSync(`git ${args.join(' ')}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

function resolveFromBuildEnvFile(): Partial<BuildIdentity> {
  const file =
    process.env.BENSON_BUILD_IDENTITY_FILE ??
    join(process.env.BENSON_REPO_ROOT ?? process.cwd(), '.logs/pre-alpha/build-identity.env');
  return {
    gitCommit: readEnvFileValue(file, 'BENSON_GIT_COMMIT'),
    releaseTag: readEnvFileValue(file, 'BENSON_RELEASE_TAG'),
    buildTime: readEnvFileValue(file, 'BENSON_BUILD_TIME'),
    supervisor: readEnvFileValue(file, 'BENSON_SUPERVISOR'),
  };
}

export function getBuildIdentity(serviceName = 'benson-api'): BuildIdentity {
  const fromFile = resolveFromBuildEnvFile();
  const environment =
    process.env.BENSON_ENVIRONMENT ??
    (process.env.NODE_ENV === 'production' ? 'production' : 'development');

  return {
    gitCommit:
      process.env.BENSON_GIT_COMMIT ??
      fromFile.gitCommit ??
      gitValue(['rev-parse', '--short', 'HEAD']),
    releaseTag:
      process.env.BENSON_RELEASE_TAG ??
      fromFile.releaseTag ??
      gitValue(['describe', '--tags', '--exact-match']),
    buildTime:
      process.env.BENSON_BUILD_TIME ??
      fromFile.buildTime ??
      null,
    processStartedAt: PROCESS_STARTED_AT,
    serviceName,
    environment,
    supervisor:
      process.env.BENSON_SUPERVISOR ??
      fromFile.supervisor ??
      (process.env.INVOCATION_ID ? 'systemd' : null),
  };
}
