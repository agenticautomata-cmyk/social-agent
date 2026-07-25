import OpenAI from 'openai';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db.js';
import { outreachEmails } from '../../schema.js';
import { env } from '../../env.js';
import {
  creatorFirstName,
  defaultTikTokHandle,
  formatFollowerDescriptor,
  formatTikTokHandle,
  normalizeCreatorNameInText,
} from '../../creator-display.js';
import {
  buildOutreachSystemPrompt,
  sanitizeOutreachDraft,
} from './voice.js';
import {
  createSponsorFromOpportunity,
  getSponsorContact,
  loadInventoryItemById,
} from '../contacts.js';
import { getMediaKit } from '../media-kits.js';
import { writeFollowUpWithLlm } from '../follow-up.js';
import { getOutreachEmail, type OutreachEmailRecord } from '../outreach.js';
import { enrichSponsorContact } from '../contact-enrichment.js';
import { listMediaKits } from '../media-kits.js';
import { extractMediaKitContent } from '../media-kit-extract.js';
import {
  createBensonOutreachDraft,
} from '../outreach.js';
import { notifyOutreachDraftReady } from '../../outreach-notifications/notify-kellie.js';
import {
  pickTemplateType,
  recommendedPitchAngle,
  suggestedSponsorshipAngle,
  evaluateSponsorAngle,
} from '../../sponsor-intelligence/scoring.js';
import { evaluateInventoryDraftGate, evaluateDraftQuality } from '../../content-angles/draft-quality.js';
import { resolveTikTokAnalyticsContext } from '../../creator-analytics/tiktok-context.js';
import type { InventoryItem } from '../../inventory/normalize.js';
import type { MediaKitRecord } from '../media-kits.js';

const DraftSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
  reasoning: z.string().optional(),
});

async function pickMediaKit(category: string | null): Promise<MediaKitRecord | null> {
  const kits = await listMediaKits(true);
  if (kits.length === 0) return null;
  if (category) {
    const match = kits.find((k) => k.targetAudience?.toLowerCase().includes(category.toLowerCase()));
    if (match) return match;
  }
  return kits[0] ?? null;
}

async function countBensonDraftsToday(): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = await db
    .select({ id: outreachEmails.id })
    .from(outreachEmails)
    .where(
      and(eq(outreachEmails.draftedBy, 'benson'), gte(outreachEmails.createdAt, start)),
    );
  return rows.length;
}

