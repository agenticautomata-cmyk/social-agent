import { z } from 'zod';
import {
  PLACEMENT_TO_SECTION,
  PLACEMENT_TO_SECTION_ALT,
  WEBSITE_CONTENT_TYPES,
  WEBSITE_PLACEMENTS,
  WEBSITE_SECTION_IDS,
  type WebsiteContentType,
  type WebsitePlacement,
  type WebsiteSectionId,
} from './constants.js';
import {
  captionLooksMislabeled,
  detectSocialScreenshot,
  socialScreenshotAltText,
  socialScreenshotCaption,
  socialScreenshotReasoning,
} from './detect-social-screenshot.js';

/** Loose schema — AI often omits fields; we merge with existing draft values. */
export const LooseAiRevisionSchema = z
  .object({
    title: z.string().optional(),
    caption: z.string().optional(),
    altText: z.string().optional(),
    headline: z.string().nullable().optional(),
    category: z.string().optional(),
    contentType: z.string().optional(),
    suggestedPlacement: z.string().optional(),
    sectionId: z.string().optional(),
    reasoning: z.string().optional(),
    assistantReply: z.string().optional(),
    ctaLabel: z.string().nullable().optional(),
    ctaHref: z.string().nullable().optional(),
  })
  .passthrough();

export type ExistingDraftContext = {
  title: string;
  sectionId: string;
  caption: string | null;
  altText: string | null;
  headline: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  bensonReasoning: string | null;
  category: string | null;
  contentType: string | null;
  suggestedPlacement: string | null;
};

export type NormalizedRevision = {
  title: string;
  caption: string;
  altText: string;
  headline: string | null;
  category: string;
  contentType: WebsiteContentType;
  suggestedPlacement: WebsitePlacement;
  sectionId: WebsiteSectionId;
  reasoning: string | null;
  assistantReply: string;
  ctaLabel: string | null;
  ctaHref: string | null;
};

const PLACEMENT_ALIASES: Record<string, WebsitePlacement> = {
  homepage_featured: 'homepage_featured',
  homepage_hero: 'homepage_featured',
  featured_content: 'about',
  latest_content: 'latest_content',
  latest_posts: 'latest_content',
  latest: 'latest_content',
  gallery: 'gallery',
  kc_finds: 'gallery',
  sponsor_highlight: 'sponsor_highlight',
  sponsor_highlights: 'sponsor_highlight',
  media_kit: 'media_kit',
  media_kit_cta: 'media_kit',
  about: 'about',
};

const SECTION_ALIASES: Record<string, WebsiteSectionId> = {
  homepage_featured: 'homepage_hero',
  homepage_hero: 'homepage_hero',
  featured_content: 'featured_content',
  latest_content: 'latest_posts',
  latest_posts: 'latest_posts',
  gallery: 'kc_finds',
  kc_finds: 'kc_finds',
  sponsor_highlight: 'sponsor_highlights',
  sponsor_highlights: 'sponsor_highlights',
  media_kit: 'media_kit_cta',
  media_kit_cta: 'media_kit_cta',
  about: 'featured_content',
};

export function parseContentType(value: string | null | undefined): WebsiteContentType {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return 'lifestyle';
  if (v === 'social' || v === 'social_screenshot' || v === 'image') return 'screenshot';
  if ((WEBSITE_CONTENT_TYPES as readonly string[]).includes(v)) {
    return v as WebsiteContentType;
  }
  if (v.includes('tiktok') || v.includes('instagram') || v.includes('screenshot')) return 'screenshot';
  return 'lifestyle';
}

export function parsePlacement(value: string | null | undefined): WebsitePlacement {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return 'latest_content';
  if (PLACEMENT_ALIASES[v]) return PLACEMENT_ALIASES[v];
  if ((WEBSITE_PLACEMENTS as readonly string[]).includes(v)) {
    return v as WebsitePlacement;
  }
  return 'latest_content';
}

export function parseSectionId(value: string | null | undefined): WebsiteSectionId | undefined {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return undefined;
  if (SECTION_ALIASES[v]) return SECTION_ALIASES[v];
  if ((WEBSITE_SECTION_IDS as readonly string[]).includes(v)) {
    return v as WebsiteSectionId;
  }
  return undefined;
}

