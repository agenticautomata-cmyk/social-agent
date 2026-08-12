'use client';

import { clientApiOrigin } from '../lib/client-api';
import { useCallback, useEffect, useState } from 'react';
import { formatDateTime } from '../lib/datetime';

const API = clientApiOrigin();

type SubscriptionRow = {
  id: string;
  sourceName: string;
  signupDomain: string | null;
  signupUrl: string | null;
  emailAddress: string;
  signupAt: string;
  expectedSenderDomain: string | null;
  status: string;
  verificationResult: string | null;
  verificationFailureReason: string | null;
  manualReviewReason: string | null;
  verificationCode: string | null;
  confirmationLink: string | null;
  lastEmailReceivedAt: string | null;
  lastUsefulOpportunityAt: string | null;
  blockedSender: boolean;
};

export function DiscoverySubscriptionsPanel() {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [manualOnly, setManualOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(
        `${API}/api/discovery-subscriptions${manualOnly ? '?manual=true' : ''}`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { subscriptions: SubscriptionRow[] };
      setRows(data.subscriptions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscriptions');
    }
  }, [manualOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(id: string, path: string) {
    setBusy(id + path);
    setError(null);
    try {
      const res = await fetch(`${API}/api/discovery-subscriptions/${id}/${path}`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `${res.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  async function openConfirmation(id: string) {
    setBusy(id + 'open');
    setError(null);
    try {
      const res = await fetch(`${API}/api/discovery-subscriptions/${id}/open-confirmation`, {
        cache: 'no-store',
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error ?? `${res.status}`);
      window.open(body.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open confirmation link');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="border border-paper-edge p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold lowercase">discovery subscriptions</h2>
          <p className="text-xs text-paper-muted">
            Mailing-list signups via discoveries@kckellie.com — verification status and manual review.
          </p>
        </div>
        <label className="text-xs flex items-center gap-2">
          <input
            type="checkbox"
            checked={manualOnly}
            onChange={(e) => setManualOnly(e.target.checked)}
          />
          manual review only
        </label>
      </div>

      {error && <p className="text-accent text-sm">// {error}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-paper-muted italic">No subscription records yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-2xs uppercase text-paper-muted border-b border-paper-edge">
                <th className="text-left py-2 pr-3">Source</th>
                <th className="text-left py-2 pr-3">Domain</th>
                <th className="text-left py-2 pr-3">Status</th>
                <th className="text-left py-2 pr-3">Signup</th>
                <th className="text-left py-2 pr-3">Last email</th>
                <th className="text-left py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-paper-edge align-top">
                  <td className="py-3 pr-3">
                    <div className="font-medium">{row.sourceName}</div>
                    {row.manualReviewReason && (
                      <div className="text-2xs text-accent mt-1">// {row.manualReviewReason}</div>
                    )}
                    {row.verificationCode && row.status === 'manual_action_required' && (
                      <div className="text-2xs mt-1">code: {row.verificationCode}</div>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-2xs">
                    {row.signupDomain ?? row.expectedSenderDomain ?? '—'}
                  </td>
                  <td className="py-3 pr-3 text-2xs">
                    {row.status}
                    {row.verificationResult ? ` · ${row.verificationResult}` : ''}
                    {row.blockedSender ? ' · blocked' : ''}
                  </td>
                  <td className="py-3 pr-3 text-2xs">{formatDateTime(row.signupAt)}</td>
                  <td className="py-3 pr-3 text-2xs">
                    {row.lastEmailReceivedAt ? formatDateTime(row.lastEmailReceivedAt) : '—'}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {row.confirmationLink && (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void openConfirmation(row.id)}
                          className="text-2xs border border-paper-edge px-2 py-1 hover:border-paper-ink disabled:opacity-40"
                        >
                          open confirmation
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void action(row.id, 'mark-verified')}
                        className="text-2xs border border-paper-edge px-2 py-1 hover:border-paper-ink disabled:opacity-40"
                      >
                        mark verified
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void action(row.id, 'dismiss')}
                        className="text-2xs border border-paper-edge px-2 py-1 hover:border-paper-ink disabled:opacity-40"
                      >
                        dismiss
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void action(row.id, 'block-sender')}
                        className="text-2xs border border-paper-edge px-2 py-1 hover:border-paper-ink disabled:opacity-40"
                      >
                        block sender
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
