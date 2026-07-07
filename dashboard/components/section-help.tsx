'use client';

import { useId, useState, type ReactNode } from 'react';

function HelpButton({
  open,
  onToggle,
  label,
  controlsId,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  controlsId: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controlsId}
      aria-label={open ? 'Hide help' : label}
      title={label}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition ${
        open
          ? 'border-accent/50 bg-accent/15 text-accent'
          : 'border-white/20 bg-white/[0.06] text-paper-muted hover:border-white/30 hover:text-paper-ink'
      }`}
    >
      ?
    </button>
  );
}

function HelpPanel({ id, children }: { id: string; children: string }) {
  return (
    <p
      id={id}
      role="note"
      className="text-xs leading-relaxed text-paper-soft rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2.5"
    >
      {children}
    </p>
  );
}

type SectionHelpProps = {
  children: string;
  label?: string;
  className?: string;
};

/** Tap-to-reveal ? help — works on iPhone without hover. */
export function SectionHelp({
  children,
  label = 'How to use this section',
  className = '',
}: SectionHelpProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <span className={`inline-flex flex-col items-start gap-2 ${className}`}>
      <HelpButton
        open={open}
        onToggle={() => setOpen((v) => !v)}
        label={label}
        controlsId={panelId}
      />
      {open && <HelpPanel id={panelId}>{children}</HelpPanel>}
    </span>
  );
}

type SectionTitleRowProps = {
  title: ReactNode;
  subtitle?: string;
  help?: string;
  helpLabel?: string;
  actions?: React.ReactNode;
  titleClassName?: string;
};

/** Section header with optional ? help and trailing actions. */
export function SectionTitleRow({
  title,
  subtitle,
  help,
  helpLabel = 'How to use this section',
  actions,
  titleClassName = 'text-sm font-semibold text-paper-ink',
}: SectionTitleRowProps) {
  const [helpOpen, setHelpOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="flex min-w-0 w-full items-start gap-2 sm:flex-1">
          <div className="min-w-0 flex-1">
            <h2 className={titleClassName}>{title}</h2>
            {subtitle && (
              <p className="text-xs text-paper-dim mt-0.5 leading-relaxed break-words">{subtitle}</p>
            )}
          </div>
          {help && (
            <HelpButton
              open={helpOpen}
              onToggle={() => setHelpOpen((v) => !v)}
              label={helpLabel}
              controlsId={panelId}
            />
          )}
        </div>
        {actions ? (
          <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
      {helpOpen && help && <HelpPanel id={panelId}>{help}</HelpPanel>}
    </div>
  );
}
