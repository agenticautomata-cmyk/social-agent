import { env } from '../env.js';

export type InstagramSessionStatus =
  | 'ready'
  | 'login_required'
  | 'captcha_blocked'
  | 'unavailable'
  | 'none';

export type InstagramBrowserContext = {
  browser: import('playwright').Browser;
  context: import('playwright').BrowserContext;
  page: import('playwright').Page;
};

const LOGIN_CHALLENGE =
  /log in|sign up|loginform|challenge_required|captcha|checkpoint/i;

function profileDir(): string | null {
  const dir = process.env.SCOUT_INSTAGRAM_PROFILE_DIR?.trim();
  return dir || null;
}

export function instagramSessionConfigured(): boolean {
  return Boolean(profileDir());
}

export async function openInstagramSession(): Promise<{
  ctx: InstagramBrowserContext | null;
  status: InstagramSessionStatus;
  sanitizedFailure?: string;
}> {
  try {
    const { chromium } = await import('playwright');
    const dir = profileDir();
    const browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const context = dir
      ? await browser.newContext({
          storageState: undefined,
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          viewport: { width: 1280, height: 900 },
        })
      : await browser.newContext({
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          viewport: { width: 1280, height: 900 },
        });

    if (dir) {
      try {
        const fs = await import('node:fs/promises');
        const statePath = `${dir}/storage-state.json`;
        await fs.access(statePath);
        await context.close();
        const authedContext = await browser.newContext({
          storageState: statePath,
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          viewport: { width: 1280, height: 900 },
        });
        const page = await authedContext.newPage();
        return {
          ctx: { browser, context: authedContext, page },
          status: 'ready',
        };
      } catch {
        // fall through — no saved session
      }
    }

    const page = await context.newPage();
    return { ctx: { browser, context, page }, status: dir ? 'login_required' : 'none' };
  } catch (err) {
    return {
      ctx: null,
      status: 'unavailable',
      sanitizedFailure: err instanceof Error ? err.message.slice(0, 120) : 'browser_unavailable',
    };
  }
}

export async function closeInstagramSession(ctx: InstagramBrowserContext | null): Promise<void> {
  if (!ctx) return;
  try {
    await ctx.browser.close();
  } catch {
    // ignore
  }
}

export async function detectInstagramAuthWall(page: import('playwright').Page): Promise<InstagramSessionStatus> {
  const url = page.url();
  const bodyText = String(
    await page.evaluate(`(() => document.body?.innerText?.slice(0, 4000) ?? '')()`),
  );
  if (/captcha|challenge/i.test(url) || /captcha|security check/i.test(bodyText)) {
    return 'captcha_blocked';
  }
  if (LOGIN_CHALLENGE.test(bodyText) && bodyText.length < 2500) {
    return 'login_required';
  }
  return 'ready';
}

export async function pauseWatcherForAuth(
  watcherId: string,
  reason: string,
): Promise<void> {
  const { db } = await import('../db.js');
  const { sourceWatchers, scoutSocialSessions } = await import('../schema.js');
  const { eq } = await import('drizzle-orm');

  await db
    .update(sourceWatchers)
    .set({
      paused: true,
      sessionStatus: 'login_required',
      authenticationRequired: true,
      healthStatus: 'login_required',
      lastFailureMessage: reason.slice(0, 200),
      updatedAt: new Date(),
    })
    .where(eq(sourceWatchers.id, watcherId));

  const storageRef = profileDir() ? 'local-profile-dir' : null;
  await db.insert(scoutSocialSessions).values({
    watcherId,
    platform: 'instagram',
    profileReference: storageRef ?? 'unconfigured',
    sessionStatus: 'login_required',
    needsUserLogin: true,
    sanitizedFailure: reason.slice(0, 200),
    storageRef,
    lastValidatedAt: new Date(),
  });
}

export function sanitizeForLogs(_value: string): string {
  return '[redacted]';
}

export function sessionEnvSummary(): { configured: boolean; profileDir: string | null } {
  return {
    configured: instagramSessionConfigured(),
    profileDir: profileDir() ? sanitizeForLogs(profileDir()!) : null,
  };
}

// env import silences unused in strict builds when OPENAI not used here
void env;
