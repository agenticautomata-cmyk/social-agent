/**
 * The hospitality opportunity pipeline: verified facts in, an approvable pitch out.
 *
 * This is the seam the audit identified as the root cause. `creator-partnership`
 * researched businesses and `sponsor-outreach` wrote pitches, and nothing carried a
 * fact between them, so the writer was fed scraped listing text. Everything below
 * moves in one direction — source facts, qualification, contact evidence,
 * compensation, readiness, draft — and each step records why it decided what it did.
 *
 * Research many, surface few: every business with facts is evaluated, and only the
 * ones that clear qualification and have a real contact reach Kellie's queue.
 */

import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '../db.js';
import {
  mediaKits,
  outreachEmails,
  partnershipOpportunities,
  partnershipSourceFacts,
  partnershipSources,
  sponsorContacts,
} from '../schema.js';
import { businessKeyFor } from '../partnership-contracts/business-key.js';
import {
  assessCompensation,
  type CompensationComponent,
} from '../partnership-contracts/compensation.js';
import {
  contactRepresentsBusiness,
  type ContactEvidenceState,
} from '../partnership-contracts/contact-evidence.js';
import {
  evaluateSendReadiness,
  pitchReadinessStatusFor,
  type SendReadinessVerdict,
} from '../partnership-contracts/send-readiness.js';
import {
  loadMediaKitBySlug,
  mediaKitSlug,
  mediaKitWebUrl,
  variantForBusinessKind,
} from '../media-kit/build.js';
import {
  bestPartnershipContact,
  buildEvidenceItems,
  loadBusinessFacts,
  pickWhyNow,
  recommendedHostedStayRequest,
  type BusinessFacts,
} from './brief-from-facts.js';
import { checkBriefCompleteness, type PitchBrief } from './compose.js';
import { resolvePitchAudienceEvidence } from './creator-evidence.js';
import {
  LOEWS_INFLUENCER_FORM_URL,
  buildLoewsFormPacket,
  formatLoewsPacketAsDraftBody,
} from './loews-form-packet.js';
import {
  qualifyOpportunity,
  type QualificationAnswers,
  type QualificationInput,
  type QualificationResult,
} from './qualification.js';
import { writeHospitalityPitch, type PitchModelCaller } from './write.js';

export type PipelineOutcome = {
  businessName: string;
  businessKey: string;
  qualification: QualificationResult;
  readiness: SendReadinessVerdict | null;
  /** Set when a draft was written and queued for Kellie. */
  draftedEmailId: string | null;
  /** The written pitch when persisting was skipped, so a dry run is still inspectable. */
  draftPreview: { subject: string; body: string } | null;
  /** Set when a pitch could not be written. Always names the missing step. */
  blockedReason: string | null;
  opportunityId: string | null;
};

/**
 * Every business the registry has facts for.
 *
 * Driven off `represents_business` on the facts rather than a hard-coded list, so
 * adding a source adds its business automatically.
 */
export async function businessesWithFacts(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ business: partnershipSourceFacts.representsBusiness })
    .from(partnershipSourceFacts)
    .where(isNull(partnershipSourceFacts.supersededAt));

  return rows
    .map((row) => row.business?.trim())
    .filter((value): value is string => Boolean(value))
    .sort();
}

/** Maps a source's own description of a business onto the qualification's fit values. */
function hospitalityFitFor(kind: string | null): QualificationInput['hospitalityFit'] {
  const value = (kind ?? '').toLowerCase();
  if (/hotel|lodging|resort|\binn\b|stay/.test(value)) return 'hotel';
  if (/restaurant|dining|kitchen/.test(value)) return 'restaurant';
  if (/\bbar\b|brewery|cocktail/.test(value)) return 'bar';
  if (/museum|attraction|venue|theatre|theater/.test(value)) return 'attraction';
  return 'other';
}

