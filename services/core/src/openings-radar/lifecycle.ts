import type { OpeningLifecycleStatus } from './types.js';

const ORDER: OpeningLifecycleStatus[] = [
  'rumored',
  'announced',
  'site_identified',
  'under_construction',
  'opening_soon',
  'soft_open',
  'grand_opening_scheduled',
  'open',
  'delayed',
  'relocated',
  'expanding',
  'canceled',
  'closed',
  'needs_verification',
];

export function shouldRecordStatusTransition(
  from: OpeningLifecycleStatus | null | undefined,
  to: OpeningLifecycleStatus,
): boolean {
  if (!from) return true;
  return from !== to;
}

export function mergeLifecycleStatus(
  current: OpeningLifecycleStatus,
  incoming: OpeningLifecycleStatus,
): OpeningLifecycleStatus {
  // Prefer more advanced opening progress; preserve delayed/canceled/conflict as explicit.
  if (incoming === 'delayed' || incoming === 'canceled' || incoming === 'closed') return incoming;
  if (current === 'delayed' && incoming !== 'open' && incoming !== 'soft_open') return 'delayed';
  const ci = ORDER.indexOf(current);
  const ii = ORDER.indexOf(incoming);
  if (ii < 0) return current;
  if (ci < 0) return incoming;
  // expanding/relocated are additive overlays — keep if already further along
  if (incoming === 'expanding' || incoming === 'relocated') {
    if (['open', 'soft_open', 'grand_opening_scheduled'].includes(current)) return current;
    return incoming;
  }
  return ii >= ci ? incoming : current;
}
