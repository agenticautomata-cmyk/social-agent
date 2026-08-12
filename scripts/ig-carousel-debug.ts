import { openInstagramSession, closeInstagramSession } from '../services/core/src/curator-watchlist/instagram-session.ts';

(async () => {
  const { ctx } = await openInstagramSession();
  if (!ctx) throw new Error('no ctx');
  const url = 'https://www.instagram.com/jasfoodjourney/p/DbLYAWGnLPD/';
  await ctx.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await ctx.page.waitForTimeout(2500);
  for (let i = 0; i < 8; i++) {
    const info = await ctx.page.evaluate(() => {
      const imgs = [...document.querySelectorAll('article img')].map((el) =>
        (el as HTMLImageElement).src?.slice(0, 90),
      );
      const vids = [...document.querySelectorAll('article video')].map((el) => {
        const v = el as HTMLVideoElement;
        return (v.currentSrc || v.src || '').slice(0, 90);
      });
      const next =
        document.querySelector('button[aria-label="Next"]') ||
        document.querySelector('button[aria-label="Go to next"]');
      const dots = document.querySelectorAll('article div[role="tablist"] button').length;
      return { imgCount: imgs.length, vidCount: vids.length, hasNext: !!next, dots, firstImg: imgs[0] ?? null };
    });
    console.log(`slide ${i + 1}`, info);
    const next = ctx.page.locator('button[aria-label="Next"], button[aria-label="Go to next"]').first();
    if (!(await next.isVisible().catch(() => false))) break;
    await next.click().catch(() => undefined);
    await ctx.page.waitForTimeout(1000);
  }

  await ctx.page.goto('https://www.instagram.com/jasfoodjourney/', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await ctx.page.waitForTimeout(2000);
  for (let s = 0; s < 4; s++) {
    await ctx.page.mouse.wheel(0, 1400);
    await ctx.page.waitForTimeout(500);
  }
  const links = await ctx.page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')]
      .map((a) => (a as HTMLAnchorElement).href)
      .slice(0, 20),
  );
  console.log('profile links:', [...new Set(links)]);
  await closeInstagramSession(ctx);
})();
