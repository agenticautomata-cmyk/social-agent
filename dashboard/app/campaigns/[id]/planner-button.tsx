'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2, PlayCircle, CheckCircle2, AlertCircle } from 'lucide-react';

export function PlannerButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function plan() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/planner/run?campaignId=${campaignId}`, {
        method: 'POST',
      });
      const data = await res.json();
      setResult({ kind: 'ok', text: `+${data.result?.itemsCreated ?? 0} items` });
      router.refresh();
    } catch (err) {
      setResult({ kind: 'err', text: err instanceof Error ? err.message : 'error' });
    } finally {
      setRunning(false);
      setTimeout(() => setResult(null), 4000);
    }
  }

  return (
    <button
      onClick={plan}
      disabled={running}
      className="px-3.5 py-1.5 text-sm rounded-lg bg-bg-card border border-border hover:border-accent/50 hover:text-accent disabled:opacity-50 transition inline-flex items-center gap-2"
    >
      {running ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Planning…
        </>
      ) : result?.kind === 'ok' ? (
        <>
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          {result.text}
        </>
      ) : result?.kind === 'err' ? (
        <>
          <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
          {result.text}
        </>
      ) : (
        <>
          <PlayCircle className="h-3.5 w-3.5" />
          Plan now
        </>
      )}
    </button>
  );
}
