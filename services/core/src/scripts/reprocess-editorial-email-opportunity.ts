#!/usr/bin/env tsx
/**
 * Reprocess a monitored discovery email for editorial opportunity discovery.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/reprocess-editorial-email-opportunity.ts --gmail 1a07db8316ee1368
 *   pnpm exec tsx src/scripts/reprocess-editorial-email-opportunity.ts --gmail 1a07db8316ee1368 --dry-run
 */
import { reprocessEditorialDiscoveryEmail } from '../newsletter-intelligence/editorial-opportunity/reprocess.js';

async function main() {
  const args = process.argv.slice(2);
  const gmailIdx = args.indexOf('--gmail');
  const idIdx = args.indexOf('--id');
  const dryRun = args.includes('--dry-run');
  const noTelegram = args.includes('--no-telegram');
  const gmailMessageId = gmailIdx >= 0 ? args[gmailIdx + 1] : undefined;
  const discoveryEmailMessageId = idIdx >= 0 ? args[idIdx + 1] : undefined;

  if (!gmailMessageId && !discoveryEmailMessageId) {
    console.error('Provide --gmail <gmailMessageId> or --id <discoveryEmailMessageId>');
    process.exit(1);
  }

  const result = await reprocessEditorialDiscoveryEmail({
    gmailMessageId,
    discoveryEmailMessageId,
    dryRun,
    notifyTelegram: !noTelegram && !dryRun,
    fetchArticle: true,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        runId: result.runId,
        discoveryRowId: result.discoveryRowId,
        gmailMessageId: result.gmailMessageId,
        opportunitiesCreated: result.opportunitiesCreated,
        opportunitiesMerged: result.opportunitiesMerged,
        contentItemIds: result.contentItemIds,
        articleAccess: result.articleAccess,
        telegramNotifiedIds: result.telegramNotifiedIds,
        businesses: result.candidates.map((c) => ({
          businessName: c.businessName,
          developmentType: c.developmentType,
          location: c.location,
          opened: c.openingOrAnnouncementDate,
          urgency: c.urgency,
          calendarEligible: c.calendarEligible,
          autoOutreach: c.autoOutreach,
        })),
        rejected: result.rejected,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
