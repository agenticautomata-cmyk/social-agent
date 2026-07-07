export type PlaybookSourceRecord = {
  id: string;
  slug: string;
  name: string;
  category: string;
  notes: string | null;
  document: {
    id: string;
    title: string;
    chunkCount: number;
    pageCount: number | null;
    ingestedAt: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type PlaybookQuickAction = {
  id: string;
  slug: string;
  label: string;
  prompt: string;
  capability: string;
  sourceSlug: string | null;
  sortOrder: number;
};

export type PlaybookAskResponse = {
  answer: string;
  sources: Array<{
    sourceName: string;
    documentTitle: string;
    pageNumber: number | null;
    sectionTitle: string | null;
  }>;
  groundedInPlaybook: boolean;
  usedGeneralStrategy: boolean;
  usedAnalytics: boolean;
  capability: string;
};

export const PLAYBOOK_CATEGORY = 'TikTok Creator Playbook';

export const SCRIPT_FORMAT_OPTIONS = [
  { value: 'food-review', label: 'Food review' },
  { value: 'thrift-find', label: 'Thrift find' },
  { value: 'store-walkthrough', label: 'Store walkthrough' },
  { value: 'kc-event', label: 'KC event' },
  { value: 'product-review', label: 'Product review' },
  { value: 'talking-head', label: 'Talking head' },
] as const;