export function resolveSectionForAnalysis(analysis: {
  contentType: WebsiteContentType;
  suggestedPlacement: WebsitePlacement;
  sectionId?: WebsiteSectionId;
}): WebsiteSectionId {
  if (analysis.sectionId && WEBSITE_SECTION_IDS.includes(analysis.sectionId)) {
    return analysis.sectionId;
  }
  return (
    PLACEMENT_TO_SECTION_ALT[analysis.contentType] ??
    PLACEMENT_TO_SECTION[analysis.suggestedPlacement] ??
    'latest_posts'
  );
}

/** Apply explicit user instructions over AI output. */
export function applyInstructionOverrides(
  userMessage: string,
  draft: Pick<NormalizedRevision, 'category' | 'contentType' | 'suggestedPlacement' | 'sectionId'>,
): Pick<NormalizedRevision, 'category' | 'contentType' | 'suggestedPlacement' | 'sectionId'> {
  const msg = userMessage.toLowerCase();
  let { category, contentType, suggestedPlacement, sectionId } = draft;

  if (/latest\s*posts?|put (?:this )?in latest/i.test(msg)) {
    suggestedPlacement = 'latest_content';
    sectionId = 'latest_posts';
  }
  if (/kc\s*finds?|put (?:this )?in kc/i.test(msg)) {
    suggestedPlacement = 'gallery';
    sectionId = 'kc_finds';
  }
  if (/sponsor|partnership/i.test(msg) && !/not a sponsor|not sponsor/i.test(msg)) {
    suggestedPlacement = 'sponsor_highlight';
    sectionId = 'sponsor_highlights';
  }
  if (/homepage|hero|featured/i.test(msg) && !/not/i.test(msg)) {
    suggestedPlacement = 'homepage_featured';
    sectionId = 'homepage_hero';
  }

  if (
    /tiktok.*profile|profile.*screenshot|tiktok.*grid|tiktok profile|tiktok analytics|instagram screenshot|social screenshot/i.test(
      msg,
    )
  ) {
    category = 'social';
    contentType = 'screenshot';
    if (!/latest\s*posts?|kc finds|sponsor|homepage/i.test(msg)) {
      suggestedPlacement = 'latest_content';
      sectionId = 'latest_posts';
    }
  }

  return { category, contentType, suggestedPlacement, sectionId };
}

function applySocialScreenshotGuard<
  T extends {
    category: string;
    contentType: WebsiteContentType;
    suggestedPlacement: WebsitePlacement;
    sectionId: WebsiteSectionId;
    caption: string;
    altText: string;
    reasoning: string | null;
  },
>(
  draft: T,
  sources: { userMessage?: string; filename?: string; raw?: Record<string, unknown> },
): T {
  const raw = sources.raw ?? {};
  const detection = detectSocialScreenshot({
    userMessage: sources.userMessage,
    filename: sources.filename,
    category: typeof raw.category === 'string' ? raw.category : draft.category,
    contentType: typeof raw.contentType === 'string' ? raw.contentType : draft.contentType,
    caption: typeof raw.caption === 'string' ? raw.caption : draft.caption,
    altText: typeof raw.altText === 'string' ? raw.altText : draft.altText,
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : draft.reasoning,
    title: typeof raw.title === 'string' ? raw.title : null,
  });

  if (!detection) return draft;

  return {
    ...draft,
    category: 'social',
    contentType: 'screenshot',
    suggestedPlacement: 'latest_content',
    sectionId: 'latest_posts',
    caption: captionLooksMislabeled(draft.caption)
      ? socialScreenshotCaption(detection)
      : draft.caption,
    altText:
      captionLooksMislabeled(draft.altText) || !draft.altText.trim()
        ? socialScreenshotAltText(detection)
        : draft.altText,
    reasoning: socialScreenshotReasoning(detection),
  };
}

export function normalizeRevisionResponse(
  raw: Record<string, unknown>,
  existing: ExistingDraftContext,
  userMessage = '',
  filename = '',
): NormalizedRevision {
  const parsed = LooseAiRevisionSchema.safeParse(raw);
  const ai = parsed.success ? parsed.data : {};

  const contentType = parseContentType(ai.contentType ?? existing.contentType);
  const suggestedPlacement = parsePlacement(ai.suggestedPlacement ?? existing.suggestedPlacement);
  const sectionId = resolveSectionForAnalysis({
    contentType,
    suggestedPlacement,
    sectionId: parseSectionId(ai.sectionId ?? existing.sectionId),
  });

  let normalized: NormalizedRevision = {
    title: ai.title?.trim() || existing.title,
    caption: ai.caption?.trim() || existing.caption?.trim() || 'KC Kellie creator content.',
    altText: ai.altText?.trim() || existing.altText?.trim() || existing.title,
    headline: ai.headline ?? existing.headline ?? null,
    category: ai.category?.trim() || existing.category?.trim() || 'social',
    contentType,
    suggestedPlacement,
    sectionId,
    reasoning: ai.reasoning?.trim() || existing.bensonReasoning,
    assistantReply:
      ai.assistantReply?.trim() ||
      'Updated the draft based on your instructions.',
    ctaLabel: ai.ctaLabel ?? existing.ctaLabel ?? null,
    ctaHref: ai.ctaHref ?? existing.ctaHref ?? null,
  };

  const overrides = applyInstructionOverrides(userMessage, normalized);
  normalized = {
    ...normalized,
    ...overrides,
    sectionId: overrides.sectionId ?? normalized.sectionId,
  };

  return applySocialScreenshotGuard(normalized, { userMessage, filename, raw });
}

