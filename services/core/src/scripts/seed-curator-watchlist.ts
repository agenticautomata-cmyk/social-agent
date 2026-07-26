#!/usr/bin/env tsx
/**
 * Seed @jasfoodjourney curator watchlist and process Black Spaces carousel.
 * Usage:
 *   pnpm seed:curator-watchlist [--post-url URL] [--fixture] [--skip-research]
 */
import { ensureCuratorWatcher, runCuratorWatchlistPipeline, processCuratorPost } from '../curator-watchlist/pipeline.js';
import { listCuratorLeads } from '../curator-watchlist/store.js';
import { buildBlackSpacesFixturePost, BLACK_SPACES_FIXTURE_SLIDES } from '../curator-watchlist/fixture-seed.js';

const PROFILE_URL = 'https://www.instagram.com/jasfoodjourney/';
const DEFAULT_POST_HINT = 'Kansas City Events in Black Spaces';

async function main() {
  const postUrlArg = process.argv.find((a) => a.startsWith('--post-url='))?.split('=')[1];
  const useFixture = process.argv.includes('--fixture');
  const skipResearch = process.argv.includes('--skip-research');

  console.log('Ensuring curator watcher for', PROFILE_URL);
  const watcherId = await ensureCuratorWatcher(PROFILE_URL);
  console.log('Watcher ID:', watcherId);

  let result;
  if (useFixture) {
    console.log(`Running fixture seed for "${DEFAULT_POST_HINT}" (${BLACK_SPACES_FIXTURE_SLIDES.length} slides)...`);
    const post = buildBlackSpacesFixturePost();
    const stats = await processCuratorPost({
      watcherId,
      post,
      skipResearch,
      fixtureOcrTexts: BLACK_SPACES_FIXTURE_SLIDES,
    });
    result = {
      ok: true,
      postsProcessed: 1,
      slidesProcessed: stats.slidesProcessed,
      eventsExtracted: stats.eventsExtracted,
      eventsVerified: stats.verified,
      eventsPartiallyVerified: stats.partiallyVerified,
      eventsConflicted: stats.conflicted,
      eventsExpired: stats.expired,
      duplicatesSkipped: stats.duplicates,
      newPosts: 1,
    };
  } else {
    result = await runCuratorWatchlistPipeline({
      watcherId,
      specificPostUrl: postUrlArg,
      force: Boolean(postUrlArg),
    });
  }

  console.log('\n=== Curator pipeline result ===');
  console.log(JSON.stringify(result, null, 2));

  const leads = await listCuratorLeads({ watcherId, limit: 200 });
  const verified = leads.filter((l) => l.verificationStatus === 'VERIFIED').length;
  const partial = leads.filter((l) => l.verificationStatus === 'PARTIALLY_VERIFIED').length;
  const conflicted = leads.filter((l) => l.verificationStatus === 'CONFLICTED').length;
  const social = leads.filter((l) => l.verificationStatus === 'SOCIAL_LEAD').length;

  console.log('\n=== Lead totals ===');
  console.log({
    slidesProcessed: result.slidesProcessed,
    eventsExtracted: result.eventsExtracted,
    verified,
    partiallyVerified: partial,
    conflicted,
    socialLead: social,
    expired: result.eventsExpired,
    duplicates: result.duplicatesSkipped,
    calendarEligible: leads.filter((l) => l.eventDate && !l.dismissedAt).length,
    sample: leads.slice(0, 8).map((l) => ({
      name: l.eventName,
      date: l.eventDate,
      status: l.verificationStatus,
      rec: l.creatorRecommendation,
      attribution: `Discovered via @${l.discoveredViaHandle}`,
    })),
  });

  if (result.pausedForAuth) {
    console.warn('\n⚠ Instagram authentication required — set SCOUT_INSTAGRAM_PROFILE_DIR with storage-state.json');
    process.exitCode = 2;
  }

  if (!postUrlArg && !useFixture) {
    console.log(`\nTip: --fixture for Black Spaces acceptance seed, or --post-url=<url> for live post`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
