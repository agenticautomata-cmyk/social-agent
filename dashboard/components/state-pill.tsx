const STATE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  planned:           { bg: 'bg-zinc-800',    text: 'text-zinc-300', label: 'Planned' },
  script_drafted:    { bg: 'bg-amber-900/40', text: 'text-amber-300', label: 'Awaiting approval' },
  script_approved:   { bg: 'bg-sky-900/40',   text: 'text-sky-300',   label: 'Approved' },
  script_rejected:   { bg: 'bg-rose-900/40',  text: 'text-rose-300',  label: 'Rejected' },
  assets_ready:      { bg: 'bg-sky-900/40',   text: 'text-sky-300',   label: 'Assets ready' },
  video_generating:  { bg: 'bg-violet-900/40',text: 'text-violet-300',label: 'Generating' },
  video_ready:       { bg: 'bg-violet-900/40',text: 'text-violet-300',label: 'Video ready' },
  post_production:   { bg: 'bg-violet-900/40',text: 'text-violet-300',label: 'Post-prod' },
  ready_to_publish:  { bg: 'bg-emerald-900/40',text:'text-emerald-300',label: 'Ready' },
  scheduled:         { bg: 'bg-emerald-900/40',text:'text-emerald-300',label: 'Scheduled' },
  published:         { bg: 'bg-emerald-700/40',text:'text-emerald-200',label: 'Published' },
  failed:            { bg: 'bg-rose-900/40',  text: 'text-rose-300',  label: 'Failed' },
  cancelled:         { bg: 'bg-zinc-800',    text: 'text-zinc-500',  label: 'Cancelled' },
};

export function StatePill({ state }: { state: string }) {
  const style = STATE_STYLES[state] ?? { bg: 'bg-zinc-800', text: 'text-zinc-400', label: state };
  return (
    <span className={`state-pill ${style.bg} ${style.text}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {style.label}
    </span>
  );
}
