#!/usr/bin/env node
/**
 * Seed the Instagram session Benson uses to read shared links.
 *
 * Opens a real browser window, waits for you to log in by hand (including 2FA),
 * then saves the session to SCOUT_INSTAGRAM_PROFILE_DIR/storage-state.json.
 * Credentials are never read or stored by this script — only the resulting cookies.
 *
 * Usage: pnpm benson:instagram-login
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** Read one key out of .env without pulling in a dependency. */
async function envFileValue(key) {
  const envPath = join(dirname(dirname(fileURLToPath(import.meta.url))), '.env');
  try {
    const contents = await readFile(envPath, 'utf8');
    for (const line of contents.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (match?.[1] === key) return match[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // no .env — fall back to the default path
  }
  return null;
}

const PROFILE_DIR =
  process.env.SCOUT_INSTAGRAM_PROFILE_DIR?.trim() ||
  (await envFileValue('SCOUT_INSTAGRAM_PROFILE_DIR')) ||
  `${process.env.HOME}/.benson/scout-instagram-profile`;

const STATE_PATH = `${PROFILE_DIR}/storage-state.json`;

async function main() {
  const { chromium } = await import('playwright');

  console.log(`Instagram session will be saved to:\n  ${STATE_PATH}\n`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    await page.goto('https://www.instagram.com/accounts/login/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    console.log('A browser window is open. Log in to Instagram there.');
    console.log('Complete any 2FA or "Save your login info" prompts until you see your feed.\n');

    const rl = createInterface({ input: stdin, output: stdout });
    await rl.question('Press Enter here once you are fully logged in… ');
    rl.close();

    await page.goto('https://www.instagram.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    const bodyText = String(
      await page.evaluate(`(() => document.body?.innerText?.slice(0, 3000) ?? '')()`),
    );
    if (/log in|sign up/i.test(bodyText) && bodyText.length < 2500) {
      console.error('\nStill seeing a logged-out page. Session NOT saved. Re-run and try again.');
      process.exitCode = 1;
      return;
    }

    await mkdir(PROFILE_DIR, { recursive: true });
    const state = await context.storageState();
    await writeFile(STATE_PATH, JSON.stringify(state, null, 2), { mode: 0o600 });

    console.log(`\nSession saved to ${STATE_PATH}`);
    console.log(`Confirm your .env has:\n  SCOUT_INSTAGRAM_PROFILE_DIR=${PROFILE_DIR}`);
    console.log('\nRestart the Benson workers/API to pick it up.');
  } finally {
    await browser.close();
  }
}

await main();
