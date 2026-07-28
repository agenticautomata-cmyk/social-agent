import type { ExtractedNewsletterItem } from './types.js';

const NEWS_WEATHER_ALERT_PATTERNS = [
  /\bheat advisory\b/i,
  /\bexcessive heat\b/i,
  /\bheat warning\b/i,
  /\bheat index\b/i,
  /\bweather advisory\b/i,
  /\bsevere weather\b/i,
  /\bthunderstorm warning\b/i,
  /\btornado watch\b/i,
  /\btornado warning\b/i,
  /\bwinter weather advisory\b/i,
  /\bflash flood\b/i,
  /\bair quality alert\b/i,
  /\btraffic alert\b/i,
  /\broad (?:closure|work)\b/i,
  /\bcrime (?:report|alert|watch)\b/i,
  /\bshooting (?:report|victim)\b/i,
  /\bpublic safety alert\b/i,
  /\bemergency alert\b/i,
  /\bamber alert\b/i,
  /\bbreaking news\b/i,
  /\blatest headlines\b/i,
  /\bpolitical update\b/i,
  /\belection (?:update|results)\b/i,
  /\blegislative update\b/i,
  /\bnews roundup\b/i,
  /\bdaily briefing\b/i,
];

const NEWS_SENDER_DOMAINS = new Set([
  'kcur.org',
  'flatlandkc.org',
  'kansascity.com',
  'thepitchkc.com',
  'kansascitydefender.com',
  'axios.com',
  'npr.org',
]);

export function isNewsWeatherAlertContent(input: {
  subject?: string;
  bodyText?: string;
  item?: ExtractedNewsletterItem;
}): boolean {
  const blob = [
    input.subject ?? '',
    input.bodyText ?? '',
    input.item?.title ?? '',
    input.item?.description ?? '',
    input.item?.entityName ?? '',
  ].join('\n');

  return NEWS_WEATHER_ALERT_PATTERNS.some((p) => p.test(blob));
}

export function isNewsSignalOnlySender(senderDomain: string): boolean {
  const root = senderDomain.replace(/^www\./, '').toLowerCase();
  return NEWS_SENDER_DOMAINS.has(root) || [...NEWS_SENDER_DOMAINS].some((d) => root.endsWith(`.${d}`));
}

export function shouldRejectAsNewsSignal(input: {
  subject: string;
  bodyText?: string;
  item: ExtractedNewsletterItem;
  senderDomain: string;
}): { reject: boolean; reason: string } | null {
  if (isNewsWeatherAlertContent(input)) {
    return { reject: true, reason: 'news_weather_alert' };
  }

  const isNewsPublisher = isNewsSignalOnlySender(input.senderDomain);
  const hasEventSignals =
    Boolean(input.item.startDate) ||
    Boolean(input.item.ticketLink) ||
    /concert|festival|tickets?|show\b|performance|opening\b|happy hour|tasting\b/i.test(
      `${input.item.title} ${input.item.description ?? ''}`,
    );

  if (isNewsPublisher && !hasEventSignals && input.item.layer === 'occurrence') {
    const looksLikeNews =
      /advisory|alert|report|update|headline|weather|crime|traffic|politic/i.test(
        `${input.item.title} ${input.item.entityName}`,
      );
    if (looksLikeNews) {
      return { reject: true, reason: 'general_news_story' };
    }
  }

  return null;
}
