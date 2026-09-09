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
  needsSetup?: boolean;
  setupReason?: string | null;
};

export type WatchlistReachability = 'reachable' | 'redirected' | 'blocked' | 'failed' | 'unknown';

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
  canonicalKey: string | null;
  lastAttemptedCheck?: string | null;
  displayHealth?: string;
  statusExplanation?: string | null;
  reachability?: WatchlistReachability | null;
  lastResolvedUrl?: string | null;
  adapterType?: string | null;
  sourceCategory?: string | null;
  itemsProcessed?: number;
  recordsExtracted?: number;
  newRecordsFound?: number;
  verifiedYield?: number;
  lastSuccessfulExtractionAt?: string | null;
  supportsReprocessLatestPost?: boolean;
  supportsRerunLatestCheck?: boolean;
  metricsLabel?: 'posts' | 'pages';
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
