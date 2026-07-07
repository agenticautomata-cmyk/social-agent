import { eq, like, or } from 'drizzle-orm';
import { db } from '../db.js';
import { outreachEmails, outreachSendAttempts, sponsorContacts } from '../schema.js';

/** Remove test sponsor contacts and related outreach rows. */
export async function cleanupTestOutreachData(): Promise<{
  contactsRemoved: number;
  emailsRemoved: number;
}> {
  const testContacts = await db
    .select({ id: sponsorContacts.id })
    .from(sponsorContacts)
    .where(
      or(
        like(sponsorContacts.businessName, '%Test Send%'),
        like(sponsorContacts.businessName, '%Kellie Test%'),
        eq(sponsorContacts.email, 'kjoneskc@me.com'),
      ),
    );

  let emailsRemoved = 0;
  for (const contact of testContacts) {
    const emails = await db
      .select({ id: outreachEmails.id })
      .from(outreachEmails)
      .where(eq(outreachEmails.sponsorContactId, contact.id));
    for (const email of emails) {
      await db.delete(outreachSendAttempts).where(eq(outreachSendAttempts.outreachEmailId, email.id));
      await db.delete(outreachEmails).where(eq(outreachEmails.id, email.id));
      emailsRemoved += 1;
    }
    await db.delete(sponsorContacts).where(eq(sponsorContacts.id, contact.id));
  }

  return { contactsRemoved: testContacts.length, emailsRemoved };
}

async function main() {
  const result = await cleanupTestOutreachData();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
