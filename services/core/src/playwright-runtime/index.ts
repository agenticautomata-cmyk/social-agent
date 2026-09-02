/**
 * Durable Playwright Chromium for Benson workers and manual Watchlist checks.
 * Browsers live under PLAYWRIGHT_BROWSERS_PATH (default: <repo>/.benson/playwright),
 * not ~/.cache/ms-playwright.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_PLAYWRIGHT_BROWSERS_REL = join('.benson', 'playwright');

export function bensonRepoRoot(): string {
  return process.env.BENSON_REPO_ROOT?.trim() || process.cwd();
}

export function playwrightBrowsersPath(repoRoot = bensonRepoRoot()): string {
  const override = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (override) return override;
  return join(repoRoot, DEFAULT_PLAYWRIGHT_BROWSERS_REL);
}

export function applyPlaywrightBrowsersEnv(repoRoot = bensonRepoRoot()): string {
  const path = playwrightBrowsersPath(repoRoot);
  process.env.PLAYWRIGHT_BROWSERS_PATH = path;
  return path;
}

export function isMissingBrowserError(message: string | null | undefined): boolean {
  const value = message ?? '';
  return /executable doesn't exist|ms-playwright|chrome-headless-shell|browserType\.launch/i.test(value);
}

export function sanitizePlaywrightOperatorError(message: string | null | undefined): string {
  const value = (message ?? '').trim();
  if (!value) return 'Benson could not open its browser, so this source was not checked.';
  if (isMissingBrowserError(value)) {
    return 'Benson could not open its browser, so this source was not checked.';
  }
  return value
    .replace(/\/home\/[^\s:]+/g, '[path]')
    .replace(/\/var\/[^\s:]+/g, '[path]')
    .replace(/[A-Za-z]:\\[^\s:]+/g, '[path]')
    .slice(0, 220);
}

export type PlaywrightBrowserStatus = {
  ok: boolean;
  browsersPath: string;
  executablePath: string | null;
  installedBytes: number | null;
  reason: string | null;
};

function dirSizeBytes(dir: string): number {
  let total = 0;
  const walk = (root: string) => {
    let entries: string[] = [];
    try {
      entries = readdirSync(root);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(root, name);
      try {
        const info = statSync(full);
        if (info.isDirectory()) walk(full);
        else total += info.size;
      } catch {
        /* ignore */
      }
    }
  };
  walk(dir);
  return total;
}

export async function playwrightBrowserStatus(repoRoot = bensonRepoRoot()): Promise<PlaywrightBrowserStatus> {
  const browsersPath = applyPlaywrightBrowsersEnv(repoRoot);
  const { chromium } = await import('playwright');
  const executablePath = chromium.executablePath();
  if (!executablePath || !existsSync(executablePath)) {
    return {
      ok: false,
      browsersPath,
      executablePath: executablePath || null,
      installedBytes: existsSync(browsersPath) ? dirSizeBytes(browsersPath) : 0,
      reason: 'missing_browser_executable',
    };
  }
  return {
    ok: true,
    browsersPath,
    executablePath,
    installedBytes: dirSizeBytes(browsersPath),
    reason: null,
  };
}

export async function launchManagedChromium(args: string[] = ['--disable-blink-features=AutomationControlled']) {
  const status = await playwrightBrowserStatus();
  if (!status.ok || !status.executablePath) {
    const err = new Error(sanitizePlaywrightOperatorError('Executable does not exist'));
    (err as Error & { code?: string }).code = 'PLAYWRIGHT_BROWSER_MISSING';
    throw err;
  }
  const { chromium } = await import('playwright');
  return chromium.launch({
    headless: true,
    executablePath: status.executablePath,
    args,
  });
}

export function installedBrowserBytes(repoRoot = bensonRepoRoot()): number {
  const path = playwrightBrowsersPath(repoRoot);
  if (!existsSync(path)) return 0;
  try {
    return dirSizeBytes(path);
  } catch {
    return 0;
  }
}

export function browsersPathExists(repoRoot = bensonRepoRoot()): boolean {
  const path = playwrightBrowsersPath(repoRoot);
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}