async function recentlyEmailedContact(sponsorContactId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: outreachEmails.id })
    .from(outreachEmails)
    .where(
      and(
        eq(outreachEmails.sponsorContactId, sponsorContactId),
        inArray(outreachEmails.status, ['sent', 'simulated_sent', 'scheduled', 'needs_approval']),
        gte(outreachEmails.updatedAt, cutoff),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function buildPitchContext(input: {
  contact: { businessName: string; category: string | null; contactName: string | null; email: string | null };
  opportunity: InventoryItem | null;
  kit: MediaKitRecord | null;
  templateType: string;
}) {
  let mediaKitSnippet = input.kit?.description?.slice(0, 500) ?? null;
  if (input.kit?.storageFilename) {
    const extracted = await extractMediaKitContent({
      mimeType: input.kit.mimeType,
      storageFilename: input.kit.storageFilename,
    });
    if (extracted.text) {
      mediaKitSnippet = extracted.text.slice(0, 1200);
    }
  }

  const tiktokCtx = await resolveTikTokAnalyticsContext(env.DEMO_MODE);
  const handle =
    formatTikTokHandle(tiktokCtx.platformUsername) ?? defaultTikTokHandle();
  const followerDescriptor = formatFollowerDescriptor(tiktokCtx.followersCount);
  const creatorStats =
    tiktokCtx.followersAvailable && followerDescriptor
      ? {
          platform: 'TikTok',
          handle,
          followerDescriptor,
          focus: 'Kansas City lifestyle, dining, shopping, events',
          creatorName: creatorFirstName(),
        }
      : handle
        ? {
            platform: 'TikTok',
            handle,
            followerDescriptor: followerDescriptor ?? 'over 5K followers',
            focus: 'Kansas City lifestyle, dining, shopping, events',
            creatorName: creatorFirstName(),
          }
        : null;

  return {
    businessName: input.contact.businessName,
    contactName: input.contact.contactName,
    contactEmail: input.contact.email,
    category: input.contact.category,
    templateType: input.templateType,
    pitchAngle: input.opportunity ? recommendedPitchAngle(input.opportunity) : null,
    sponsorshipAsk: input.opportunity ? suggestedSponsorshipAngle(input.opportunity) : null,
    mediaKitName: input.kit?.name ?? null,
    mediaKitSnippet,
    creatorStats,
    opportunity: input.opportunity
      ? {
          title: input.opportunity.title,
          businessName: input.opportunity.businessName,
          category: input.opportunity.category,
          venue: input.opportunity.venue,
          neighborhood: input.opportunity.neighborhood,
          eventDate: input.opportunity.eventDate,
          summary: input.opportunity.summary?.slice(0, 500),
          whyItMatters: input.opportunity.whyItMatters?.slice(0, 300),
        }
      : null,
  };
}

async function writePitchWithLlm(context: Awaited<ReturnType<typeof buildPitchContext>>): Promise<
  z.infer<typeof DraftSchema>
> {
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new Error('OPENAI_API_KEY is required for Benson outreach drafting');
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const system = buildOutreachSystemPrompt({ kind: 'pitch' });

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.55,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(context) },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty outreach draft');
  const parsed = DraftSchema.parse(JSON.parse(content));
  const cleaned = sanitizeOutreachDraft({ subject: parsed.subject, body: parsed.body });
  return {
    ...parsed,
    subject: normalizeCreatorNameInText(cleaned.subject),
    body: normalizeCreatorNameInText(cleaned.body),
  };
}

export async function draftSponsorOutreachFromOpportunity(
  contentItemId: string,
  options?: { ignoreDailyCap?: boolean },
): Promise<{
  emailId: string;
  skipped?: string;
}> {
  const dailyCap = env.BENSON_OUTREACH_DRAFTS_PER_DAY;
  if (!options?.ignoreDailyCap && (await countBensonDraftsToday()) >= dailyCap) {
    return { emailId: '', skipped: 'daily_cap_reached' };
  }

  const { contact: initialContact, opportunity } = await createSponsorFromOpportunity(contentItemId);
  if (initialContact.status === 'not_interested') {
    return { emailId: '', skipped: 'not_interested' };
  }
  if (await recentlyEmailedContact(initialContact.id)) {
    return { emailId: '', skipped: 'recently_contacted' };
  }

  const existing = await db
    .select({ id: outreachEmails.id })
    .from(outreachEmails)
    .where(
      and(
        eq(outreachEmails.sponsorContactId, initialContact.id),
        inArray(outreachEmails.status, ['draft', 'needs_approval']),
      ),
    )
    .orderBy(desc(outreachEmails.updatedAt))
    .limit(1);
  if (existing[0]) {
    return { emailId: existing[0].id, skipped: 'existing_draft' };
  }

  const contact = await enrichSponsorContact({
    contact: initialContact,
    opportunity,
    allowWebSearch: true,
  });

  const angleGate = evaluateInventoryDraftGate(opportunity);
  if (!angleGate.allowed) {
    return { emailId: '', skipped: angleGate.skipReason ?? 'no_valid_angle' };
  }

  const templateType = pickTemplateType(opportunity);
  const kit = await pickMediaKit(contact.category);
  const pitchContext = await buildPitchContext({
    contact: {
      businessName: contact.businessName,
      category: contact.category,
      contactName: contact.contactName,
      email: contact.email,
    },
    opportunity,
    kit,
    templateType,
  });

  const draft = await writePitchWithLlm(pitchContext);
  const angle = evaluateSponsorAngle(opportunity);
  const quality = evaluateDraftQuality({
    subject: draft.subject,
    body: draft.body,
    angle,
    contactEmail: contact.email,
    contactName: contact.contactName,
    businessName: contact.businessName,
  });

  if (!quality.showToKellie) {
    return { emailId: '', skipped: quality.blockedReasons[0] ?? 'invalid_angle' };
  }

  const emailRow = await createBensonOutreachDraft({
    sponsorContactId: contact.id,
    mediaKitId: kit?.id ?? null,
    subject: draft.subject,
    body: draft.body,
    pitchReadinessStatus: quality.pitchReadinessStatus,
    bensonDraftContext: {
      reasoning: draft.reasoning ?? null,
      templateType,
      contentItemId,
      contactEmail: contact.email,
      missingContact: !contact.email,
      mediaKitName: kit?.name ?? null,
      pitchAngle: pitchContext.pitchAngle,
      angleFamily: angle.family,
      angleExplanation: angle.explanation,
      enrichmentAttempted: true,
    },
  });

  await notifyOutreachDraftReady({
    emailId: emailRow.id,
    businessName: contact.businessName,
  });

  return { emailId: emailRow.id };
}

export async function runBensonOutreachDraftingBatch(input?: {
  limit?: number;
  contentItemIds?: string[];
}): Promise<{ drafted: number; skipped: string[]; emailIds: string[] }> {
  const limit = Math.min(input?.limit ?? env.BENSON_OUTREACH_DRAFTS_PER_DAY, env.BENSON_OUTREACH_DRAFTS_PER_DAY);
  const skipped: string[] = [];
  const emailIds: string[] = [];

  let ids = input?.contentItemIds ?? [];
  if (ids.length === 0) {
    const { loadIngestedInventoryItems } = await import('../../inventory/load-ingested.js');
    const { computeTopSponsorCandidates } = await import('../../sponsor-intelligence/top-candidates.js');
    const { shouldPromoteSponsorCandidate } = await import('../../sponsor-intelligence/priority.js');
    const items = await loadIngestedInventoryItems();
    const top = await computeTopSponsorCandidates(items, { limit: limit * 5 });
    ids = top.items
      .filter((rec) => shouldPromoteSponsorCandidate(rec))
      .map((item) => item.contentItemId);
  }

  for (const contentItemId of ids) {
    if (emailIds.length >= limit) break;
    try {
      const result = await draftSponsorOutreachFromOpportunity(contentItemId);
      if (result.skipped) {
        skipped.push(`${contentItemId}:${result.skipped}`);
        continue;
      }
      if (result.emailId) emailIds.push(result.emailId);
    } catch (err) {
      skipped.push(`${contentItemId}:${err instanceof Error ? err.message : 'error'}`);
    }
  }

  return { drafted: emailIds.length, skipped, emailIds };
}

function parseBensonDraftContext(raw: Record<string, unknown> | null | undefined) {
  return (raw ?? {}) as {
    kind?: string;
    contentItemId?: string;
    originalOutreachEmailId?: string;
    templateType?: string;
    contactEmail?: string | null;
    missingContact?: boolean;
    mediaKitName?: string | null;
    pitchAngle?: string | null;
    enrichmentAttempted?: boolean;
    reasoning?: string | null;
  };
}

/** Re-run Benson LLM on an existing approval draft — same row, fresh voice. */
export async function regenerateOutreachApprovalDraft(
  outreachEmailId: string,
): Promise<OutreachEmailRecord> {
  const existing = await getOutreachEmail(outreachEmailId);
  if (!existing) throw new Error('Outreach email not found');
  if (existing.status !== 'needs_approval') {
    throw new Error('Only emails awaiting approval can be regenerated');
  }

  const contact = await getSponsorContact(existing.sponsorContactId);
  if (!contact) throw new Error('Sponsor contact not found');

  const ctx = parseBensonDraftContext(existing.bensonDraftContext);
  const now = new Date();
  let subject: string;
  let body: string;
  let reasoning: string | null = ctx.reasoning ?? null;
  let pitchAngle: string | null = ctx.pitchAngle ?? null;
  let mediaKitId = existing.mediaKitId;
  let mediaKitName = ctx.mediaKitName ?? null;

  let pitchReadinessStatus = existing.pitchReadinessStatus;
  let angleMeta: ReturnType<typeof evaluateSponsorAngle> | null = null;

  if (ctx.kind === 'follow_up') {
    const originalId = ctx.originalOutreachEmailId;
    const original = originalId ? await getOutreachEmail(originalId) : null;
    const regenerated = await writeFollowUpWithLlm({
      businessName: contact.businessName,
      contactName: contact.contactName,
      originalSubject: original?.subject ?? existing.subject,
      originalBody: original?.body ?? existing.body,
    });
    subject = regenerated.subject;
    body = regenerated.body;
  } else {
    const contentItemId = ctx.contentItemId ?? contact.sourceOpportunityId;
    const opportunity = contentItemId ? await loadInventoryItemById(contentItemId) : null;

    if (opportunity) {
      const angleGate = evaluateInventoryDraftGate(opportunity);
      if (!angleGate.allowed) {
        throw new Error(`Cannot regenerate draft: ${angleGate.skipReason ?? 'no_valid_angle'}`);
      }
    }

    const enriched = await enrichSponsorContact({
      contact,
      opportunity,
      allowWebSearch: false,
    });
    const templateType =
      ctx.templateType ?? (opportunity ? pickTemplateType(opportunity) : 'introduction');
    const kit =
      (existing.mediaKitId ? await getMediaKit(existing.mediaKitId) : null) ??
      (await pickMediaKit(enriched.category));
    mediaKitId = kit?.id ?? existing.mediaKitId;
    mediaKitName = kit?.name ?? mediaKitName;

    const pitchContext = await buildPitchContext({
      contact: {
        businessName: enriched.businessName,
        category: enriched.category,
        contactName: enriched.contactName,
        email: enriched.email,
      },
      opportunity,
      kit,
      templateType,
    });
    const draft = await writePitchWithLlm(pitchContext);
    subject = draft.subject;
    body = draft.body;
    reasoning = draft.reasoning ?? null;
    pitchAngle = pitchContext.pitchAngle;

    if (opportunity) {
      angleMeta = evaluateSponsorAngle(opportunity);
      const quality = evaluateDraftQuality({
        subject,
        body,
        angle: angleMeta,
        contactEmail: enriched.email,
        contactName: enriched.contactName,
        businessName: enriched.businessName,
      });
      if (!quality.showToKellie) {
        throw new Error(
          `Regenerated draft failed quality gate: ${quality.blockedReasons.join(', ') || 'invalid_angle'}`,
        );
      }
      pitchReadinessStatus = quality.pitchReadinessStatus;
    }
  }

  await db
    .update(outreachEmails)
    .set({
      subject,
      body,
      mediaKitId,
      draftedBy: 'benson',
      pitchReadinessStatus,
      bensonDraftContext: {
        ...ctx,
        reasoning,
        pitchAngle,
        contactEmail: contact.email,
        missingContact: !contact.email,
        mediaKitName,
        angleFamily: angleMeta?.family ?? (ctx as { angleFamily?: string }).angleFamily,
        angleExplanation: angleMeta?.explanation ?? (ctx as { angleExplanation?: string[] }).angleExplanation,
        regeneratedAt: now.toISOString(),
      },
      updatedAt: now,
    })
    .where(eq(outreachEmails.id, outreachEmailId));

  const updated = await getOutreachEmail(outreachEmailId);
  if (!updated) throw new Error('Failed to load regenerated draft');
  return updated;
}
