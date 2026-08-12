'use client';

export default function SignalDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('[signals/id] route error boundary', error);
  return (
    <div className="page-shell max-w-3xl mx-auto space-y-4">
      <h1 className="page-title">Record could not be displayed</h1>
      <p className="page-subtitle">
        A client-side exception occurred while rendering this verification record. The failure was logged.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary text-sm min-h-[44px] px-4" onClick={reset}>
          Try again
        </button>
        <a href="/signals" className="btn-ghost text-sm min-h-[44px] px-4 inline-flex items-center">
          Back to Early Signals
        </a>
      </div>
    </div>
  );
}
