import { eq, ilike } from 'drizzle-orm';
import { db } from '../db.js';
import { gmailDigestMessages, outreachInboundMessages, sponsorContacts } from '../schema.js';
import {
  createSponsorOpportunity,
  listSponsorOpportunities,
  updateSponsorOpportunity,
  type SponsorOpportunityRecord,
} from '../sponsor-pipeline/index.js';
import {
  createSponsorContact,
  updateSponsorContact,
  type SponsorContactRecord,
} from '../sponsor-outreach/contacts.js';
import { decideSponsorInboxPersist, sponsorInboundAttachmentKeys } from '../sponsor-outreach/entity-identity.js';
import { headerValue, parseFromHeader } from './client.js';
import { classifyInboundEmail, type EmailCategory } from './email-category.js';
import { fetchDiscoveryMessage } from './message-parse.js';
import {
  resolveInboundActionability,
  senderDomainFromEmail,
} from './inbound-actionability.js';

const PIPELINE_INBOUND_CATEGORIES = new Set<EmailCategory>([
  'sponsor',
  'collaboration',
  'booking',
]);

export type SponsorInboxPipelineResult = {
  ok: boolean;
  reason?: string;
  alreadyPromoted?: boolean;
  contactId?: string;
  opportunityId?: string;
  createdContact?: boolean;
  createdOpportunity?: boolean;
  inboundMessageId?: string;
  unmatched?: boolean;
};

