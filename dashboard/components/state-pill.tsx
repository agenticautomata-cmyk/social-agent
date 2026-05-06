// Status as bracketed text. No shape, no fill. The bracket characters are the
// design — sourced from system logs, not Material You.

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

const STATE_LABEL: Record<string, string> = {
  planned: 'planned',
  script_drafted: 'awaiting_approval',
  script_approved: 'approved',
  script_rejected: 'rejected',
  assets_ready: 'assets_ready',
  video_generating: 'generating',
  video_ready: 'video_ready',
  post_production: 'post_production',
  ready_to_publish: 'ready',
  scheduled: 'scheduled',
  published: 'published',
  failed: 'failed',
  cancelled: 'cancelled',
};

export function StatePill({ state }: { state: string; size?: 'sm' | 'md' }) {
  const tone = STATE_TONE[state] ?? 'text-paper-muted';
  const label = STATE_LABEL[state] ?? state;
  return (
    <span className={`bracket whitespace-nowrap ${tone}`}>
      {label}
    </span>
  );
}
