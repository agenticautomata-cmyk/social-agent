'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  formatDate,
  formatFitScore,
  statusLabel,
  type SponsorContactRecord,
} from '../../lib/sponsor-outreach-types';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function SponsorsPanel() {
  const [contacts, setContacts] = useState<SponsorContactRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetch(`${API}/api/sponsors`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        return res.json() as Promise<{ contacts: SponsorContactRecord[]; demoMode: boolean }>;
      })
      .then((data) => {
        setContacts(data.contacts);
        setDemoMode(data.demoMode);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-6">
      {demoMode && (
        <div className="border border-dashed border-paper-edge px-4 py-2 text-xs text-paper-muted">
          demo mode — outreach sends are simulated only, no real email delivery
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/outreach/compose" className="bracket hover:text-accent">compose outreach →</Link>
        <Link href="/media-kits" className="bracket hover:text-accent">media kits →</Link>
        <Link href="/pipeline" className="bracket hover:text-accent">pipeline →</Link>
        <Link href="/outreach/queue" className="bracket hover:text-accent">queue →</Link>
      </div>

      {error && (
        <div className="border-2 border-accent px-4 py-3 text-sm text-accent">// error: {error}</div>
      )}

      {loading && <div className="py-12 text-paper-muted italic text-center">// loading sponsors…</div>}

      {!loading && contacts.length === 0 && (
        <p className="text-sm text-paper-muted italic py-8 border border-dashed border-paper-edge text-center">
          // no sponsor contacts yet — use &quot;create sponsor lead&quot; from the editor or inventory
        </p>
      )}

      <div className="overflow-x-auto border-2 border-paper-edge">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-paper-edge text-2xs uppercase text-paper-muted">
              <th className="text-left py-2 px-4">business</th>
              <th className="text-left py-2 px-4">category</th>
              <th className="text-left py-2 px-4">fit</th>
              <th className="text-left py-2 px-4">status</th>
              <th className="text-left py-2 px-4">last contacted</th>
              <th className="text-left py-2 px-4">next follow-up</th>
              <th className="text-left py-2 px-4">source</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-b border-paper-edge hover:bg-paper-tint">
                <td className="py-2 px-4">
                  <Link href={`/sponsors/${c.id}`} className="font-bold lowercase hover:text-accent">
                    {c.businessName.toLowerCase()}
                  </Link>
                </td>
                <td className="py-2 px-4 text-xs text-paper-soft">
                  {c.category?.replace(/_/g, ' ') ?? '—'}
                </td>
                <td className="py-2 px-4 tabular-nums">{formatFitScore(c.sponsorFitScore)}</td>
                <td className="py-2 px-4 text-2xs">{statusLabel(c.status)}</td>
                <td className="py-2 px-4 text-2xs">{formatDate(c.lastContactedAt)}</td>
                <td className="py-2 px-4 text-2xs">{formatDate(c.nextFollowUpAt)}</td>
                <td className="py-2 px-4 text-2xs">
                  {c.sourceOpportunityId ? (
                    <Link href={`/review/inventory?id=${c.sourceOpportunityId}`} className="link">
                      opportunity
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
