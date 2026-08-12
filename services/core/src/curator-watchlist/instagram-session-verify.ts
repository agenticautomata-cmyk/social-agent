import { readFile, access, stat } from 'node:fs/promises';
import {
  closeInstagramSession,
  detectInstagramAuthWall,
  dismissInstagramConsentIfPresent,
  instagramSessionConfigured,
  instagramSessionSeeded,
  isInstagramConsentPage,
  openInstagramSession,
} from './instagram-session.js';
import type { InstagramSessionVerifyReport } from './instagram-intake-types.js';

function profileDir(): string | null {
  return process.env.SCOUT_INSTAGRAM_PROFILE_DIR?.trim() || null;
}

function storageStatePath(): string | null {
  const dir = profileDir();
  return dir ? `${dir}/storage-state.json` : null;
}

async function readHandleFromInstagramApi(page: import('playwright').Page): Promise<string | null> {
  try {
    const username = await page.evaluate(async () => {
      const res = await fetch('https://www.instagram.com/api/v1/accounts/edit/web_form_data/', {
        credentials: 'include',
        headers: {
          'X-IG-App-ID': '936619743392459',
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { form_data?: { username?: string } };
      return data?.form_data?.username ?? null;
    });
    if (username?.trim()) return username.trim().replace(/^@/, '');
  } catch {
    // fall through
  }
  return null;
}

async function readAuthenticatedHandle(page: import('playwright').Page): Promise<string | null> {
  const fromApi = await readHandleFromInstagramApi(page);
  if (fromApi) return fromApi;

  const expected = process.env.SCOUT_INSTAGRAM_EXPECTED_HANDLE?.trim().replace(/^@/, '');
  if (expected) {
    try {
      await page.goto(`https://www.instagram.com/${expected}/`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      const ownsProfile =
        (await page.locator('a[href="/accounts/edit/"]').count()) > 0 ||
        (await page.getByRole('link', { name: /edit profile/i }).count()) > 0;
      if (ownsProfile) return expected;
    } catch {
      // fall through
    }
  }

  try {
    await page.goto('https://www.instagram.com/accounts/edit/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    const fromEditApi = await readHandleFromInstagramApi(page);
    if (fromEditApi) return fromEditApi;
    const username = await page
      .locator('input[name="username"]')
      .inputValue({ timeout: 8000 })
      .catch(() => null);
    if (username?.trim()) return username.trim().replace(/^@/, '');
  } catch {
    // fall through to lightweight heuristics
  }

  const profileHref = await page
    .locator('nav a[href^="/"][href$="/"], header a[href^="/"][href$="/"]')
    .evaluateAll((links) => {
      for (const link of links) {
        const href = link.getAttribute('href') ?? '';
        const handle = href.replace(/^\/+|\/+$/g, '');
        if (handle && !/^(explore|reels|direct|accounts|p|tv)$/i.test(handle)) return handle;
      }
      return null;
    })
    .catch(() => null);
  if (profileHref) return profileHref.replace(/^@/, '');

  return null;
}

function classifyPage(url: string, bodyText: string): InstagramSessionVerifyReport['pageKind'] {
  if (/challenge|captcha|checkpoint/i.test(url) || /security check|captcha/i.test(bodyText)) {
    return 'challenge';
  }
  if (/accounts\/login|loginform|log in to continue/i.test(`${url} ${bodyText}`)) {
    return 'login';
  }
  if (/consent|allow the use of cookies|privacy update/i.test(bodyText)) {
    return 'consent';
  }
  if (/instagram\.com\/?(\?|$)/i.test(url) || /home|feed|suggested for you/i.test(bodyText)) {
    return 'feed';
  }
  return 'unknown';
}

/** Prove production process can load and use the saved Instagram session. */
export async function verifyInstagramProductionSession(): Promise<InstagramSessionVerifyReport> {
  const path = storageStatePath();
  const dockerUsed = false; // API/workers run on host; compose has no IG mount

  const base: InstagramSessionVerifyReport = {
    hostPath: path ?? '(unset)',
    containerPath: null,
    dockerUsed,
    readable: false,
    mode: null,
    owner: null,
    sizeBytes: null,
    apiProcessLoadedEnv: instagramSessionConfigured(),
    apiEnvPath: profileDir(),
    sessionOpened: false,
    finalUrl: null,
    pageKind: 'unknown',
    authenticatedHandle: null,
    cookieCount: null,
    error: null,
  };

  if (!path || !instagramSessionConfigured()) {
    return { ...base, error: 'SCOUT_INSTAGRAM_PROFILE_DIR unset' };
  }

  if (!(await instagramSessionSeeded())) {
    return { ...base, error: 'storage-state.json missing' };
  }

  try {
    await access(path);
    const info = await stat(path);
    base.readable = true;
    base.mode = (info.mode & 0o777).toString(8);
    base.sizeBytes = info.size;
    base.owner = `${info.uid}:${info.gid}`;

    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as { cookies?: unknown[] };
    base.cookieCount = Array.isArray(parsed.cookies) ? parsed.cookies.length : 0;
  } catch (err) {
    return {
      ...base,
      error: err instanceof Error ? err.message : 'storage_state_read_failed',
    };
  }

  const { ctx, status } = await openInstagramSession();
  if (!ctx) {
    return { ...base, error: `openInstagramSession failed: ${status}` };
  }

  base.sessionOpened = true;

  try {
    await ctx.page.goto('https://www.instagram.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 35000,
    });
    base.finalUrl = ctx.page.url();
    let bodyText = String(
      await ctx.page.evaluate(`(() => document.body?.innerText?.slice(0, 4000) ?? '')()`),
    );
    if (isInstagramConsentPage(base.finalUrl, bodyText)) {
      await dismissInstagramConsentIfPresent(ctx.page);
      base.finalUrl = ctx.page.url();
      bodyText = String(
        await ctx.page.evaluate(`(() => document.body?.innerText?.slice(0, 4000) ?? '')()`),
      );
    }
    const auth = await detectInstagramAuthWall(ctx.page);
    base.pageKind =
      auth === 'captcha_blocked'
        ? 'challenge'
        : auth === 'consent_required'
          ? 'consent'
          : auth === 'login_required'
            ? 'login'
            : classifyPage(base.finalUrl, bodyText);

    if (base.pageKind === 'feed' || auth === 'ready') {
      base.authenticatedHandle = await readAuthenticatedHandle(ctx.page);
    }
  } catch (err) {
    base.error = err instanceof Error ? err.message : 'navigation_failed';
  } finally {
    await closeInstagramSession(ctx);
  }

  return base;
}
