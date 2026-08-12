'use client';

import { clientApiOrigin } from '../lib/client-api';
import { useState } from 'react';
import Link from 'next/link';

const API = clientApiOrigin();

export function CreateSponsorLeadButton({
  contentItemId,
  title,
  compact = false,
  onCreated,
}: {
  contentItemId: string;
  title: string;
  compact?: boolean;
  onCreated?: (contactId: string, created: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; created: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/sponsors/from-opportunity/${contentItemId}`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { contact: { id: string }; created: boolean };
      setResult({ id: json.contact.id, created: json.created });
      onCreated?.(json.contact.id, json.created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  const btnClass = compact
    ? 'border border-paper-edge px-2 py-1 hover:border-paper-ink disabled:opacity-40 text-2xs'
    : 'border border-paper-edge px-2 py-1 hover:border-paper-ink disabled:opacity-40 text-2xs';

  if (result) {
    return (
      <Link href={`/sponsors/${result.id}`} className={`${btnClass} text-accent`}>
        {result.created ? 'sponsor lead ✓' : 'view sponsor →'}
      </Link>
    );
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void handleClick()}
        className={btnClass}
        title={title}
      >
        {busy ? '…' : 'create sponsor lead'}
      </button>
      {error && <span className="text-2xs text-accent">{error}</span>}
    </span>
  );
}
