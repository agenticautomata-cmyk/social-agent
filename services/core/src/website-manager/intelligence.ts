import OpenAI from 'openai';
import { env } from '../env.js';
import {
  WEBSITE_CONTENT_TYPES,
  WEBSITE_PLACEMENTS,
  WEBSITE_SECTION_IDS,
  type WebsiteContentType,
  type WebsitePlacement,
  type WebsiteSectionId,
} from './constants.js';
import {
  type ExistingDraftContext,
  normalizeAnalysisResponse,
  normalizeRevisionResponse,
} from './normalize-revision.js';

const PLACEMENT_UI_ALIASES = [
  'homepage_featured',
  'latest_posts',
  'kc_finds',
  'sponsor_highlights',
  'media_kit',
  'gallery',
] as const;

export type WebsiteMediaAnalysis = {
  category: string;
  caption: string;
  altText: string;
  contentType: WebsiteContentType;
  suggestedPlacement: WebsitePlacement;
  suggestedSectionId: WebsiteSectionId;
  reasoning: string | null;
  headline: string | null;
};

export type WebsiteDraftRevision = WebsiteMediaAnalysis & {
  title: string;
  sectionId: WebsiteSectionId;
  assistantReply: string;
  ctaLabel: string | null;
  ctaHref: string | null;
};

const CLASSIFICATION_RULES = `CLASSIFICATION RULES (follow in order):
1. FIRST decide: is this a phone/app SCREENSHOT? Look for: status bar, app chrome, TikTok/Instagram UI, profile grids with play buttons, follower counts, analytics dashboards, @handles, For You page.
2. If YES → it is NEVER food, NEVER a restaurant photo, NEVER a sponsor deal unless a brand logo is clearly the subject.
   → category: social, contentType: screenshot, suggestedPlacement: latest_posts, sectionId: latest_posts
3. ONLY use food/kc/lifestyle when the image is a real camera photo of the subject (plate of food, storefront, person at a location).
4. In reasoning, name the UI you see ("TikTok profile grid", "Instagram analytics") — do not describe imaginary dishes.`;

const SYSTEM_ANALYZE = `You categorize media for KC Kellie's public creator website (kckellie.com).

${CLASSIFICATION_RULES}

Upload types:
- TikTok profile/grid screenshot → social, screenshot, latest_posts
- TikTok analytics screenshot → social, screenshot, latest_posts
- Instagram screenshot → social, screenshot, latest_posts
- Sponsor email screenshot → sponsor, screenshot, sponsor_highlights
- Event flyer → events, homepage_featured or latest_posts
- Real food photo (camera shot of food) → food, food
- KC location photo → kc, kc_finds
- Personal/lifestyle photo → lifestyle, lifestyle

Return JSON with ALL fields:
category, caption (1-2 sentences, warm KC creator voice), altText,
contentType (${WEBSITE_CONTENT_TYPES.join('|')}),
suggestedPlacement (${[...WEBSITE_PLACEMENTS, ...PLACEMENT_UI_ALIASES].join('|')}),
sectionId (${WEBSITE_SECTION_IDS.join('|')}),
reasoning (what UI or subject you actually see — required), headline (optional).`;

const SYSTEM_REVISE = `You help Kellie revise website draft copy for kckellie.com.

${CLASSIFICATION_RULES}

If Kellie says "put this in latest posts" → suggestedPlacement: latest_posts, sectionId: latest_posts.
If Kellie says something is a TikTok/Instagram screenshot, trust her and fix any wrong food/sponsor labels.

Return JSON with ALL fields:
title, caption, altText, headline (nullable), category, contentType, suggestedPlacement, sectionId,
reasoning, assistantReply (1-3 sentences — mention what you corrected),
ctaLabel (nullable), ctaHref (nullable).`;

function fallbackAnalysis(input: {
  originalFilename: string;
  mediaKind: 'image' | 'video';
}): WebsiteMediaAnalysis {
  return normalizeAnalysisResponse({}, input);
}

function imageDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function prepareVisionBuffer(
  buffer: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (!mimeType.startsWith('image/')) return { buffer, mimeType };
  try {
    const sharp = (await import('sharp')).default;
    const resized = await sharp(buffer)
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { buffer: resized, mimeType: 'image/jpeg' };
  } catch {
    return { buffer, mimeType };
  }
}

async function callVisionJson(input: {
  system: string;
  userText: object;
  imageBuffer?: Buffer;
  mimeType?: string;
}): Promise<Record<string, unknown>> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 90_000 });
  const model = env.BENSON_ASK_MODEL;

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
  if (input.imageBuffer && input.mimeType?.startsWith('image/')) {
    const prepared = await prepareVisionBuffer(input.imageBuffer, input.mimeType);
    userContent.push({
      type: 'image_url',
      image_url: { url: imageDataUrl(prepared.buffer, prepared.mimeType), detail: 'high' },
    });
  }
  userContent.push({ type: 'text', text: JSON.stringify(input.userText) });

  const res = await client.chat.completions.create({
    model,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: userContent },
    ],
  });

  const raw = res.choices[0]?.message?.content ?? '{}';
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function analyzeWebsiteMedia(input: {
  originalFilename: string;
  mimeType: string;
  mediaKind: 'image' | 'video';
  imageBuffer?: Buffer;
}): Promise<WebsiteMediaAnalysis> {
  if (!env.OPENAI_API_KEY?.trim()) {
    return fallbackAnalysis(input);
  }

  try {
    const raw = await callVisionJson({
      system: SYSTEM_ANALYZE,
      userText: {
        task: 'Classify this upload for the KC Kellie website.',
        filename: input.originalFilename,
        mimeType: input.mimeType,
        mediaKind: input.mediaKind,
        instruction:
          input.mediaKind === 'image' && input.imageBuffer
            ? 'Look at the image first. If it is a TikTok/Instagram/app screenshot, say so in reasoning — do NOT describe food unless food is literally photographed.'
            : 'No image bytes — infer cautiously from filename only.',
      },
      imageBuffer: input.imageBuffer,
      mimeType: input.mimeType,
    });
    return normalizeAnalysisResponse(raw, input);
  } catch {
    return fallbackAnalysis(input);
  }
}

export async function reviseWebsiteDraftWithBenson(input: {
  originalFilename: string;
  mimeType: string;
  mediaKind: 'image' | 'video';
  imageBuffer?: Buffer;
  currentDraft: ExistingDraftContext;
  message: string;
}): Promise<WebsiteDraftRevision> {
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new Error('OpenAI is not configured — set OPENAI_API_KEY to revise drafts with Benson.');
  }

  const trimmed = input.message.trim();
  const instruction =
    trimmed ||
    'Look at this image first. If it is a TikTok/Instagram/app screenshot, classify it as social/screenshot/latest_posts — not food. Rewrite caption and alt text accurately.';

  const raw = await callVisionJson({
    system: SYSTEM_REVISE,
    userText: {
      task: 'Revise this website draft. Look at the image before reading the old draft text.',
      kellieInstruction: instruction,
      currentDraft: input.currentDraft,
      filename: input.originalFilename,
      mimeType: input.mimeType,
      mediaKind: input.mediaKind,
    },
    imageBuffer: input.imageBuffer,
    mimeType: input.mimeType,
  });

  const normalized = normalizeRevisionResponse(
    raw,
    input.currentDraft,
    instruction,
    input.originalFilename,
  );

  return {
    title: normalized.title,
    caption: normalized.caption,
    altText: normalized.altText,
    headline: normalized.headline,
    category: normalized.category,
    contentType: normalized.contentType,
    suggestedPlacement: normalized.suggestedPlacement,
    suggestedSectionId: normalized.sectionId,
    sectionId: normalized.sectionId,
    reasoning: normalized.reasoning,
    assistantReply: normalized.assistantReply,
    ctaLabel: normalized.ctaLabel,
    ctaHref: normalized.ctaHref,
  };
}
