export type MonitoringMode =
  | 'SINGLE_ITEM'
  | 'WATCH_PAGE'
  | 'WATCH_PUBLISHER'
  | 'WATCH_ACCOUNT'
  | 'WATCH_FEED'
  | 'WATCH_DOCUMENT_INDEX';

export type ScoutPlatform =
  | 'web'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'rss'
  | 'pdf'
  | 'unknown';

export type UrlInspectResult = {
  submittedUrl: string;
  canonicalUrl: string;
  platform: ScoutPlatform;
  sourceType: string;
  titleGuess: string;
  isSingleItem: boolean;
  publisherUrl: string | null;
  publisherName: string | null;
  monitoringModes: MonitoringMode[];
  recommendedMode: MonitoringMode;
  extractionMethod: string;
  checkFrequencyHours: number;
  loginRequired: boolean;
  sourceReliability: number;
  creatorLeadPotential: number;
  explanation: string;
};

export type WatchlistCard = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  platform: string;
  monitoringMode: MonitoringMode;
  enabled: boolean;
  paused: boolean;
  healthStatus: string;
  sessionStatus: string | null;
  lastSuccessfulCheck: string | null;
  lastNewItemDetected: string | null;
  latestContentDate: string | null;
  qualifiedThisWeek: number;
  hiddenNoise: number;
  fetchMethod: string | null;
  nextCheckEstimate: string | null;
};

export type ScoutItemView = {
  id: string;
  watcherId: string;
  itemUrl: string;
  itemType: string;
  captionText: string | null;
  detectedAt: string;
  creatorValueStatus: string;
  verificationStatus: string;
  linkedEarlySignalId: string | null;
  relevanceExplanation: Record<string, unknown>;
};
