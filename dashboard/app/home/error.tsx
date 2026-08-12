'use client';

export default function HomeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('[home] route error boundary', error);
  return (
    <div className="page-shell max-w-3xl mx-auto space-y-4">
      <h1 className="page-title">Home could not be displayed</h1>
      <p className="page-subtitle">
        A client-side exception occurred. Other Benson pages should still work — try reloading or open Today.
      </p>
      <button type="button" className="btn-primary text-sm min-h-[44px] px-4" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
