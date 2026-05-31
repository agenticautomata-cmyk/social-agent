import type { ContentItem } from '../schema.js';
import type { Opportunity } from './types.js';

/** Map a content_items row to the Benson opportunity DTO (field rename only). */
export function contentItemToOpportunity(item: ContentItem): Opportunity {
  const { topic, hook, script, ...rest } = item;
  return {
    ...rest,
    title: topic,
    angle: hook,
    summary: script,
  };
}
