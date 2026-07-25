import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../env.js';
import type { BusinessEnrichment, CreatorAssistancePackage } from './types.js';
import { enrichmentBlocksVisit } from './enrichment.js';

const PackageSchema = z.object({
  whyItMayFit: z.object({
    audienceConnection: z.string(),
    novelty: z.string(),
    visualPotential: z.string(),
    viewerValue: z.string(),
    productionBurden: z.string(),
  }),
  contentOptions: z.array(z.string()).min(1).max(12),
  visitPlan: z.object({
    suggestedTiming: z.string(),
    address: z.string().nullable(),
    mapUrl: z.string().nullable(),
    parkingNotes: z.string().nullable(),
    filmingRequirements: z.string(),
    shotList: z.array(z.string()),
    questionsToAsk: z.array(z.string()),
    verifyBeforeLeaving: z.array(z.string()),
    weatherDependent: z.boolean(),
  }),
  contentPackage: z.object({
    recommendedFormat: z.string(),
    openingHook: z.string(),
    talkingPoints: z.array(z.string()),
    shotList: z.array(z.string()),
    caption: z.string(),
    callToAction: z.string(),
    sourceAttribution: z.string(),
    disclosure: z.string().nullable(),
  }),
  businessAction: z.object({
    contactChannel: z.string().nullable(),
    outreachRecommendation: z.string(),
    draftOutreach: z.string().nullable(),
    visitNormallyInstead: z.boolean(),
  }),
});

export async function generateAssistancePackage(input: {
  title: string;
  summary: string | null;
  enrichment: BusinessEnrichment;
  category: string | null;
}): Promise<CreatorAssistancePackage> {
  const visitBlocked = enrichmentBlocksVisit(input.enrichment);

  if (!env.OPENAI_API_KEY) {
    return buildFallbackAssistancePackage(input, visitBlocked);
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: env.BENSON_ASK_MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.35,
    max_tokens: 1800,
    messages: [
      {
        role: 'system',
        content: `Generate a creator assistance package for Kellie (KC TikTok).
Use ONLY verified/inferred enrichment fields — do not invent contact details, hours, or prices.
If visit is blocked (closed/expired), say so clearly and focus on verification steps instead of a visit plan.
Do not force sponsorship — visitNormallyInstead=true when a casual visit beats pitching.
contentOptions must pick from: discovery visit, product tasting, price/value breakdown, hidden gem, family outing, grown-woman outing, neighborhood guide, Before You Go KC, owner story, no valid angle.
Respond JSON with keys whyItMayFit, contentOptions, visitPlan, contentPackage, businessAction.`,
      },
      {
        role: 'user',
        content: JSON.stringify({ ...input, visitBlocked }),
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return buildFallbackAssistancePackage(input, visitBlocked);

  const parsed = PackageSchema.safeParse(JSON.parse(content));
  if (!parsed.success) return buildFallbackAssistancePackage(input, visitBlocked);
  return { ...parsed.data, generatedAt: new Date().toISOString() };
}

export function buildFallbackAssistancePackage(
  input: { title: string; summary: string | null; enrichment: BusinessEnrichment; category: string | null },
  visitBlocked: boolean,
): CreatorAssistancePackage {
  const name = input.enrichment.canonicalName.value ?? input.title;
  return {
    whyItMayFit: {
      audienceConnection: `Local ${input.category ?? 'KC'} spot — may fit Kellie's neighborhood discovery audience.`,
      novelty: visitBlocked ? 'Verify whether this business is still open before planning content.' : 'Worth a quick scout if the visuals match Kellie\'s sweet-treat content.',
      visualPotential: 'Product close-ups and reaction shots if visit is possible.',
      viewerValue: 'Affordable local find angle if pricing is confirmed on-site.',
      productionBurden: visitBlocked ? 'Low until open status is verified.' : 'Low — single-location visit.',
    },
    contentOptions: visitBlocked ? ['no valid angle'] : ['discovery visit', 'product tasting', 'hidden gem'],
    visitPlan: {
      suggestedTiming: visitBlocked ? 'Do not plan a visit until open status is confirmed.' : 'Weekday afternoon for shorter lines.',
      address: input.enrichment.address.value,
      mapUrl: input.enrichment.coordinates.value
        ? `https://www.google.com/maps/search/?api=1&query=${input.enrichment.coordinates.value.lat},${input.enrichment.coordinates.value.lng}`
        : null,
      parkingNotes: input.enrichment.parking.value,
      filmingRequirements: 'Phone + natural light; confirm filming policy in person if unknown.',
      shotList: visitBlocked ? [] : ['Exterior sign', 'Menu/board', 'First bite reaction', 'Price reveal'],
      questionsToAsk: visitBlocked
        ? ['Are you currently open to the public?', 'What is the new location/hours?']
        : ['What are today\'s hours?', 'Any filming restrictions?', 'Signature item recommendation?'],
      verifyBeforeLeaving: input.enrichment.needsVerification,
      weatherDependent: false,
    },
    contentPackage: {
      recommendedFormat: visitBlocked ? 'verification update' : 'discovery visit',
      openingHook: visitBlocked ? `I tried to scout ${name} — here's what still needs confirming.` : `KC treat stop you might not know yet: ${name}.`,
      talkingPoints: visitBlocked ? ['Open status unclear', 'Call or check site before visiting'] : ['What makes it different', 'Price/value', 'Who it\'s best for'],
      shotList: visitBlocked ? [] : ['Hook on sign', 'Product close-up', 'Reaction'],
      caption: visitBlocked ? `Checking on ${name} — verification in progress.` : `Would you try ${name}?`,
      callToAction: 'Save this for your next KC outing.',
      sourceAttribution: input.enrichment.website.value ?? 'Official website',
      disclosure: visitBlocked ? 'Kellie has not confirmed an in-person visit yet.' : 'Kellie has not visited yet — verify details before going.',
    },
    businessAction: {
      contactChannel: input.enrichment.phone.value ?? input.enrichment.email.value,
      outreachRecommendation: visitBlocked
        ? 'Call the business to confirm open status before any outreach.'
        : 'Visit normally first — no pitch needed unless they invite collaboration.',
      draftOutreach: null,
      visitNormallyInstead: true,
    },
    generatedAt: new Date().toISOString(),
  };
}
