// Status as bracketed text. No shape, no fill. The bracket characters are the
// design — sourced from system logs, not Material You.

import { displayState } from '../lib/terminology.browser';

const STATE_TONE: Record<string, string> = {
  planned:           'text-paper-muted',
  script_drafted:    'text-signal-warn',
  script_approved:   'text-paper-ink',
  script_rejected:   'text-signal-alert',
  assets_ready:      'text-paper-ink',
  video_generating:  'text-paper-ink',
  video_ready:       'text-paper-ink',
  post_production:   'text-paper-ink',
  ready_to_publish:  'text-accent',
  scheduled:         'text-accent',
  published:         'text-accent font-bold',
  failed:            'text-signal-alert',
  cancelled:         'text-paper-dim',
};

export function StatePill({ state }: { state: string; size?: 'sm' | 'md' }) {
  const tone = STATE_TONE[state] ?? 'text-paper-muted';
  const label = displayState(state);
  return (
    <span className={`bracket whitespace-nowrap ${tone}`}>
      {label}
    </span>
  );
}
