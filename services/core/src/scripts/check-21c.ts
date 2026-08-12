import { db } from '../db.js';
import { sponsorContacts } from '../schema.js';
import { ilike } from 'drizzle-orm';

const rows = await db
  .select({
    id: sponsorContacts.id,
    businessName: sponsorContacts.businessName,
    mergedIntoId: sponsorContacts.mergedIntoId,
    canonicalBusinessId: sponsorContacts.canonicalBusinessId,
    website: sponsorContacts.website,
    createdAt: sponsorContacts.createdAt,
  })
  .from(sponsorContacts)
  .where(ilike(sponsorContacts.businessName, '%21c%'));

console.log(JSON.stringify(rows, null, 2));
process.exit(0);
