import {
  CalendarClock,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  Wand2,
  Film,
  Layers,
  Send,
  AlertTriangle,
  Ban,
  Eye,
  type LucideIcon,
} from 'lucide-react';

const STATE_STYLES: Record<
  string,
  { bg: string; text: string; ring: string; label: string; icon: LucideIcon }
> = {
  planned:           { bg: 'bg-zinc-800/60',     text: 'text-zinc-300',    ring: 'ring-zinc-700/40',    label: 'Planned',           icon: CalendarClock },
  script_drafted:    { bg: 'bg-amber-500/10',    text: 'text-amber-400',   ring: 'ring-amber-500/20',   label: 'Awaiting approval', icon: Eye },
  script_approved:   { bg: 'bg-sky-500/10',      text: 'text-sky-400',     ring: 'ring-sky-500/20',     label: 'Approved',          icon: CheckCircle2 },
  script_rejected:   { bg: 'bg-rose-500/10',     text: 'text-rose-400',    ring: 'ring-rose-500/20',    label: 'Rejected',          icon: XCircle },
  assets_ready:      { bg: 'bg-sky-500/10',      text: 'text-sky-400',     ring: 'ring-sky-500/20',     label: 'Assets ready',      icon: Sparkles },
  video_generating:  { bg: 'bg-violet-500/10',   text: 'text-violet-400',  ring: 'ring-violet-500/20',  label: 'Generating',        icon: Wand2 },
  video_ready:       { bg: 'bg-violet-500/10',   text: 'text-violet-400',  ring: 'ring-violet-500/20',  label: 'Video ready',       icon: Film },
  post_production:   { bg: 'bg-violet-500/10',   text: 'text-violet-400',  ring: 'ring-violet-500/20',  label: 'Post-prod',         icon: Layers },
  ready_to_publish:  { bg: 'bg-emerald-500/10',  text: 'text-emerald-400', ring: 'ring-emerald-500/20', label: 'Ready',             icon: CheckCircle2 },
  scheduled:         { bg: 'bg-emerald-500/10',  text: 'text-emerald-400', ring: 'ring-emerald-500/20', label: 'Scheduled',         icon: Clock },
  published:         { bg: 'bg-emerald-500/15',  text: 'text-emerald-300', ring: 'ring-emerald-500/30', label: 'Published',         icon: Send },
  failed:            { bg: 'bg-rose-500/10',     text: 'text-rose-400',    ring: 'ring-rose-500/20',    label: 'Failed',            icon: AlertTriangle },
  cancelled:         { bg: 'bg-zinc-800/60',     text: 'text-zinc-500',    ring: 'ring-zinc-700/40',    label: 'Cancelled',         icon: Ban },
};

export function StatePill({ state, size = 'md' }: { state: string; size?: 'sm' | 'md' }) {
  const style = STATE_STYLES[state] ?? {
    bg: 'bg-zinc-800',
    text: 'text-zinc-400',
    ring: 'ring-zinc-700/40',
    label: state,
    icon: Clock,
  };
  const Icon = style.icon;
  const padding = size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1';
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ring-1 ${style.bg} ${style.text} ${style.ring} ${padding} ${textSize} font-medium whitespace-nowrap`}>
      <Icon className={iconSize} strokeWidth={2.25} />
      {style.label}
    </span>
  );
}
