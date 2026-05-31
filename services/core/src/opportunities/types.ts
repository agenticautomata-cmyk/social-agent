import type { ContentItem } from '../schema.js';

/** Benson DTO over content_items — DB schema unchanged. */
export type Opportunity = Omit<ContentItem, 'topic' | 'hook' | 'script'> & {
  title: string;
  angle: string | null;
  summary: string | null;
};
