/**
 * Legitimate public surfaces for openings roundups (Facebook embed plugin, Substack API/RSS).
 * Never bypasses login/CAPTCHA/paywall.
 */
import { stripTrackingParams } from '../newsletter-intelligence/editorial-opportunity/canonical-url.js';

const USER_AGENT = 'BensonEditorialBot/1.0 (+https://kckellie.com; editorial research; respects robots)';
const FETCH_MS = 20_000;

export const BIG_LIST_FACEBOOK_URL =
  'https://www.facebook.com/JoyceKC/posts/the-big-list-whos-opening-where-when-reporter-note-im-building-my-list-of-restau/1411296867799347/';

export const BIG_LIST_FACEBOOK_POST_ID = '1411296867799347';

export const KCINSIDERS_SUBSTACK_HOME = 'https://kcinsiders.substack.com';
export const KCINSIDERS_SUBSTACK_FEED = 'https://kcinsiders.substack.com/feed';
export const KCINSIDERS_SUBSTACK_PUB = 'https://open.substack.com/pub/kcinsiders';
export const JOYCEINKC_PROFILE = 'https://substack.com/@joyceinkc';

export type PublicSocialFetchResult = {
  url: string;
  access: 'fetched' | 'blocked' | 'empty';
  title: string | null;
  text: string | null;
  publishedAt: string | null;
  blockedReason?: string;
};

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p\b[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#x2019;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function facebookPostIdFromUrl(url: string): string | null {
  const m =
    url.match(/\/posts\/[^/]+\/(\d{8,})\/?/) ||
    url.match(/\/posts\/(\d{8,})\/?/) ||
    url.match(/story_fbid=(\d{8,})/) ||
    url.match(/\/(\d{10,})\/?(?:\?|$)/);
  return m?.[1] ?? null;
}

/**
 * Public Facebook post plugin — no login. Returns post body when Facebook exposes it.
 */
export async function fetchFacebookPublicPost(url: string): Promise<PublicSocialFetchResult> {
  const cleaned = stripTrackingParams(url.trim());
  const postId = facebookPostIdFromUrl(cleaned);
  if (!postId) {
    return {
      url: cleaned,
      access: 'blocked',
      title: null,
      text: null,
      publishedAt: null,
      blockedReason: 'unrecognized_facebook_post_url',
    };
  }

  const pluginUrl =
    `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(
      `https://www.facebook.com/JoyceKC/posts/${postId}`,
    )}&show_text=true&width=500`;

  try {
    const res = await fetch(pluginUrl, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: AbortSignal.timeout(FETCH_MS),
      redirect: 'follow',
    });
    if (!res.ok) {
      return {
        url: cleaned,
        access: 'blocked',
        title: null,
        text: null,
        publishedAt: null,
        blockedReason: `http_${res.status}`,
      };
    }
    const html = await res.text();
    const text = htmlToText(html);
    const start = text.search(/The BIG LIST|Who.?s Opening|opening soon|grand opening/i);
    const body = start >= 0 ? text.slice(start, start + 8_000) : text.slice(0, 8_000);
    const cleanedBody = body
      .replace(/\bSee more\b[\s\S]*$/i, '')
      .replace(/\bfunction envFlush[\s\S]*$/i, '')
      .trim();
    if (cleanedBody.length < 80) {
      return {
        url: cleaned,
        access: 'empty',
        title: null,
        text: null,
        publishedAt: null,
        blockedReason: 'facebook_embed_empty',
      };
    }
    const titleMatch = cleanedBody.match(/^(.{10,120}?)(?:\s+Reporter note:|\s+\d+\.)/i);
    return {
      url: cleaned,
      access: 'fetched',
      title: titleMatch?.[1]?.trim() ?? 'Facebook openings roundup',
      text: cleanedBody,
      publishedAt: null,
    };
  } catch (err) {
    return {
      url: cleaned,
      access: 'blocked',
      title: null,
      text: null,
      publishedAt: null,
      blockedReason: err instanceof Error ? err.message.slice(0, 160) : 'fetch_failed',
    };
  }
}

export type SubstackFeedItem = {
  title: string;
  url: string;
  publishedAt: string | null;
  summary: string | null;
};

/** Parse Substack RSS/Atom for recent posts (no browser). */
export async function fetchSubstackFeed(feedUrl = KCINSIDERS_SUBSTACK_FEED): Promise<{
  access: 'fetched' | 'blocked';
  items: SubstackFeedItem[];
  blockedReason?: string;
}> {
  try {
    const res = await fetch(feedUrl, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(FETCH_MS),
      redirect: 'follow',
    });
    if (!res.ok) {
      return { access: 'blocked', items: [], blockedReason: `http_${res.status}` };
    }
    const xml = await res.text();
    const items: SubstackFeedItem[] = [];
    const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
    for (const block of blocks.slice(0, 40)) {
      const title =
        block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i)?.[1] ??
        block.match(/<title>([^<]*)<\/title>/i)?.[1] ??
        '';
      const link =
        block.match(/<link>([^<]+)<\/link>/i)?.[1] ??
        block.match(/<link[^>]+href="([^"]+)"/i)?.[1] ??
        '';
      const publishedAt =
        block.match(/<pubDate>([^<]+)<\/pubDate>/i)?.[1] ??
        block.match(/<published>([^<]+)<\/published>/i)?.[1] ??
        null;
      const summary =
        block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i)?.[1] ??
        block.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/i)?.[1] ??
        block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] ??
        null;
      if (title && link) {
        items.push({
          title: htmlToText(title).trim(),
          url: link.trim(),
          publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
          summary: summary ? htmlToText(summary).slice(0, 20_000) : null,
        });
      }
    }
    return { access: 'fetched', items };
  } catch (err) {
    return {
      access: 'blocked',
      items: [],
      blockedReason: err instanceof Error ? err.message.slice(0, 160) : 'fetch_failed',
    };
  }
}

/** Substack public post JSON API. */
export async function fetchSubstackPost(urlOrSlug: string): Promise<PublicSocialFetchResult> {
  let slug = urlOrSlug.trim();
  const slugMatch = slug.match(/\/p\/([a-z0-9-]+)/i);
  if (slugMatch) slug = slugMatch[1]!;
  const apiUrl = `${KCINSIDERS_SUBSTACK_HOME}/api/v1/posts/${slug}`;
  try {
    const res = await fetch(apiUrl, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_MS),
      redirect: 'follow',
    });
    if (!res.ok) {
      return {
        url: urlOrSlug,
        access: 'blocked',
        title: null,
        text: null,
        publishedAt: null,
        blockedReason: `http_${res.status}`,
      };
    }
    const data = (await res.json()) as {
      title?: string;
      body_html?: string;
      post_date?: string;
      canonical_url?: string;
    };
    const text = htmlToText(data.body_html ?? '');
    if (text.length < 40) {
      return {
        url: data.canonical_url ?? urlOrSlug,
        access: 'empty',
        title: data.title ?? null,
        text: null,
        publishedAt: data.post_date ?? null,
        blockedReason: 'empty_body',
      };
    }
    return {
      url: data.canonical_url ?? `${KCINSIDERS_SUBSTACK_HOME}/p/${slug}`,
      access: 'fetched',
      title: data.title ?? null,
      text,
      publishedAt: data.post_date ?? null,
    };
  } catch (err) {
    return {
      url: urlOrSlug,
      access: 'blocked',
      title: null,
      text: null,
      publishedAt: null,
      blockedReason: err instanceof Error ? err.message.slice(0, 160) : 'fetch_failed',
    };
  }
}
