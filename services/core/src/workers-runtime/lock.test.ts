import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readWorkersProcessRunning,
  recoverStaleWorkersStartLock,
  releaseWorkersStartLock,
  writeWorkersStartLockMeta,
  workersRuntimePaths,
} from './lock.js';

describe('workers start lock recovery', () => {
  let tmpRoot = '';

  after(() => {
    if (tmpRoot) {
      releaseWorkersStartLock(tmpRoot);
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('removes stale lock when pid/meta no longer reference a live process', () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'benson-lock-'));
    const paths = workersRuntimePaths(tmpRoot);
    fs.mkdirSync(paths.logDir, { recursive: true });
    fs.writeFileSync(paths.lockFile, '', 'utf8');
    writeWorkersStartLockMeta(999999, 'starting', tmpRoot);
    fs.writeFileSync(paths.pidFile, '999998', 'utf8');

    const result = recoverStaleWorkersStartLock(tmpRoot);
    assert.equal(result.recovered, true);
    assert.equal(fs.existsSync(paths.lockFile), false);
    assert.equal(fs.existsSync(paths.metaFile), false);
    assert.equal(readWorkersProcessRunning(tmpRoot), false);
  });
});
