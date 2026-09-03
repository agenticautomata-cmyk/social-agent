/**
 * Screenshots Benson surfaces at mobile and desktop sizes for visual verification.
 *
 * Visual checks cannot be delegated to a passing test: clipping, overlap, a bottom nav
 * covering the final action, and a stale number all render fine and assert nothing.
 *
 * Usage: tsx screenshot-surfaces.ts <label> <url> [<label> <url> ...]
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  applyPlaywrightBrowsersEnv,
  bensonRepoRoot,
  launchManagedChromium,
  sanitizePlaywrightOperatorError,
} from '../playwright-runtime/index.js';

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const DATE = '2026-09-03';

type Target = { label: string; url: string };

function parseTargets(): Target[] {
  const args = process.argv.slice(2);
  const targets: Target[] = [];
  for (let i = 0; i + 1 < args.length; i += 2) {
    targets.push({ label: args[i]!, url: args[i + 1]! });
  }
  return targets;
}

async function main(): Promise<void> {
  const targets = parseTargets();
  if (targets.length === 0) {
    console.error('Usage: screenshot-surfaces.ts <label> <url> [<label> <url> ...]');
    process.exit(1);
  }

  const repoRoot = bensonRepoRoot();
  applyPlaywrightBrowsersEnv(repoRoot);
  const outDir = join(repoRoot, 'docs', 'ops', 'screenshots');
  await mkdir(outDir, { recursive: true });

  const browser = await launchManagedChromium();
  try {
    for (const target of targets) {
      for (const [sizeName, size] of [
        ['mobile', MOBILE],
        ['desktop', DESKTOP],
      ] as const) {
        const context = await browser.newContext({
          viewport: size,
          deviceScaleFactor: 2,
          // Matches a phone so mobile layout rules actually apply.
          isMobile: sizeName === 'mobile',
          hasTouch: sizeName === 'mobile',
        });
        const page = await context.newPage();
        try {
          await page.goto(target.url, { waitUntil: 'networkidle', timeout: 45_000 });
          // Let webfonts and any deferred layout settle before capturing.
          await page.waitForTimeout(1200);
          const file = join(
            outDir,
            `hospitality-partnership-${DATE}-${target.label}-${sizeName}.png`,
          );
          await page.screenshot({ path: file, fullPage: true });

          // Horizontal overflow is the usual cause of a clipped mobile surface.
          // Evaluated as a string because core is built without the DOM lib.
          const overflow = (await page.evaluate(
            `({
              scrollWidth: document.documentElement.scrollWidth,
              clientWidth: document.documentElement.clientWidth,
              scrollHeight: document.documentElement.scrollHeight,
            })`,
          )) as { scrollWidth: number; clientWidth: number; scrollHeight: number };
          const clipped = overflow.scrollWidth > overflow.clientWidth + 1;
          console.log(
            `${target.label} ${sizeName}: ${file}${clipped ? `  ** HORIZONTAL OVERFLOW ${overflow.scrollWidth}px > ${overflow.clientWidth}px **` : ''}`,
          );
        } catch (error) {
          console.log(
            `${target.label} ${sizeName}: FAILED — ${sanitizePlaywrightOperatorError(
              (error as Error).message,
            )}`,
          );
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
}

void main();