export function classifyScreenshotFromInstructions(userMessage: string): Partial<NormalizedRevision> | null {
  if (
    !/tiktok.*profile|profile.*screenshot|tiktok.*grid|tiktok profile|tiktok analytics|instagram screenshot/i.test(
      userMessage.toLowerCase(),
    )
  ) {
    return null;
  }
  return {
    category: 'social',
    contentType: 'screenshot',
    suggestedPlacement: 'latest_content',
    sectionId: 'latest_posts',
  };
}

export type NormalizedAnalysis = {
  category: string;
  caption: string;
  altText: string;
  contentType: WebsiteContentType;
  suggestedPlacement: WebsitePlacement;
  suggestedSectionId: WebsiteSectionId;
  reasoning: string | null;
  headline: string | null;
};

/** Merge loose AI upload analysis with safe defaults — never throws on missing fields. */
export function normalizeAnalysisResponse(
  raw: Record<string, unknown>,
  fallback: { originalFilename: string; mediaKind: 'image' | 'video' },
): NormalizedAnalysis {
  const parsed = LooseAiRevisionSchema.safeParse(raw);
  const ai = parsed.success ? parsed.data : {};

  const contentType = parseContentType(ai.contentType);
  const suggestedPlacement = parsePlacement(ai.suggestedPlacement);
  const suggestedSectionId = resolveSectionForAnalysis({
    contentType,
    suggestedPlacement,
    sectionId: parseSectionId(ai.sectionId),
  });

  const defaultCaption =
    fallback.mediaKind === 'video'
      ? 'New video from Kellie — Kansas City creator content.'
      : 'New photo from Kellie — Kansas City creator content.';

  const headline = ai.headline ?? null;
  const guarded = applySocialScreenshotGuard(
    {
      category: ai.category?.trim() || 'social',
      caption: ai.caption?.trim() || defaultCaption,
      altText: ai.altText?.trim() || `Kellie creator content — ${fallback.originalFilename}`,
      contentType,
      suggestedPlacement,
      sectionId: suggestedSectionId,
      reasoning: ai.reasoning?.trim() ?? null,
    },
    { filename: fallback.originalFilename, raw },
  );

  return {
    ...guarded,
    suggestedSectionId: guarded.sectionId,
    headline,
  };
}

export function placementToUiLabel(placement: string | null | undefined): string {
  const aliases: Record<string, string> = {
    latest_content: 'latest_posts',
    sponsor_highlight: 'sponsor_highlights',
    gallery: 'kc_finds',
    about: 'homepage_featured',
  };
  if (!placement) return 'latest_posts';
  return aliases[placement] ?? placement;
}

export function formatRevisionError(err: unknown): string {
  if (err instanceof z.ZodError) {
    return 'Benson returned an incomplete response. Your existing draft fields were preserved — try again or edit below.';
  }
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes('invalid_type') || msg.includes('expected string')) {
      return 'Benson revision failed validation. Try again or edit the classification fields manually.';
    }
    if (msg.startsWith('[') && msg.includes('"code"')) {
      return 'Benson revision failed. Try again or edit the fields below manually.';
    }
    return msg;
  }
  return 'Revision failed — please try again.';
}

export const WEBSITE_CONTENT_TYPE_OPTIONS = [
  ...WEBSITE_CONTENT_TYPES,
  'screenshot',
  'social',
] as const;

export const WEBSITE_PLACEMENT_OPTIONS = [
  'homepage_featured',
  'latest_posts',
  'latest_content',
  'kc_finds',
  'gallery',
  'sponsor_highlights',
  'sponsor_highlight',
  'media_kit',
  'about',
] as const;
