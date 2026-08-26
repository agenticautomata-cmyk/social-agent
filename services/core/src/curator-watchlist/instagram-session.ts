import { and, eq, or, sql } from 'drizzle-orm';
import { env } from '../env.js';
import { sourceWatchers, scoutSocialSessions } from '../schema.js';

export type InstagramSessionStatus =
  | 'ready'
  | 'login_required'
  | 'captcha_blocked'
  | 'consent_required'
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

/** True only when a saved logged-in session actually exists on disk. */
export async function instagramSessionSeeded(): Promise<boolean> {
  const dir = profileDir();
  if (!dir) return false;
  try {
    const fs = await import('node:fs/promises');
    await fs.access(`${dir}/storage-state.json`);
    return true;
  } catch {
    return false;
  }
}

/** Shared platform session — not per watched account. */
export async function sharedInstagramSessionReady(): Promise<boolean> {
  return instagramSessionConfigured() && (await instagramSessionSeeded());
}

export type InstagramWatcherSessionFlags = {
  sessionStatus: 'ready' | 'login_required';
  authenticationRequired: boolean;
  paused: boolean;
  healthStatus: 'pending' | 'login_required';
};

/**
 * Map the shared Instagram session onto a Watchlist source.
 * Inspect.loginRequired means the platform needs a session, not that this account
 * needs its own login.
 */
export function instagramWatcherFlagsFromSharedSession(input: {
  sessionReady: boolean;
  monitoringMode?: string | null;
}): InstagramWatcherSessionFlags {
  const oneOff = input.monitoringMode === 'SINGLE_ITEM';
  if (!input.sessionReady) {
    return {
      sessionStatus: 'login_required',
      authenticationRequired: true,
      paused: !oneOff,
      healthStatus: 'login_required',
    };
  }
  return {
    sessionStatus: 'ready',
    authenticationRequired: false,
    paused: false,
    healthStatus: 'pending',
  };
}

function isInstagramAccountWatcherSql() {
  return and(
    eq(sourceWatchers.platform, 'instagram'),
    or(
      eq(sourceWatchers.adapterType, 'social_account'),
      eq(sourceWatchers.watcherKind, 'curator'),
    ),
    sql`${sourceWatchers.monitoringMode} IS DISTINCT FROM 'SINGLE_ITEM'`,
  );
}

/**
 * Reconcile Instagram Watchlist sources with the shared platform session.
 * Does not store credentials per account. Does not invent session health.
 */
export async function syncInstagramWatchersWithSharedSession(
  sessionReady?: boolean,
): Promise<{ sessionReady: boolean; updated: number }> {
  const { db } = await import('../db.js');
  const ready = sessionReady ?? (await sharedInstagramSessionReady());
  const now = new Date();

  if (ready) {
    const updated = await db
      .update(sourceWatchers)
      .set({
        sessionStatus: 'ready',
        authenticationRequired: false,
        paused: sql`CASE WHEN ${sourceWatchers.sessionStatus} = 'login_required' THEN false ELSE ${sourceWatchers.paused} END`,
        healthStatus: sql`CASE WHEN ${sourceWatchers.healthStatus} = 'login_required' THEN 'pending' ELSE ${sourceWatchers.healthStatus} END`,
        updatedAt: now,
      })
      .where(
        and(
          isInstagramAccountWatcherSql(),
          or(
            eq(sourceWatchers.sessionStatus, 'login_required'),
            eq(sourceWatchers.authenticationRequired, true),
          ),
        ),
      )
      .returning({ id: sourceWatchers.id });
    return { sessionReady: true, updated: updated.length };
  }

  const updated = await db
    .update(sourceWatchers)
    .set({
      sessionStatus: 'login_required',
      authenticationRequired: true,
      paused: true,
      healthStatus: 'login_required',
      updatedAt: now,
    })
    .where(
      and(
        isInstagramAccountWatcherSql(),
        or(
          sql`${sourceWatchers.sessionStatus} IS DISTINCT FROM 'login_required'`,
          eq(sourceWatchers.authenticationRequired, false),
          eq(sourceWatchers.paused, false),
        ),
      ),
    )
    .returning({ id: sourceWatchers.id });
  return { sessionReady: false, updated: updated.length };
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

export function isInstagramConsentPage(url: string, bodyText: string): boolean {
  return (
    /\/consent\//i.test(url) ||
    /allow the use of cookies|allow all cookies|decline optional cookies|privacy update/i.test(bodyText)
  );
}

/** Accept Meta/Instagram cookie consent so post navigation can proceed. */
export async function dismissInstagramConsentIfPresent(
  page: import('playwright').Page,
): Promise<boolean> {
  const url = page.url();
  const bodyText = String(
    await page.evaluate(`(() => document.body?.innerText?.slice(0, 4000) ?? '')()`),
  );
  if (!isInstagramConsentPage(url, bodyText)) return true;

  await page.waitForTimeout(1200);

  const allow = page.locator('text=Allow all cookies').first();
  const decline = page.locator('text=Decline optional cookies').first();
  const target =
    (await allow.isVisible({ timeout: 8000 }).catch(() => false))
      ? allow
      : (await decline.isVisible({ timeout: 3000 }).catch(() => false))
        ? decline
        : null;

  if (!target) {
    const clicked = await page.evaluate(() => {
      const labels = ['Allow all cookies', 'Decline optional cookies'];
      const nodes = [...document.querySelectorAll('button, [role="button"], div, span, a')];
      for (const label of labels) {
        const node = nodes.find((el) => (el.textContent ?? '').trim() === label);
        if (node instanceof HTMLElement) {
          node.click();
          return label;
        }
      }
      return null;
    });
    if (!clicked) return false;
  } else {
    await target.click({ timeout: 8000 }).catch(() => undefined);
  }

  await page.waitForTimeout(2000);
  await page
    .waitForURL((u) => !/\/consent\//i.test(u.toString()), { timeout: 15000 })
    .catch(() => undefined);

  const afterUrl = page.url();
  const afterBody = String(
    await page.evaluate(`(() => document.body?.innerText?.slice(0, 2000) ?? '')()`),
  );
  return !isInstagramConsentPage(afterUrl, afterBody);
}

export async function detectInstagramAuthWall(page: import('playwright').Page): Promise<InstagramSessionStatus> {
  const url = page.url();
  const bodyText = String(
    await page.evaluate(`(() => document.body?.innerText?.slice(0, 4000) ?? '')()`),
  );
  if (isInstagramConsentPage(url, bodyText)) {
    const dismissed = await dismissInstagramConsentIfPresent(page);
    if (!dismissed && isInstagramConsentPage(page.url(), bodyText)) {
      return 'consent_required';
    }
  }
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