/** The hospitality kind of a business, from the source that described it. */
async function businessKind(businessName: string): Promise<string | null> {
  const rows = await db
    .select({ target: partnershipSources.extractionTarget, name: partnershipSources.name })
    .from(partnershipSources)
    .where(sql`lower(${partnershipSources.representsBusiness}) = lower(${businessName})`)
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  // Hotels are the seeded Tier 1 case; the variant chooser handles the rest.
  return `${row.name} ${row.target}`;
}

/**
 * Finds or creates the `sponsor_contacts` row for a contact discovered on an official
 * source, recording the evidence URL that justifies its state.
 *
 * The backlog's contacts had no evidence URL at all, which is why 30 of them were
 * asserting an official state they could not support. Anything written here carries
 * the page it was read from.
 */
async function upsertEvidencedContact(input: {
  businessName: string;
  email: string;
  evidenceState: ContactEvidenceState;
  publishedLabel: string | null;
  sourceUrl: string;
  observedAt: string;
}): Promise<{ id: string }> {
  const existing = await db
    .select({ id: sponsorContacts.id, state: sponsorContacts.contactEvidenceState })
    .from(sponsorContacts)
    .where(
      and(
        sql`lower(${sponsorContacts.email}) = lower(${input.email})`,
        sql`lower(${sponsorContacts.businessName}) = lower(${input.businessName})`,
      ),
    )
    .limit(1);

  const values = {
    businessName: input.businessName,
    email: input.email,
    contactEvidenceState: input.evidenceState,
    contactRole: input.publishedLabel,
    representsBusiness: input.businessName,
    evidenceUrl: input.sourceUrl,
    evidenceCapturedAt: new Date(input.observedAt),
    evidenceIsOfficial: true,
    verificationMethod: 'published_on_official_site',
    lastRecheckedAt: new Date(input.observedAt),
    quarantineState: 'active' as const,
    quarantineReason: null,
    quarantinedAt: null,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db.update(sponsorContacts).set(values).where(eq(sponsorContacts.id, existing[0].id));
    return { id: existing[0].id };
  }

  const inserted = await db
    .insert(sponsorContacts)
    // `ready_to_contact` reflects that a verified route exists; it is not approval.
    .values({ ...values, status: 'ready_to_contact' })
    .returning({ id: sponsorContacts.id });
  return { id: inserted[0]!.id };
}

/** Form-only contact — no email send path; human submits the published form. */
async function upsertFormOnlyContact(input: {
  businessName: string;
  formUrl: string;
}): Promise<{ id: string }> {
  const existing = await db
    .select({ id: sponsorContacts.id })
    .from(sponsorContacts)
    .where(
      and(
        sql`lower(${sponsorContacts.businessName}) = lower(${input.businessName})`,
        eq(sponsorContacts.contactFormUrl, input.formUrl),
      ),
    )
    .limit(1);

  const values = {
    businessName: input.businessName,
    email: null as string | null,
    contactEvidenceState: 'official_contact_form' as const,
    contactRole: 'influencer stay request form',
    representsBusiness: input.businessName,
    contactFormUrl: input.formUrl,
    evidenceUrl: input.formUrl,
    evidenceCapturedAt: new Date(),
    evidenceIsOfficial: true,
    verificationMethod: 'published_on_official_site',
    lastRecheckedAt: new Date(),
    nextContactPath: 'official_contact_form' as const,
    nextContactPathDetail: 'Human submits the Loews influencer stay request form. Benson does not submit.',
    quarantineState: 'active' as const,
    quarantineReason: null,
    quarantinedAt: null,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db.update(sponsorContacts).set(values).where(eq(sponsorContacts.id, existing[0].id));
    return { id: existing[0].id };
  }

  const inserted = await db
    .insert(sponsorContacts)
    .values({ ...values, status: 'ready_to_contact' })
    .returning({ id: sponsorContacts.id });
  return { id: inserted[0]!.id };
}

