'use client';

export default function SignalsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('[signals] route error boundary', error);
  return (
    <div className="page-shell max-w-3xl mx-auto space-y-4">
      <h1 className="page-title">Early Signals could not be displayed</h1>
      <p className="page-subtitle">A client-side exception occurred. The failure was logged for operators.</p>
      <button type="button" className="btn-primary text-sm min-h-[44px] px-4" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
