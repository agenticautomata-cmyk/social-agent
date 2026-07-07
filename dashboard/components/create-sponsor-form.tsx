'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  SPONSOR_CONTACT_STATUSES,
  statusLabel,
  type SponsorContactRecord,
} from '../lib/sponsor-outreach-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function CreateSponsorForm({ onCreated }: { onCreated?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body = {
      businessName: String(fd.get('businessName') ?? '').trim(),
      contactName: String(fd.get('contactName') ?? '').trim() || null,
      email: String(fd.get('email') ?? '').trim() || null,
      phone: String(fd.get('phone') ?? '').trim() || null,
      notes: String(fd.get('notes') ?? '').trim() || null,
      status: String(fd.get('status') ?? 'lead'),
    };
    if (!body.businessName) {
      setError('Company name is required');
      setBusy(false);
      return;
    }
    try {
      const res = await fetch(`${API}/api/sponsors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { contact: SponsorContactRecord };
      onCreated?.();
      router.push(`/sponsors/${json.contact.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sponsor');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[44px] border-2 border-paper-ink px-4 py-2 text-sm font-bold"
      >
        add sponsor contact
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="border-2 border-paper-edge p-4 space-y-3 text-sm max-w-xl"
    >
      <h2 className="font-bold lowercase text-sm">new sponsor contact</h2>
      <label className="block space-y-1">
        <span className="text-2xs uppercase text-paper-muted">company</span>
        <input name="businessName" required className="w-full border border-paper-edge px-2 py-1.5 bg-paper" />
      </label>
      <label className="block space-y-1">
        <span className="text-2xs uppercase text-paper-muted">contact name</span>
        <input name="contactName" className="w-full border border-paper-edge px-2 py-1.5 bg-paper" />
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-2xs uppercase text-paper-muted">email</span>
          <input name="email" type="email" className="w-full border border-paper-edge px-2 py-1.5 bg-paper" />
        </label>
        <label className="block space-y-1">
          <span className="text-2xs uppercase text-paper-muted">phone</span>
          <input name="phone" className="w-full border border-paper-edge px-2 py-1.5 bg-paper" />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-2xs uppercase text-paper-muted">status</span>
        <select name="status" defaultValue="lead" className="w-full border border-paper-edge px-2 py-1.5 bg-paper">
          {SPONSOR_CONTACT_STATUSES.map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-2xs uppercase text-paper-muted">notes</span>
        <textarea name="notes" rows={3} className="w-full border border-paper-edge px-2 py-1.5 bg-paper" />
      </label>
      {error && <p className="text-2xs text-accent">// {error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-[44px] border-2 border-paper-ink px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {busy ? 'saving…' : 'save contact'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-[44px] border border-paper-edge px-4 py-2 text-sm"
        >
          cancel
        </button>
      </div>
    </form>
  );
}
