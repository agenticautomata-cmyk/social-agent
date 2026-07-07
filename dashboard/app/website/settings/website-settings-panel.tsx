'use client';

import { useCallback, useEffect, useState } from 'react';
import { WebsiteNav } from '../../../components/website-nav';
import { clientApiUrl } from '../../../lib/client-api';
import type { WebsiteSettingsRecord } from '../../../lib/website-types';
import {
  bytesToMegabytes,
  formatWebsiteFileSize,
  megabytesToBytes,
} from '../../../lib/website-types';
import { friendlyWebsiteError, websiteFieldClass, websiteLabelClass, websiteTitleClass } from '../../../lib/website-ui';

const MIN_UPLOAD_MB = 1;
const MAX_UPLOAD_MB = 500;

export function WebsiteSettingsPanel() {
  const [settings, setSettings] = useState<WebsiteSettingsRecord | null>(null);
  const [maxUploadMb, setMaxUploadMb] = useState(MIN_UPLOAD_MB);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(clientApiUrl('/api/website/settings'), { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as { settings: WebsiteSettingsRecord };
      setSettings(data.settings);
      setMaxUploadMb(Math.max(MIN_UPLOAD_MB, bytesToMegabytes(data.settings.maxUploadBytes)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;

    const maxUploadBytes = megabytesToBytes(maxUploadMb);
    if (maxUploadMb < MIN_UPLOAD_MB || maxUploadMb > MAX_UPLOAD_MB) {
      setError(`Upload limit must be between ${MIN_UPLOAD_MB} MB and ${MAX_UPLOAD_MB} MB.`);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(clientApiUrl('/api/website/settings'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteTitle: settings.siteTitle.trim() || 'KC Kellie',
          siteTagline: settings.siteTagline?.trim() || null,
          heroHeadline: settings.heroHeadline?.trim() || null,
          heroSubheadline: settings.heroSubheadline?.trim() || null,
          contactEmail: settings.contactEmail?.trim() || null,
          bookingHref: settings.bookingHref?.trim() || null,
          mediaKitHref: settings.mediaKitHref?.trim() || null,
          maxUploadBytes,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; settings?: WebsiteSettingsRecord };
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Save failed');
      const saved = data.settings ?? { ...settings, maxUploadBytes };
      setSettings(saved);
      setMaxUploadMb(bytesToMegabytes(saved.maxUploadBytes));
      setMessage(`Settings saved. Upload limit is now ${formatWebsiteFileSize(saved.maxUploadBytes)}.`);
    } catch (err) {
      setError(friendlyWebsiteError(err instanceof Error ? err.message : 'Save failed'));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return (
      <div>
        <WebsiteNav />
        <p className="text-sm text-neutral-500">Loading settings…</p>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6">
        <p className="text-sm font-medium text-rose-600">Website Manager</p>
        <h1 className={websiteTitleClass}>Site settings</h1>
        <p className="mt-1 text-paper-muted">
          Controlled copy for CTAs and hero text — Benson cannot redesign the whole page.
        </p>
      </header>

      <WebsiteNav />

      {error ? (
        <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : null}
      {message ? (
        <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>
      ) : null}

      <form onSubmit={handleSave} className="glass-panel max-w-xl space-y-4 p-6">
        {(
          [
            ['siteTitle', 'Site title'],
            ['siteTagline', 'Tagline'],
            ['heroHeadline', 'Hero headline'],
            ['heroSubheadline', 'Hero subheadline'],
            ['contactEmail', 'Contact email'],
            ['bookingHref', 'Booking link'],
            ['mediaKitHref', 'Media kit link'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block">
            <span className={websiteLabelClass}>{label}</span>
            <input
              className={websiteFieldClass}
              value={settings[key] ?? ''}
              onChange={(e) => setSettings({ ...settings, [key]: e.target.value || null })}
            />
          </label>
        ))}

        <label className="block">
          <span className={websiteLabelClass}>Max upload size (MB)</span>
          <p className="mb-1 text-xs text-paper-muted">
            Applies to photos and videos uploaded in Website Manager. Current limit:{' '}
            {formatWebsiteFileSize(megabytesToBytes(maxUploadMb))}.
          </p>
          <input
            type="number"
            min={MIN_UPLOAD_MB}
            max={MAX_UPLOAD_MB}
            step={1}
            className={websiteFieldClass}
            value={maxUploadMb}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next)) setMaxUploadMb(next);
            }}
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </div>
  );
}
