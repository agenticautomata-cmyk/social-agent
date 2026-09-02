import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  applyPlaywrightBrowsersEnv,
  isMissingBrowserError,
  playwrightBrowsersPath,
  sanitizePlaywrightOperatorError,
} from './index.js';

describe('playwright runtime provisioning', () => {
  it('does not default to the disposable home cache', () => {
    const prev = process.env.PLAYWRIGHT_BROWSERS_PATH;
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    const path = playwrightBrowsersPath('/repo/benson');
    assert.equal(path, join('/repo/benson', '.benson', 'playwright'));
    assert.doesNotMatch(path, /\/\.cache\/ms-playwright/);
    assert.doesNotMatch(path, /\/home\/elliott/);
    if (prev === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = prev;
  });

  it('honors PLAYWRIGHT_BROWSERS_PATH override', () => {
    const prev = process.env.PLAYWRIGHT_BROWSERS_PATH;
    process.env.PLAYWRIGHT_BROWSERS_PATH = join(tmpdir(), 'benson-pw-test');
    assert.equal(playwrightBrowsersPath('/ignored'), join(tmpdir(), 'benson-pw-test'));
    if (prev === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = prev;
  });

  it('detects a missing browser executable error', () => {
    assert.equal(
      isMissingBrowserError(
        "browserType.launch: Executable doesn't exist at /home/elliott/.cache/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell",
      ),
      true,
    );
    assert.equal(isMissingBrowserError('Instagram login required'), false);
  });

  it('strips filesystem paths from operator-facing errors', () => {
    const clean = sanitizePlaywrightOperatorError(
      "browserType.launch: Executable doesn't exist at /home/elliott/.cache/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell",
    );
    assert.match(clean, /browser/i);
    assert.doesNotMatch(clean, /elliott/);
    assert.doesNotMatch(clean, /ms-playwright/);
    assert.doesNotMatch(clean, /chrome-headless-shell/);
  });

  it('applyPlaywrightBrowsersEnv writes the durable path', () => {
    const prev = process.env.PLAYWRIGHT_BROWSERS_PATH;
    delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    const path = applyPlaywrightBrowsersEnv('/repo/benson');
    assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH, path);
    assert.equal(path, join('/repo/benson', '.benson', 'playwright'));
    if (prev === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = prev;
  });
});
