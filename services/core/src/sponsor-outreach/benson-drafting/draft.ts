import OpenAI from 'openai';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db.js';
import { outreachEmails } from '../../schema.js';
import { env } from '../../env.js';
import { BENSON_PERSONALITY_CORE } from '../../benson-personality/index.js';
import {
  createSponsorFromOpportunity,
  loadInventoryItemById,
} from '../contacts.js';
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
} from '../../sponsor-intelligence/scoring.js';
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
  const creatorStats =
    tiktokCtx.followersAvailable && tiktokCtx.followersCount != null
      ? {
          platform: 'TikTok',
          handle: tiktokCtx.platformUsername ? `@${tiktokCtx.platformUsername}` : null,
          followers: tiktokCtx.followersCount,
          focus: 'Kansas City lifestyle, dining, shopping, events',
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
  const system = `${BENSON_PERSONALITY_CORE}

TASK: Draft a sponsor outreach email for Kellie (KC lifestyle creator) to review before send.

VOICE: Warm, confident, local — like Kellie herself, not a marketing agency. First person ("I").
LENGTH: 120–200 words in the body. Short paragraphs.
STRUCTURE:
1. Personal hook tied to their business or the specific opportunity (show you know KC context).
2. One sentence on Kellie's audience fit — use creatorStats if provided; never invent numbers.
3. Concrete collaboration idea from pitchAngle / sponsorshipAsk.
4. Soft CTA: ask who handles partnerships or propose a quick call.

RULES:
- Do not claim the email was sent or that they already agreed.
- Do not invent follower counts, view counts, or press coverage.
- If contactName is set, greet them by name; otherwise use the business name.
- Subject line: specific and human (not "Partnership Opportunity" alone).

Return JSON only: {"subject":"...","body":"...","reasoning":"..."}`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.65,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(context) },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned empty outreach draft');
  return DraftSchema.parse(JSON.parse(content));
}

export async function draftSponsorOutreachFromOpportunity(contentItemId: string): Promise<{
  emailId: string;
  skipped?: string;
}> {
  const dailyCap = env.BENSON_OUTREACH_DRAFTS_PER_DAY;
  if ((await countBensonDraftsToday()) >= dailyCap) {
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

  const emailRow = await createBensonOutreachDraft({
    sponsorContactId: contact.id,
    mediaKitId: kit?.id ?? null,
    subject: draft.subject,
    body: draft.body,
    bensonDraftContext: {
      reasoning: draft.reasoning ?? null,
      templateType,
      contentItemId,
      contactEmail: contact.email,
      missingContact: !contact.email,
      mediaKitName: kit?.name ?? null,
      pitchAngle: pitchContext.pitchAngle,
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
