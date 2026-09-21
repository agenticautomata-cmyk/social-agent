/**
 * Acceptance: ingest BIG LIST fixture twice, then apply three follow-up updates.
 * Memory-conscious — sequential, no Playwright.
 */
import { db } from '../db.js';
import { openingBusinesses, openingLocations } from '../schema.js';
import {
  BIG_LIST_CANONICAL_URL,
  BIG_LIST_FIXTURE_TEXT,
  BIG_LIST_SUBJECT,
  ingestOpeningRoundup,
  listOpenings,
} from '../openings-radar/index.js';

async function main() {
  const gmailId = `accept-big-list-2026-09-21`;

  console.log('=== FIRST RUN ===');
  const first = await ingestOpeningRoundup({
    subject: BIG_LIST_SUBJECT,
    bodyText: BIG_LIST_FIXTURE_TEXT,
    urls: [BIG_LIST_CANONICAL_URL],
    gmailMessageId: gmailId,
    senderEmail: 'kcinsiders@substack.com',
    senderName: 'Joyce Smith',
    dryRun: false,
    fetchArticle: false,
    force: true,
    channel: 'fixture',
  });
  console.log(
    JSON.stringify(
      {
        entriesParsed: first.entriesParsed,
        created: first.locationsCreated,
        updated: first.locationsUpdated,
        merged: first.locationsMerged,
        opportunities: first.opportunitiesCreated,
        events: first.eventsCreated,
        decisions: first.decisions.map((d) => ({
          id: d.locationId,
          name: d.businessName,
          created: d.created,
          status: d.status,
          opp: d.opportunityDecision,
          event: d.eventDecision,
          oppId: d.opportunityContentItemId,
          calId: d.calendarItemId,
        })),
      },
      null,
      2,
    ),
  );

  console.log('=== SECOND RUN (expect zero new businesses/locations/opps/events) ===');
  const second = await ingestOpeningRoundup({
    subject: BIG_LIST_SUBJECT,
    bodyText: BIG_LIST_FIXTURE_TEXT,
    urls: [BIG_LIST_CANONICAL_URL],
    gmailMessageId: `${gmailId}-repeat`,
    senderEmail: 'kcinsiders@substack.com',
    senderName: 'Joyce Smith',
    dryRun: false,
    fetchArticle: false,
    force: true,
    channel: 'fixture',
  });
  console.log(
    JSON.stringify(
      {
        created: second.locationsCreated,
        updated: second.locationsUpdated,
        merged: second.locationsMerged,
        opportunities: second.opportunitiesCreated,
        events: second.eventsCreated,
      },
      null,
      2,
    ),
  );

  console.log('=== FOLLOW-UP UPDATES (≥3 modify existing) ===');
  const updates = [
    {
      name: 'Alice Scooper',
      text: `1. Alice Scooper's Ice Cream Co.\n   - 906 W. 39th St.\n   - soft opening confirmed — soft open now`,
    },
    {
      name: 'Angry Chickz',
      text: `2. Angry Chickz\n   - 14995 W. 119th St., Olathe\n   - delayed — now planned for early December 2026\n   - other area locations pending`,
    },
    {
      name: 'Donutology',
      text: `9. Donutology\n   - Crown Center\n   - 2450 Grand Blvd., Suite 121\n   - grand opening confirmed October 15, 2026\n   - relocation from its original Westport location`,
    },
  ];

  const updateResults = [];
  for (const u of updates) {
    const r = await ingestOpeningRoundup({
      subject: `${BIG_LIST_SUBJECT} — update`,
      bodyText: `Who's Opening updates\n\n${u.text}`,
      urls: [BIG_LIST_CANONICAL_URL],
      gmailMessageId: `${gmailId}-update-${u.name.replace(/\s+/g, '-').toLowerCase()}`,
      senderEmail: 'kcinsiders@substack.com',
      senderName: 'Joyce Smith',
      dryRun: false,
      fetchArticle: false,
      force: true,
      channel: 'fixture',
    });
    updateResults.push({
      target: u.name,
      created: r.locationsCreated,
      updated: r.locationsUpdated,
      merged: r.locationsMerged,
      decisions: r.decisions.map((d) => ({
        id: d.locationId,
        name: d.businessName,
        created: d.created,
        updated: d.updated,
        status: d.status,
      })),
    });
  }
  console.log(JSON.stringify(updateResults, null, 2));

  const listed = await listOpenings({ limit: 50 });
  const bizCount = await db.select().from(openingBusinesses);
  const locCount = await db.select().from(openingLocations);

  console.log('=== FINAL COUNTS ===');
  console.log(
    JSON.stringify(
      {
        businesses: bizCount.length,
        locations: locCount.length,
        listed: listed.total,
        cards: listed.items.map((c) => ({
          id: c.id,
          businessId: c.businessId,
          name: c.businessName,
          address: c.address,
          status: c.status,
          expected: c.expectedOpening,
          exact: c.exactOpeningDate,
          grand: c.grandOpeningDate,
          oppDecision: c.opportunityDecision,
          eventDecision: c.eventDecision,
          oppId: c.opportunityContentItemId,
          calId: c.calendarItemId,
        })),
      },
      null,
      2,
    ),
  );

  const hasVeronicaOpening = bizCount.some((b) => /veronica/i.test(b.canonicalName));
  console.log('veronica_in_openings_radar', hasVeronicaOpening);

  process.exit(first.locationsCreated >= 10 && second.locationsCreated === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
