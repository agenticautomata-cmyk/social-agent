/**
 * One-off remediation: groups existing sponsor_contacts by canonical business identity
 * (domain first, normalized name fallback) and marks duplicates via mergedIntoId /
 * canonicalBusinessId so Pitches and Action Center show one active card per business.
 *
 * Does not delete anything — every draft/interaction remains in the database and is
 * reachable via the primary contact's outreach history.
 *
 * Run (dry run, default): tsx src/scripts/dedupe-sponsor-contacts.ts
 * Run (apply):            tsx src/scripts/dedupe-sponsor-contacts.ts --apply
 */
import { db } from '../db.js';
import { sponsorContacts } from '../schema.js';
import { eq } from 'drizzle-orm';
import { groupByCanonicalKey, pickPrimaryContact } from '../sponsor-outreach/canonicalize.js';

async function main() {
  const apply = process.argv.includes('--apply');
  const rows = await db.select().from(sponsorContacts);
  console.log(`Loaded ${rows.length} sponsor_contacts rows (mode: ${apply ? 'APPLY' : 'DRY RUN'})`);

  const groups = groupByCanonicalKey(rows);
  let duplicateGroups = 0;
  let rowsMarkedMerged = 0;
  let rowsTaggedCanonical = 0;

  for (const [key, members] of groups) {
    if (members.length < 2) continue;
    duplicateGroups += 1;

    const primary = pickPrimaryContact(
      members.map((m) => ({
        id: m.id,
        businessName: m.businessName,
        website: m.website,
        status: m.status,
        contactVerificationStatus: m.contactVerificationStatus,
        updatedAt: m.updatedAt,
      })),
    );

    console.log(
      `\nGroup "${key}" — ${members.length} rows. Primary: ${primary.id} (${
        members.find((m) => m.id === primary.id)!.businessName
      }, status=${members.find((m) => m.id === primary.id)!.status})`,
    );

    for (const member of members) {
      const isPrimary = member.id === primary.id;
      if (apply) {
        await db
          .update(sponsorContacts)
          .set({
            canonicalBusinessId: primary.id,
            mergedIntoId: isPrimary ? null : primary.id,
            updatedAt: new Date(),
          })
          .where(eq(sponsorContacts.id, member.id));
      }
      rowsTaggedCanonical += 1;
      if (!isPrimary) {
        rowsMarkedMerged += 1;
        console.log(`  duplicate: ${member.id} (${member.businessName}, status=${member.status}) -> merged into ${primary.id}`);
      }
    }
  }

  console.log(`\nDone. duplicate groups=${duplicateGroups} rows tagged=${rowsTaggedCanonical} rows merged=${rowsMarkedMerged}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