/** Persists the opportunity, one row per business key, refreshed each run. */
async function upsertOpportunity(input: {
  facts: BusinessFacts;
  qualification: QualificationResult;
  answers: QualificationAnswers;
  readiness: SendReadinessVerdict | null;
  compensationRequested: CompensationComponent[];
  contactId: string | null;
  whyNow: ReturnType<typeof pickWhyNow>;
  concept: { headline: string; detail: string } | null;
  outreachEmailId: string | null;
  blockedReasons: string[];
  termsToWeigh: string[];
}): Promise<string> {
  const comp = assessCompensation({
    offered: [],
    requested: input.compensationRequested,
    businessName: input.facts.businessName,
  });

  const values = {
    businessName: input.facts.businessName,
    businessKey: input.facts.businessKey,
    market: 'kansas_city',
    opportunityKind: 'hospitality',
    sponsorContactId: input.contactId,
    compensationState: comp.state,
    compensationOffered: [] as unknown as Record<string, unknown>[],
    compensationRequested: input.compensationRequested as unknown as Record<string, unknown>[],
    compensationNote: comp.displaySummary,
    compensationIsPartial: comp.isPartial,
    qualification: input.answers as unknown as Record<string, unknown>,
    qualificationScore: input.qualification.score.toFixed(2),
    qualificationFactors: input.qualification.factors as unknown as Record<string, unknown>[],
    unknowns: input.answers.unknowns,
    evidence: buildEvidenceItems(input.facts) as unknown as Record<string, unknown>[],
    whyNow: input.whyNow?.headline ?? null,
    pitchConcept: (input.concept ?? null) as unknown as Record<string, unknown> | null,
    termsToWeigh: input.termsToWeigh,
    // `lifecycle_state` tracks where the opportunity is in Kellie's workflow;
    // `send_ready` stays false until she has approved, which she has not here.
    lifecycleState: input.outreachEmailId ? 'awaiting_approval' : 'researching',
    sendReady: input.readiness?.sendReady ?? false,
    blockedReasons: input.blockedReasons,
    outreachEmailId: input.outreachEmailId,
    surfacedToKellieAt: input.outreachEmailId ? new Date() : null,
    lastEvaluatedAt: new Date(),
    updatedAt: new Date(),
  };

  const existing = await db
    .select({ id: partnershipOpportunities.id })
    .from(partnershipOpportunities)
    .where(eq(partnershipOpportunities.businessKey, input.facts.businessKey))
    .limit(1);

  if (existing[0]) {
    await db
      .update(partnershipOpportunities)
      .set(values)
      .where(eq(partnershipOpportunities.id, existing[0].id));
    return existing[0].id;
  }

  const inserted = await db
    .insert(partnershipOpportunities)
    .values(values)
    .returning({ id: partnershipOpportunities.id });
  return inserted[0]!.id;
}

export type RunPipelineOptions = {
  /** Injected so tests never reach a model. */
  call?: PitchModelCaller;
  /** Limit to one business, for inspection. */
  onlyBusiness?: string;
  /** When false, nothing is written. */
  persist?: boolean;
};

/**
 * Evaluates every business with facts and drafts pitches for those that qualify.
 */
