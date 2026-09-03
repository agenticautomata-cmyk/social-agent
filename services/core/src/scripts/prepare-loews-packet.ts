/**
 * Queues a Loews form-only packet for Kellie review.
 * Does NOT submit the Loews form and does NOT send email.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { outreachEmails, sponsorContacts } from '../schema.js';
import {
  LOEWS_INFLUENCER_FORM_URL,
  buildLoewsFormPacket,
  formatLoewsPacketAsDraftBody,
} from '../hospitality-pitch/loews-form-packet.js';
import { persistVersionedMediaKit } from '../media-kit/versions.js';
import { evaluateSendReadiness, pitchReadinessStatusFor } from '../partnership-contracts/send-readiness.js';
import { assessCompensation } from '../partnership-contracts/compensation.js';
import { resolvePitchAudienceEvidence } from '../hospitality-pitch/creator-evidence.js';

const kit = await persistVersionedMediaKit({ variant: 'hotel', notes: 'Loews form packet' });
if (!kit.ok) {
  console.error('Hotel kit missing:', kit.missing);
  process.exit(1);
}

const packet = await buildLoewsFormPacket();
const audience = await resolvePitchAudienceEvidence();

const existingContact = await db
  .select({ id: sponsorContacts.id })
  .from(sponsorContacts)
  .where(
    and(
      sql`lower(${sponsorContacts.businessName}) = lower('Loews Kansas City Hotel')`,
      eq(sponsorContacts.contactFormUrl, LOEWS_INFLUENCER_FORM_URL),
    ),
  )
  .limit(1);

let contactId: string;
if (existingContact[0]) {
  contactId = existingContact[0].id;
} else {
  const inserted = await db
    .insert(sponsorContacts)
    .values({
      businessName: 'Loews Kansas City Hotel',
      email: null,
      contactEvidenceState: 'official_contact_form',
      contactRole: 'influencer stay request form',
      representsBusiness: 'Loews Kansas City Hotel',
      contactFormUrl: LOEWS_INFLUENCER_FORM_URL,
      evidenceUrl: LOEWS_INFLUENCER_FORM_URL,
      evidenceCapturedAt: new Date(),
      evidenceIsOfficial: true,
      verificationMethod: 'published_on_official_site',
      nextContactPath: 'official_contact_form',
      nextContactPathDetail:
        'Human submits the Loews influencer stay request form. Benson does not submit.',
      status: 'ready_to_contact',
      quarantineState: 'active',
    })
    .returning({ id: sponsorContacts.id });
  contactId = inserted[0]!.id;
}

const readiness = evaluateSendReadiness({
  contact: {
    state: 'official_contact_form',
    email: null,
    evidenceUrl: LOEWS_INFLUENCER_FORM_URL,
    evidenceCapturedAt: new Date().toISOString(),
    lastRecheckedAt: new Date().toISOString(),
    representsBusiness: 'Loews Kansas City Hotel',
    sourceIsOfficial: true,
    personName: null,
    contactFormUrl: LOEWS_INFLUENCER_FORM_URL,
    phone: null,
    officialSocialUrl: null,
    verificationMethod: 'published_on_official_site',
    conflictNote: null,
    staleNote: null,
    personRole: 'influencer stay request form',
  },
  businessName: 'Loews Kansas City Hotel',
  contactBusinessMismatchReason: null,
  compensationState: assessCompensation({
    offered: [],
    requested: [
      { kind: 'complimentary_room', amountUsd: null, detail: 'Complimentary overnight stay' },
      { kind: 'hosted_meal', amountUsd: null, detail: 'Dining credit' },
    ],
    businessName: 'Loews Kansas City Hotel',
  }).state,
  analytics: {
    followersAvailable: audience.followersAvailable,
    followersCount: audience.followersCount,
    lastSyncedAt: audience.lastSyncedAt,
    stale: audience.stale,
  },
  mediaKit: {
    id: kit.result.kitId,
    name: 'Kellie — media kit (hotel)',
    fileSizeBytes: null,
    isTestArtifact: false,
    isGenerated: true,
    webUrl: kit.result.webUrl,
  },
  approval: {
    approvedAt: null,
    approvedBy: null,
    approvedContentHash: null,
    approvedRecipient: null,
  },
});

const subject = 'Loews Kansas City — influencer stay request (form only)';
const body = formatLoewsPacketAsDraftBody(packet);

const existingDraft = await db
  .select({ id: outreachEmails.id })
  .from(outreachEmails)
  .where(
    and(
      eq(outreachEmails.sponsorContactId, contactId),
      eq(outreachEmails.status, 'needs_approval'),
      eq(outreachEmails.quarantineState, 'active'),
      sql`${outreachEmails.subject} ILIKE '%Loews%'`,
    ),
  )
  .limit(1);

if (existingDraft[0]) {
  await db
    .update(outreachEmails)
    .set({
      subject,
      body,
      mediaKitId: kit.result.kitId,
      pitchReadinessStatus: pitchReadinessStatusFor(readiness),
      compensationState: readiness.compensationState,
      bensonDraftContext: {
        formOnly: true,
        bensonMustNotSubmit: true,
        rightsWarning: packet.rightsWarning,
        mediaKitVersionId: kit.result.versionId,
        mediaKitContentHash: kit.result.contentHash,
      },
      updatedAt: new Date(),
    })
    .where(eq(outreachEmails.id, existingDraft[0].id));
  console.log(JSON.stringify({ ok: true, updated: existingDraft[0].id, readiness: readiness.state }, null, 2));
} else {
  const inserted = await db
    .insert(outreachEmails)
    .values({
      sponsorContactId: contactId,
      mediaKitId: kit.result.kitId,
      subject,
      body,
      status: 'needs_approval',
      draftedBy: 'benson',
      pitchReadinessStatus: pitchReadinessStatusFor(readiness),
      compensationState: readiness.compensationState,
      quarantineState: 'active',
      bensonDraftContext: {
        formOnly: true,
        bensonMustNotSubmit: true,
        rightsWarning: packet.rightsWarning,
        mediaKitVersionId: kit.result.versionId,
        mediaKitContentHash: kit.result.contentHash,
      },
    })
    .returning({ id: outreachEmails.id });
  console.log(JSON.stringify({ ok: true, created: inserted[0]!.id, readiness: readiness.state }, null, 2));
}

process.exit(0);
