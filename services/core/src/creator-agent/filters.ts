import type { InventoryItem } from '../inventory/normalize.js';
import {
  ACTIVE_LIFECYCLE_STATUSES,
  KELLIE_VISIBLE_CREATOR_STATUSES,
  type CreatorValueStatus,
  type LifecycleStatus,
} from './types.js';
import { loadActiveSuppressions, recordMatchesSuppression } from './entity-suppression.js';

export type CreatorFacingRecord = {
  id: string;
  title: string;
  businessName?: string | null;
  summary?: string | null;
  sourceUrl?: string | null;
  creatorValueStatus?: CreatorValueStatus | null;
  lifecycleStatus?: LifecycleStatus | null;
};

export async function filterCreatorFacingRecords<T extends CreatorFacingRecord>(
  records: T[],
  options?: {
    includeArchived?: boolean;
    includeSuppressed?: boolean;
    allowedCreatorStatuses?: CreatorValueStatus[];
    allowedLifecycleStatuses?: LifecycleStatus[];
  },
): Promise<T[]> {
  const suppressions = options?.includeSuppressed ? [] : await loadActiveSuppressions();
  const allowedCreator =
    options?.allowedCreatorStatuses ?? KELLIE_VISIBLE_CREATOR_STATUSES;
  const allowedLifecycle =
    options?.allowedLifecycleStatuses ??
    (options?.includeArchived
      ? undefined
      : ACTIVE_LIFECYCLE_STATUSES);

  return records.filter((record) => {
    if (
      record.creatorValueStatus &&
      !allowedCreator.includes(record.creatorValueStatus)
    ) {
      return false;
    }
    if (
      allowedLifecycle &&
      record.lifecycleStatus &&
      !allowedLifecycle.includes(record.lifecycleStatus)
    ) {
      return false;
    }
    if (!options?.includeSuppressed) {
      const hit = recordMatchesSuppression({
        title: record.title,
        businessName: record.businessName,
        summary: record.summary,
        sourceUrl: record.sourceUrl,
        suppressions,
      });
      if (hit) return false;
    }
    return true;
  });
}

export function inventoryItemIsCreatorFacing(item: InventoryItem): boolean {
  const creatorStatus = (item as InventoryItem & { creatorValueStatus?: CreatorValueStatus })
    .creatorValueStatus;
  const lifecycleStatus = (item as InventoryItem & { lifecycleStatus?: LifecycleStatus })
    .lifecycleStatus;

  if (creatorStatus && !KELLIE_VISIBLE_CREATOR_STATUSES.includes(creatorStatus)) {
    return false;
  }
  if (lifecycleStatus && !ACTIVE_LIFECYCLE_STATUSES.includes(lifecycleStatus)) {
    return false;
  }
  return true;
}

export function stripSuppressedMentions(text: string, suppressions: Awaited<ReturnType<typeof loadActiveSuppressions>>): string {
  let out = text;
  for (const row of suppressions) {
    for (const phrase of [row.canonicalName, ...row.aliases]) {
      if (!phrase.trim()) continue;
      const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      out = out.replace(re, '');
    }
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}