export async function runHospitalityPipeline(
  options: RunPipelineOptions = {},
): Promise<PipelineOutcome[]> {
  const persist = options.persist !== false;
  const names = options.onlyBusiness
    ? [options.onlyBusiness]
    : await businessesWithFacts();

  const audience = await resolvePitchAudienceEvidence();
  const outcomes: PipelineOutcome[] = [];

  for (const businessName of names) {
    const facts = await loadBusinessFacts(businessName);
    const whyNow = pickWhyNow(facts);
    const contact = bestPartnershipContact(facts);
    const kind = await businessKind(businessName);
    const variant = variantForBusinessKind(kind);

    const concept = whyNow
      ? {
          headline: `A short first-person video from the night of ${whyNow.headline}`,
          detail:
            'Arrival, the room, and the event itself, cut as one continuous evening so the property reads as somewhere locals choose.',
        }
      : null;

    const compensationRequested = recommendedHostedStayRequest({
      estimatedRoomRateUsd: null,
      includeDiningCredit: true,
    });

    const evidenceItems = buildEvidenceItems(facts);
    const compensation = assessCompensation({
      offered: [],
      requested: compensationRequested,
      businessName,
    });

    // The nine questions a qualified opportunity has to answer. Anything Benson cannot
    // answer from evidence stays null and lands in `unknowns` rather than being filled
    // in with a plausible guess.
    const answers: QualificationAnswers = {
      business: `${businessName}${kind ? ` — ${kind}` : ''}`,
      whyKellie: audience.followersAvailable
        ? `Kellie covers Kansas City hotels and restaurants for a local audience of ${audience.followersCount?.toLocaleString('en-US')} on TikTok, which is the audience this property needs to reach locally.`
        : null,
      whyNow: whyNow?.headline ?? null,
      contentConcept: concept?.headline ?? null,
      businessBenefit:
        'A first-person video from a local creator, showing the property as somewhere residents choose rather than only somewhere visitors land.',
      theAsk: compensation.requestedSummary,
      decisionMaker: contact
        ? `${contact.email}${contact.publishedLabel ? ` (published under "${contact.publishedLabel}")` : ''}`
        : null,
      evidence: evidenceItems.map((item) => `${item.fact} — ${item.sourceUrl}`),
      unknowns: [],
    };
    if (!answers.whyNow) answers.unknowns.push('No dated reason to write has been found yet.');
    if (!answers.decisionMaker) {
      answers.unknowns.push('No verified contact has been found for this business.');
    }
    if (!answers.whyKellie) {
      answers.unknowns.push('Live audience analytics did not resolve.');
    }
    answers.unknowns.push(
      'The room rate and what the property is willing to host are unknown until they reply.',
    );

    const qualification = qualifyOpportunity({
      inKcMetro: true,
      geographyNote: 'Kansas City metro property, which is Kellie\u2019s home market.',
      hospitalityFit: hospitalityFitFor(kind),
      timelyHook: whyNow
        ? {
            description: whyNow.headline,
            date: whyNow.date,
            // The extractor records recurrence; a weekly class is a weaker hook.
            isRecurring: false,
          }
        : null,
      // Benson has no published evidence yet that these properties work with local
      // creators. Asserting otherwise would be exactly the invented flattery the pitch
      // rules ban.
      collaboratesWithCreators: null,
      contactEvidenceState: contact?.evidenceState ?? 'unknown',
      compensationState: compensation.state,
      compensationIsPartial: compensation.isPartial,
      priorRelationship: null,
      conceptIsSpecific: concept !== null,
      answers,
      daysUntilDeadline: whyNow?.date
        ? Math.round((new Date(whyNow.date).getTime() - Date.now()) / 86_400_000)
        : null,
      requiredLeadTimeDays: null,
    });

    // The kit is required for readiness, so resolve it before judging the opportunity.
    const kit = await loadMediaKitBySlug(mediaKitSlug(variant));
    const kitRow = kit
      ? await db
          .select({
            id: mediaKits.id,
            name: mediaKits.name,
            fileSize: mediaKits.fileSize,
            isTestArtifact: mediaKits.isTestArtifact,
            kitKind: mediaKits.kitKind,
          })
          .from(mediaKits)
          .where(eq(mediaKits.id, kit.id))
          .limit(1)
      : [];

    const mismatch = contact
      ? contactRepresentsBusiness({
          representsBusiness: businessName,
          targetBusinessName: businessName,
          businessKeyFn: businessKeyFor,
        })
      : { ok: false, reason: null };

    const readiness = evaluateSendReadiness({
      contact: {
        state: contact?.evidenceState ?? 'unknown',
        email: contact?.email ?? null,
        evidenceUrl: contact?.sourceUrl ?? null,
        evidenceCapturedAt: contact?.observedAt ?? null,
        lastRecheckedAt: contact?.observedAt ?? null,
        representsBusiness: businessName,
        sourceIsOfficial: true,
        personName: null,
        contactFormUrl: /loews/i.test(businessName) ? LOEWS_INFLUENCER_FORM_URL : null,
        phone: null,
        officialSocialUrl: null,
        verificationMethod: 'published_on_official_site',
        conflictNote: null,
        staleNote: null,
        personRole: contact?.publishedLabel ?? null,
      },
      businessName,
      contactBusinessMismatchReason: mismatch.ok ? null : mismatch.reason,
      compensationState: assessCompensation({
        offered: [],
        requested: compensationRequested,
        businessName,
      }).state,
      analytics: {
        followersAvailable: audience.followersAvailable,
        followersCount: audience.followersCount,
        lastSyncedAt: audience.lastSyncedAt,
        stale: audience.stale,
      },
      mediaKit: kitRow[0]
        ? {
            id: kitRow[0].id,
            name: kitRow[0].name,
            fileSizeBytes: kitRow[0].fileSize,
            isTestArtifact: kitRow[0].isTestArtifact,
            isGenerated: kitRow[0].kitKind !== 'uploaded',
            webUrl: mediaKitWebUrl(mediaKitSlug(variant)),
          }
        : null,
      // Nothing is pre-approved. Approval is Kellie's, always.
      approval: {
        approvedAt: null,
        approvedBy: null,
        approvedContentHash: null,
        approvedRecipient: null,
      },
    });

    const blockedReasons = readiness.blocks.map((block) => block.code);

    // Draft when the only outstanding steps are Kellie's approval and/or a human
    // form submit. Form-only packets are reviewable but never send-ready by email.
    const readyToDraft =
      qualification.surfaceToKellie &&
      readiness.blocks.every(
        (block) =>
          block.code === 'not_approved' || block.code === 'contact_evidence_form_only',
      );

    let draftedEmailId: string | null = null;
    let draftPreview: { subject: string; body: string } | null = null;
    let blockedReason: string | null = readiness.summary;

    const formOnly =
      readiness.state === 'review_ready_form_only' ||
      readiness.blocks.some((b) => b.code === 'contact_evidence_form_only');

    if (readyToDraft && formOnly && /loews/i.test(businessName)) {
      const packet = await buildLoewsFormPacket();
      const subject = 'Loews Kansas City — influencer stay request (form only)';
      const body = formatLoewsPacketAsDraftBody(packet);
      if (!persist) {
        draftPreview = { subject, body };
        blockedReason = null;
      } else {
        // Form-only: create/update a placeholder contact with the form URL, no email send.
        const formContact = await upsertFormOnlyContact({
          businessName: 'Loews Kansas City Hotel',
          formUrl: LOEWS_INFLUENCER_FORM_URL,
        });
        draftedEmailId = await queueDraftForApproval({
          contactId: formContact.id,
          mediaKitId: kitRow[0]?.id ?? null,
          subject,
          body,
          readiness,
          compensationState: assessCompensation({
            offered: [],
            requested: compensationRequested,
            businessName,
          }).state,
        });
        blockedReason = null;
      }
    } else if (readyToDraft && contact && !formOnly) {
      const brief: PitchBrief = {
        businessName,
        propertyName: null,
        recipientEmail: contact.email,
        recipientName: null,
        recipientLabel: contact.publishedLabel,
        whyNow,
        concept,
        deliverables: [
          { description: 'one in-feed TikTok video' },
          { description: 'a set of stories on the night' },
        ],
        compensationOffered: [],
        compensationRequested,
        compensationState: assessCompensation({
          offered: [],
          requested: compensationRequested,
          businessName,
        }).state,
        estimatedExperienceCostUsd: null,
        audience,
        mediaKitUrl: mediaKitWebUrl(mediaKitSlug(variant)),
        evidence: buildEvidenceItems(facts),
        termsToWeigh: [],
        priorRelationshipNote: null,
        isFollowUp: false,
        originalSubject: null,
      };

      const missing = checkBriefCompleteness(brief);
      if (missing.length > 0) {
        blockedReason = `Benson cannot write this pitch yet: ${missing.join(' ')}`;
      } else {
        const written = await writeHospitalityPitch(brief, { call: options.call });
        if (!written.ok) {
          blockedReason = written.summary;
        } else if (!persist) {
          // Dry run: report what would be queued rather than the approval step that is
          // expected to be outstanding.
          draftPreview = { subject: written.pitch.subject, body: written.pitch.body };
          blockedReason = null;
        } else {
          const contactRow = await upsertEvidencedContact({
            businessName,
            email: contact.email,
            evidenceState: contact.evidenceState,
            publishedLabel: contact.publishedLabel,
            sourceUrl: contact.sourceUrl,
            observedAt: contact.observedAt,
          });
          draftedEmailId = await queueDraftForApproval({
            contactId: contactRow.id,
            mediaKitId: kitRow[0]?.id ?? null,
            subject: written.pitch.subject,
            body: written.pitch.body,
            readiness,
            compensationState: brief.compensationState,
          });
          blockedReason = null;
        }
      }
    }

    let opportunityId: string | null = null;
    if (persist) {
      const contactRow = contact
        ? await upsertEvidencedContact({
            businessName,
            email: contact.email,
            evidenceState: contact.evidenceState,
            publishedLabel: contact.publishedLabel,
            sourceUrl: contact.sourceUrl,
            observedAt: contact.observedAt,
          })
        : null;

      opportunityId = await upsertOpportunity({
        facts,
        qualification,
        answers,
        readiness,
        compensationRequested,
        contactId: contactRow?.id ?? null,
        whyNow,
        concept,
        outreachEmailId: draftedEmailId,
        blockedReasons,
        termsToWeigh: [],
      });

      if (draftedEmailId) {
        await db
          .update(outreachEmails)
          .set({ partnershipOpportunityId: opportunityId, updatedAt: new Date() })
          .where(eq(outreachEmails.id, draftedEmailId));
      }
    }

    outcomes.push({
      businessName,
      businessKey: facts.businessKey,
      qualification,
      readiness,
      draftedEmailId,
      draftPreview,
      blockedReason,
      opportunityId,
    });
  }

  return outcomes;
}

