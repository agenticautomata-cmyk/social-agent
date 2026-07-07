/** Heuristic detection when vision mislabels app screenshots as food/lifestyle photos. */

const SOCIAL_UI_SIGNALS =
  /\b(tiktok|instagram|insta(?:gram)?|social media|profile (?:page|grid|screenshot)|video grid|for you page|fyp|followers?|following|likes?\s*count|view\s*count|creator (?:tools|dashboard|analytics)|analytics (?:dashboard|screenshot)|inbox screenshot|dm screenshot|app (?:ui|screenshot)|phone screenshot|status bar|@[\w.]{2,})\b/i;

const TIKTOK_SIGNALS =
  /\b(tiktok|for you page|fyp|tik tok|profile grid with play buttons)\b/i;

const INSTAGRAM_SIGNALS = /\b(instagram|insta(?:gram)?|reels grid|story highlight)\b/i;

const ANALYTICS_SIGNALS =
  /\b(analytics|insights|dashboard|views?\s*over|watch time|audience|metrics|stats|performance)\b/i;

const FOOD_MISLABEL_SIGNALS =
  /\b(food|dish|plate|plated|culinary|restaurant|meal|dining|recipe|cuisine|brunch|dinner)\b/i;

const PROFILE_SIGNALS = /\b(profile|grid|bio|follow(?:er|ing)|username)\b/i;

export type SocialScreenshotDetection = {
  detected: boolean;
  platform: 'tiktok' | 'instagram' | 'social';
  kind: 'profile' | 'analytics' | 'grid' | 'screenshot';
};

function combinedText(sources: {
  userMessage?: string;
  filename?: string;
  fields?: Array<string | null | undefined>;
}): string {
  return [
    sources.userMessage ?? '',
    sources.filename ?? '',
    ...(sources.fields ?? []),
  ]
    .join(' ')
    .toLowerCase();
}

export function detectSocialScreenshot(sources: {
  userMessage?: string;
  filename?: string;
  category?: string | null;
  contentType?: string | null;
  caption?: string | null;
  altText?: string | null;
  reasoning?: string | null;
  title?: string | null;
}): SocialScreenshotDetection | null {
  const text = combinedText({
    userMessage: sources.userMessage,
    filename: sources.filename,
    fields: [
      sources.category,
      sources.contentType,
      sources.caption,
      sources.altText,
      sources.reasoning,
      sources.title,
    ],
  });

  const hasSocialUi = SOCIAL_UI_SIGNALS.test(text);
  const hasTiktok = TIKTOK_SIGNALS.test(text) || /\btiktok\b/i.test(sources.filename ?? '');
  const hasInstagram =
    INSTAGRAM_SIGNALS.test(text) || /\binsta(?:gram)?\b/i.test(sources.filename ?? '');
  const explicitScreenshot =
    /\bscreenshot\b/i.test(text) ||
    /\bscreenshot\b/i.test(sources.filename ?? '') ||
    sources.contentType?.toLowerCase() === 'screenshot';

  if (!hasSocialUi && !(explicitScreenshot && (hasTiktok || hasInstagram))) {
    return null;
  }

  const platform = hasTiktok ? 'tiktok' : hasInstagram ? 'instagram' : 'social';
  const kind = ANALYTICS_SIGNALS.test(text)
    ? 'analytics'
    : PROFILE_SIGNALS.test(text) || hasTiktok || hasInstagram
      ? 'profile'
      : 'screenshot';

  return { detected: true, platform, kind };
}

export function socialScreenshotCaption(detection: SocialScreenshotDetection): string {
  if (detection.platform === 'tiktok') {
    if (detection.kind === 'analytics') {
      return "Kellie's TikTok analytics snapshot — Kansas City creator insights.";
    }
    return "Kellie's TikTok profile — Kansas City creator content.";
  }
  if (detection.platform === 'instagram') {
    return "Kellie's Instagram screenshot — Kansas City creator content.";
  }
  return "Kellie's social media screenshot — Kansas City creator content.";
}

export function socialScreenshotAltText(detection: SocialScreenshotDetection): string {
  if (detection.platform === 'tiktok') {
    return detection.kind === 'analytics'
      ? 'Screenshot of TikTok analytics for KC Kellie'
      : 'Screenshot of TikTok profile for KC Kellie';
  }
  if (detection.platform === 'instagram') {
    return 'Screenshot of Instagram profile or grid for KC Kellie';
  }
  return 'Social media app screenshot for KC Kellie';
}

export function socialScreenshotReasoning(detection: SocialScreenshotDetection): string {
  const platform =
    detection.platform === 'tiktok'
      ? 'TikTok'
      : detection.platform === 'instagram'
        ? 'Instagram'
        : 'social media';
  const kind =
    detection.kind === 'analytics'
      ? 'analytics screenshot'
      : detection.kind === 'profile'
        ? 'profile/grid screenshot'
        : 'app screenshot';
  return `Detected ${platform} ${kind} — not a food or sponsor photo.`;
}

export function captionLooksMislabeled(caption: string | null | undefined): boolean {
  if (!caption?.trim()) return false;
  return FOOD_MISLABEL_SIGNALS.test(caption) && !SOCIAL_UI_SIGNALS.test(caption);
}
