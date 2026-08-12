'use client';

import { clientApiOrigin } from '../lib/client-api';
import { useCallback, useEffect, useState } from 'react';
import type { OpportunityLocationView } from '../lib/opportunity-location-types';

const API = clientApiOrigin();

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

export function OpportunityLocationPanel({
  contentItemId,
  initialLocation,
  onUpdated,
}: {
  contentItemId: string;
  initialLocation?: OpportunityLocationView | null;
  onUpdated?: (location: OpportunityLocationView) => void;
}) {
  const [location, setLocation] = useState<OpportunityLocationView | null>(initialLocation ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocation(initialLocation ?? null);
  }, [initialLocation]);

  const applyLocation = useCallback(
    (next: OpportunityLocationView) => {
      setLocation(next);
      onUpdated?.(next);
    },
    [onUpdated],
  );

  async function callAction(path: string, body?: Record<string, unknown>) {
    setBusy(path);
    setError(null);
    try {
      const res = await fetch(`${API}/api/inventory/${contentItemId}/location/${path}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; location?: OpportunityLocationView };
      if (!res.ok || !data.location) {
        throw new Error(data.error ?? `${res.status}`);
      }
      applyLocation(data.location);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Location action failed');
    } finally {
      setBusy(null);
    }
  }

  const candidates = location?.locationCandidates ?? [];

  return (
    <section className="border border-paper-edge p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-2xs uppercase text-paper-muted">Location</h3>
        <span className="text-2xs border border-paper-edge px-2 py-0.5">
          {statusLabel(location?.locationStatus ?? 'unresolved')}
        </span>
      </div>

      {!location?.providerConfigured && (
        <p className="text-xs text-amber-700 border border-amber-200 bg-amber-50 px-3 py-2">
          Live location resolution is not configured. Set <code>LOCATION_PROVIDER=google</code> and add the
          server Places key to the API environment when Google Cloud is ready.
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 text-xs">
        <div>
          <span className="text-paper-muted">Venue / name</span>
          <div>{location?.locationName ?? '—'}</div>
        </div>
        <div>
          <span className="text-paper-muted">Formatted address</span>
          <div>{location?.formattedAddress ?? '—'}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-paper-muted">Confidence</span>
            <div>{location?.locationConfidence != null ? location.locationConfidence.toFixed(2) : '—'}</div>
          </div>
          <div>
            <span className="text-paper-muted">Verified</span>
            <div>{location?.locationVerifiedAt ? 'yes' : 'no'}</div>
          </div>
        </div>
        {location?.locationResolutionError && (
          <div className="text-red-700">
            <span className="text-paper-muted">Error</span>
            <div>{location.locationResolutionError}</div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          className="btn-secondary text-2xs"
          disabled={busy !== null}
          onClick={() => void callAction('resolve')}
        >
          {busy === 'resolve' ? 'resolving…' : 'resolve location'}
        </button>
        <button
          type="button"
          className="btn-secondary text-2xs"
          disabled={busy !== null || location?.locationStatus !== 'resolved'}
          onClick={() => void callAction('verify')}
        >
          mark verified
        </button>
        <button
          type="button"
          className="btn-secondary text-2xs"
          disabled={busy !== null}
          onClick={() => void callAction('clear')}
        >
          clear location
        </button>
        <button
          type="button"
          className="btn-secondary text-2xs"
          disabled={busy !== null}
          onClick={() => void callAction('not-applicable')}
        >
          mark not applicable
        </button>
        {location?.googleMapsUrl && (
          <a
            href={location.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-2xs inline-flex items-center"
          >
            open in google maps
          </a>
        )}
      </div>

      {candidates.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-2xs uppercase text-paper-muted">Candidates</h4>
          {candidates.map((candidate) => (
            <div key={candidate.placeId} className="border border-paper-edge p-3 text-xs space-y-1">
              <div className="font-bold">{candidate.displayName}</div>
              <div className="text-paper-muted">{candidate.formattedAddress}</div>
              <div className="text-2xs text-paper-dim">
                score {candidate.score.toFixed(2)}
                {candidate.websiteUrl ? ` · ${candidate.websiteUrl}` : ''}
              </div>
              <button
                type="button"
                className="bracket hover:text-accent text-2xs"
                disabled={busy !== null}
                onClick={() => void callAction('select', { placeId: candidate.placeId })}
              >
                select candidate
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </section>
  );
}
