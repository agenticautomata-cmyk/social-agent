import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../db.js';
import { creatorAccounts } from '../schema.js';
import { refreshPostingTimeAnalytics } from '../creator-analytics/posting-times.js';

async function main() {
  const [account] = await db
    .select({ id: creatorAccounts.id, username: creatorAccounts.username })
    .from(creatorAccounts)
    .where(eq(creatorAccounts.platform, 'tiktok'))
    .limit(1);

  if (!account) {
    console.log('No TikTok creator account found.');
    return;
  }

  const analytics = await refreshPostingTimeAnalytics({
    creatorId: account.id,
    platform: 'tiktok',
  });

  if (!analytics) {
    console.log('No videos to analyze.');
    return;
  }

  console.log(`Refreshed posting analytics for @${account.username}`);
  console.log(`Sample size: ${analytics.sampleSize}, timezone: ${analytics.timezone}`);
  console.log('Recommended slots:');
  for (const slot of analytics.recommendedSlots) {
    console.log(
      `  ${slot.label} — ${slot.videoCount} videos, ${slot.avgViews} avg views, ${slot.performanceIndex}× median`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
