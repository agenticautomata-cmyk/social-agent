import {
  BIG_LIST_CANONICAL_URL,
  BIG_LIST_SUBJECT,
  ingestOpeningRoundup,
  listOpenings,
} from '../openings-radar/index.js';

async function main() {
  const updates = [
    {
      name: 'Alice',
      text: `1. Alice Scooper's Ice Cream Co.\n   - 906 W. 39th St.\n   - soft opening confirmed — soft open now`,
    },
    {
      name: 'Donutology',
      text: `9. Donutology\n   - Crown Center\n   - 2450 Grand Blvd., Suite 121\n   - grand opening confirmed October 15, 2026\n   - relocation from its original Westport location`,
    },
    {
      name: 'Blurred',
      text: `5. Blurred Bar\n   - Westport\n   - 4149 Pennsylvania Ave.\n   - izakaya-style bar\n   - delayed — Halloween weekend pushed to mid-November 2026\n   - former Le Champion space`,
    },
  ];

  for (const u of updates) {
    const r = await ingestOpeningRoundup({
      subject: `${BIG_LIST_SUBJECT} — update`,
      bodyText: `Who's Opening updates\n\n${u.text}`,
      urls: [BIG_LIST_CANONICAL_URL],
      gmailMessageId: `accept-big-list-2026-09-21-fix2-${u.name.toLowerCase()}`,
      senderEmail: 'kcinsiders@substack.com',
      senderName: 'Joyce Smith',
      fetchArticle: false,
      force: true,
      channel: 'fixture',
    });
    console.log(
      u.name,
      JSON.stringify({
        created: r.locationsCreated,
        updated: r.locationsUpdated,
        merged: r.locationsMerged,
        decisions: r.decisions,
      }),
    );
  }

  const listed = await listOpenings({ limit: 50 });
  const focus = listed.items.filter((i) => /alice|donutology|blurred|angry/i.test(i.businessName));
  console.log(
    JSON.stringify(
      focus.map((c) => ({
        id: c.id,
        name: c.businessName,
        status: c.status,
        expected: c.expectedOpening,
        exact: c.exactOpeningDate,
        grand: c.grandOpeningDate,
      })),
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