/**
 * Queues a written pitch for Kellie's approval.
 *
 * Status is `needs_approval` and nothing else — a draft can never be created already
 * approved, and `assertApprovedForSend` still gates the send itself.
 */
async function queueDraftForApproval(input: {
  contactId: string;
  mediaKitId: string | null;
  subject: string;
  body: string;
  readiness: SendReadinessVerdict;
  compensationState: string;
}): Promise<string> {
  // One live draft per contact: re-running the pipeline refreshes the pitch instead of
  // stacking duplicates in the queue, which is how the backlog reached 167 rows.
  const existing = await db
    .select({ id: outreachEmails.id })
    .from(outreachEmails)
    .where(
      and(
        eq(outreachEmails.sponsorContactId, input.contactId),
        eq(outreachEmails.status, 'needs_approval'),
        isNull(outreachEmails.approvedAt),
      ),
    )
    .limit(1);

  const values = {
    sponsorContactId: input.contactId,
    mediaKitId: input.mediaKitId,
    subject: input.subject,
    body: input.body,
    status: 'needs_approval' as const,
    approvalRequired: true,
    draftedBy: 'benson_hospitality_pipeline',
    pitchReadinessStatus: pitchReadinessStatusFor(input.readiness),
    compensationState: input.compensationState,
    quarantineState: 'active' as const,
    quarantineReason: null,
    quarantinedAt: null,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await db.update(outreachEmails).set(values).where(eq(outreachEmails.id, existing[0].id));
    return existing[0].id;
  }

  const inserted = await db
    .insert(outreachEmails)
    .values(values)
    .returning({ id: outreachEmails.id });
  return inserted[0]!.id;
}
