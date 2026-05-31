export type PreAlphaStatus = {
  ok: boolean;
  demoMode: boolean;
  database: 'ok' | 'error';
  outreach: { mode: 'live' | 'simulate'; liveEnabled: boolean };
  safety: { liveSendBlocked: boolean; preAlphaReady: boolean };
};

export type PreAlphaHome = {
  demoMode: boolean;
  greeting: string;
  subline: string;
  priorities: Array<{ rank: number; label: string; href: string | null }>;
  quickLinks: Array<{ href: string; label: string; description: string }>;
  stats: {
    openActions: number;
    overdueActions: number;
    pipelineValue: number;
    openDeals: number;
    outreachMode: string;
  };
  systemOk: boolean;
};

export const NOT_USEFUL_REASONS = [
  { code: 'wrong_timing', label: 'Wrong timing' },
  { code: 'wrong_sponsor_fit', label: 'Wrong sponsor fit' },
  { code: 'already_covered', label: 'Already covered' },
  { code: 'missing_context', label: 'Missing context' },
  { code: 'low_confidence', label: 'Too low confidence' },
  { code: 'other', label: 'Other' },
] as const;