function rowToContact(row: typeof sponsorContacts.$inferSelect): SponsorContactRecord {
  return {
    id: row.id,
    businessName: row.businessName,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone,
    website: row.website,
    instagram: row.instagram,
    tiktok: row.tiktok,
    category: row.category,
    notes: row.notes,
    sponsorFitScore: row.sponsorFitScore != null ? Number(row.sponsorFitScore) : null,
    sourceOpportunityId: row.sourceOpportunityId,
    status: row.status,
    contactVerificationStatus: row.contactVerificationStatus,
    mergedIntoId: row.mergedIntoId,
    canonicalBusinessId: row.canonicalBusinessId,
    lastContactedAt: row.lastContactedAt?.toISOString() ?? null,
    nextFollowUpAt: row.nextFollowUpAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function findContactForInbound(input: {
  fromEmail: string | null;
  gmailThreadId?: string | null;
  gmailMessageId?: string | null;
  subject?: string | null;
}): Promise<SponsorContactRecord | null> {
  const keys = sponsorInboundAttachmentKeys(input);
  if (!keys.fromEmail) return null;
  const byEmail = await db
    .select()
    .from(sponsorContacts)
    .where(ilike(sponsorContacts.email, keys.fromEmail))
    .limit(1);
  if (byEmail[0]) return rowToContact(byEmail[0]);
  return null;
}

function pipelineStatusForInbound(category: EmailCategory): 'interested' | 'contacted' {
  return category === 'sponsor' || category === 'collaboration' ? 'interested' : 'contacted';
}

function noteLine(subject: string, fromEmail: string | null, receivedAt: Date | null): string {
  const when = receivedAt?.toISOString().slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  return `${when}: Inbound sponsors@ email — "${subject}"${fromEmail ? ` from ${fromEmail}` : ''}`;
}

function openRank(status: string): number {
  const order = ['lead', 'contacted', 'interested', 'meeting_scheduled', 'proposal_sent', 'negotiating'];
  const idx = order.indexOf(status);
  return idx >= 0 ? idx : -1;
}

function appendNote(existing: string | null, line: string, gmailMessageId: string): string {
  if (existing?.includes(gmailMessageId) || existing?.includes(line)) return existing ?? line;
  return [existing, line, `gmailMessageId=${gmailMessageId}`].filter(Boolean).join('\n');
}

async function findOpportunityByGmailMessage(
  gmailMessageId: string,
): Promise<SponsorOpportunityRecord | null> {
  const all = await listSponsorOpportunities();
  return all.find((o) => o.notes?.includes(`gmailMessageId=${gmailMessageId}`)) ?? null;
}

/**
 * Turn high-urgency inbound alias mail (sponsors@ / collabs@ / booking@) into a
 * CRM contact + open pipeline deal. Idempotent per Gmail message id.
 */
export async function promoteSponsorInboxToPipeline(
  gmailMessageId: string,
): Promise<SponsorInboxPipelineResult> {
  const existingOpp = await findOpportunityByGmailMessage(gmailMessageId);
  if (existingOpp) {
    return {
      ok: true,
      alreadyPromoted: true,
      opportunityId: existingOpp.id,
      contactId: existingOpp.sponsorContactId,
    };
  }

  const existingInbound = await db.query.outreachInboundMessages.findFirst({
    where: eq(outreachInboundMessages.gmailMessageId, gmailMessageId),
  });

  const message = await fetchDiscoveryMessage(gmailMessageId);
  if (!message) return { ok: false, reason: 'message_not_found' };

  const subject = headerValue(message.headers, 'Subject') ?? message.snippet ?? 'Sponsor inquiry';
  const parsedFrom = parseFromHeader(headerValue(message.headers, 'From') ?? '');
  const classified = classifyInboundEmail({
    headers: message.headers,
    subject,
    bodyText: message.bodyText,
    fromEmail: parsedFrom.email,
  });

  if (!PIPELINE_INBOUND_CATEGORIES.has(classified.emailCategory)) {
    return { ok: false, reason: 'not_pipeline_category' };
  }

  let createdContact = false;
  const persist = decideSponsorInboxPersist({
    subject,
    bodyText: message.bodyText,
    fromEmail: parsedFrom.email,
    fromName: parsedFrom.name,
  });
  let contact = await findContactForInbound({
    fromEmail: parsedFrom.email,
    gmailThreadId: message.threadId,
    gmailMessageId: message.id,
    subject,
  });

  if (contact) {
    const note = noteLine(subject, parsedFrom.email, message.internalDate);
    const mergedNotes = contact.notes?.includes(note)
      ? contact.notes
      : [contact.notes, note].filter(Boolean).join('\n');
    const patch: Parameters<typeof updateSponsorContact>[1] = {
      email: contact.email ?? parsedFrom.email,
      contactName: contact.contactName ?? parsedFrom.name,
      notes: mergedNotes,
    };
    if (persist.createOpportunity) {
      patch.status =
        contact.status === 'converted' || contact.status === 'not_interested'
          ? contact.status
          : 'replied';
      patch.nextFollowUpAt = null;
    }
    await updateSponsorContact(contact.id, patch);
    const refreshed = await db
      .select()
      .from(sponsorContacts)
      .where(eq(sponsorContacts.id, contact.id))
      .limit(1);
    contact = rowToContact(refreshed[0]!);
  } else if (persist.createContact && persist.identity.ok) {
    contact = await createSponsorContact({
      businessName: persist.identity.businessName,
      contactName: parsedFrom.name,
      email: parsedFrom.email,
      notes: noteLine(subject, parsedFrom.email, message.internalDate),
      status: 'lead',
      category: classified.emailCategory === 'booking' ? 'booking' : 'sponsor',
      senderEmail: parsedFrom.email,
      senderName: parsedFrom.name,
      subject,
    });
    createdContact = true;
  }

  let opportunity: SponsorOpportunityRecord | null = null;
  let createdOpportunity = false;

  if (contact && persist.createOpportunity) {
    const open = await listSponsorOpportunities({ sponsorContactId: contact.id, openOnly: true });
    const desiredStatus = pipelineStatusForInbound(classified.emailCategory);
    const title = `${contact.businessName} inbound`;
    const existingSame = open.find(
      (o) => o.title === title || o.notes?.includes(`gmailMessageId=${gmailMessageId}`),
    );

    if (existingSame) {
      opportunity =
        (await updateSponsorOpportunity(existingSame.id, {
          status:
            openRank(desiredStatus) > openRank(existingSame.status)
              ? desiredStatus
              : existingSame.status,
          notes: appendNote(
            existingSame.notes,
            noteLine(subject, parsedFrom.email, message.internalDate),
            gmailMessageId,
          ),
        })) ?? existingSame;
    } else if (open.length === 1 && open[0]) {
      opportunity =
        (await updateSponsorOpportunity(open[0].id, {
          status:
            openRank(desiredStatus) > openRank(open[0].status) ? desiredStatus : open[0].status,
          notes: appendNote(
            open[0].notes,
            noteLine(subject, parsedFrom.email, message.internalDate),
            gmailMessageId,
          ),
        })) ?? open[0];
    } else {
      opportunity = await createSponsorOpportunity({
        sponsorContactId: contact.id,
        title,
        status: desiredStatus,
        leadSource: 'sponsors_inbox',
        notes: `${noteLine(subject, parsedFrom.email, message.internalDate)}\ngmailMessageId=${gmailMessageId}`,
      });
      createdOpportunity = true;
    }
  }

  const actionability = resolveInboundActionability({
    subject,
    bodyText: message.bodyText,
    senderDomain: senderDomainFromEmail(parsedFrom.email),
    matchKind: contact ? 'sponsors_inbox_pipeline' : 'unmatched_identity',
    outreachEmailId: null,
    verifiedOutreachThread: false,
  });

  let inboundMessageId = existingInbound?.id;
  if (!existingInbound) {
    const [inserted] = await db
      .insert(outreachInboundMessages)
      .values({
        gmailMessageId: message.id,
        gmailThreadId: message.threadId,
        outreachEmailId: null,
        fromEmail: parsedFrom.email,
        fromName: parsedFrom.name,
        subject,
        snippet: message.bodyText.slice(0, 240) || message.snippet,
        receivedAt: message.internalDate,
        matchKind: contact ? 'sponsors_inbox_pipeline' : 'unmatched_identity',
        channelId: classified.channelId ?? 'sponsors',
        emailCategory: classified.emailCategory,
        originalRecipient: classified.originalRecipient,
        matchedHeader: classified.matchedHeader,
        emailIntent: actionability.emailIntent,
        actionability: actionability.actionability,
        isRead: false,
        notifiedAt: new Date(),
      })
      .returning({ id: outreachInboundMessages.id });
    inboundMessageId = inserted!.id;
  } else if (
    existingInbound.emailIntent !== actionability.emailIntent ||
    existingInbound.actionability !== actionability.actionability
  ) {
    await db
      .update(outreachInboundMessages)
      .set({
        emailIntent: actionability.emailIntent,
        actionability: actionability.actionability,
      })
      .where(eq(outreachInboundMessages.id, existingInbound.id));
  }

  await db
    .update(gmailDigestMessages)
    .set({
      actionStatus: contact ? 'promoted_sponsor' : 'skipped_identity',
      promotedAt: new Date(),
      emailCategory: classified.emailCategory,
      channelId: classified.channelId ?? 'sponsors',
    })
    .where(eq(gmailDigestMessages.gmailMessageId, gmailMessageId));

  return {
    ok: true,
    reason: persist.skipReason,
    contactId: contact?.id,
    opportunityId: opportunity?.id,
    createdContact,
    createdOpportunity,
    inboundMessageId,
    unmatched: !contact,
  };
}

/** Auto-run after digest for sponsor/collab/booking categories. */
export async function tryAutoPipelineSponsorInbox(
  gmailMessageId: string,
  emailCategory: string | null | undefined,
): Promise<SponsorInboxPipelineResult | null> {
  if (!emailCategory || !PIPELINE_INBOUND_CATEGORIES.has(emailCategory as EmailCategory)) {
    return null;
  }
  return promoteSponsorInboxToPipeline(gmailMessageId);
}
