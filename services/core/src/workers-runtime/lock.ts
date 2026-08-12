import fs from 'node:fs';
import path from 'node:path';

export type WorkersStartLockMeta = {
  pid: number;
  startedAt: string;
  phase: 'starting' | 'running';
};

export function workersRuntimePaths(repoRoot?: string) {
  const root = repoRoot ?? process.env.BENSON_REPO_ROOT ?? process.cwd();
  const logDir = path.join(root, '.logs/pre-alpha');
  return {
    logDir,
    pidFile: path.join(logDir, 'benson-workers.pid'),
    lockFile: path.join(logDir, 'workers.start.lock'),
    metaFile: path.join(logDir, 'workers.start.meta'),
  };
}

function pidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readMeta(metaFile: string): WorkersStartLockMeta | null {
  try {
    const raw = fs.readFileSync(metaFile, 'utf8');
    const parsed = JSON.parse(raw) as WorkersStartLockMeta;
    if (typeof parsed.pid !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** True when the Benson workers supervisor process is alive. */
export function readWorkersProcessRunning(repoRoot?: string): boolean {
  const { pidFile } = workersRuntimePaths(repoRoot);
  try {
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    return pidAlive(pid);
  } catch {
    return false;
  }
}

/** Remove stale start lock metadata left after abnormal worker exit. */
export function releaseWorkersStartLock(repoRoot?: string): void {
  const { lockFile, metaFile } = workersRuntimePaths(repoRoot);
  for (const file of [metaFile, lockFile]) {
    try {
      fs.unlinkSync(file);
    } catch {
      // ignore missing files
    }
  }
}

/** Recover stale lock when meta/pid no longer reference a live process. */
export function recoverStaleWorkersStartLock(repoRoot?: string): { recovered: boolean; reason: string } {
  const paths = workersRuntimePaths(repoRoot);

  const workerPid = (() => {
    try {
      return Number(fs.readFileSync(paths.pidFile, 'utf8').trim());
    } catch {
      return NaN;
    }
  })();

  if (pidAlive(workerPid)) {
    return { recovered: false, reason: 'worker_running' };
  }

  if (Number.isFinite(workerPid)) {
    try {
      fs.unlinkSync(paths.pidFile);
    } catch {
      // ignore
    }
  }

  const meta = fs.existsSync(paths.metaFile) ? readMeta(paths.metaFile) : null;
  if (meta?.pid && pidAlive(meta.pid)) {
    return { recovered: false, reason: 'start_in_progress' };
  }

  const hadLock = fs.existsSync(paths.lockFile) || fs.existsSync(paths.metaFile);
  releaseWorkersStartLock(repoRoot);
  return { recovered: hadLock, reason: hadLock ? 'stale_lock_removed' : 'no_lock' };
}

export function writeWorkersStartLockMeta(
  pid: number,
  phase: WorkersStartLockMeta['phase'],
  repoRoot?: string,
): void {
  const { logDir, metaFile } = workersRuntimePaths(repoRoot);
  fs.mkdirSync(logDir, { recursive: true });
  const meta: WorkersStartLockMeta = {
    pid,
    startedAt: new Date().toISOString(),
    phase,
  };
  fs.writeFileSync(metaFile, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}
