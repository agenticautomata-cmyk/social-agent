export const ANALYTICS_CONNECTOR_PROVIDERS = [
  'tiktok',
  'facebook',
  'instagram',
  'youtube',
] as const;

export type AnalyticsConnectorProvider = (typeof ANALYTICS_CONNECTOR_PROVIDERS)[number];

export const ANALYTICS_PROVIDER_LABELS: Record<AnalyticsConnectorProvider, string> = {
  tiktok: 'TikTok',
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
};

/** Maps creator_platform_connections.platform → analytics connector provider */
export const CREATOR_PLATFORM_TO_ANALYTICS: Partial<
  Record<'tiktok' | 'instagram' | 'youtube_shorts' | 'facebook', AnalyticsConnectorProvider>
> = {
  tiktok: 'tiktok',
  instagram: 'instagram',
  youtube_shorts: 'youtube',
  facebook: 'facebook',
};
