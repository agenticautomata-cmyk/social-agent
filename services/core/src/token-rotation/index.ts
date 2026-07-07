// Token rotation — refreshes IG / TikTok long-lived tokens before they expire.
//
// IG: long-lived Page tokens last 60 days. We refresh when ≤7 days remain via
//     GET /oauth/access_token?grant_type=fb_exchange_token.
// TikTok: access tokens last 24h, refresh tokens last 365 days. We refresh
//     access tokens when ≤2h remain via POST /v2/oauth/token/.
//
// In DEMO_MODE both calls are mocked — they bump expires_at into the future
// without hitting the network.

import { eq, lt, and } from 'drizzle-orm';
import { db } from '../db.js';
import {
  platformCredentials,
  publishingTargets,
  type PlatformCredential,
  type Platform,
} from '../schema.js';
import { env } from '../env.js';

interface RotationResult {
  targetId: string;
  platform: Platform;
  rotated: boolean;
  newExpiresAt?: Date;
  error?: string;
  mode: 'real' | 'mock';
}

const SAFETY_MARGIN_MS: Partial<Record<Platform, number>> = {
  instagram: 7 * 24 * 60 * 60 * 1000, // refresh 7d before expiry
  tiktok: 2 * 60 * 60 * 1000,         // refresh 2h before expiry
  youtube_shorts: 60 * 60 * 1000,
  linkedin: 60 * 60 * 1000,
  facebook: 7 * 24 * 60 * 60 * 1000,
};

export async function rotateAllExpiring(): Promise<RotationResult[]> {
  const now = Date.now();
  const longest = Math.max(...Object.values(SAFETY_MARGIN_MS));
  const cutoff = new Date(now + longest);

  const candidates = await db
    .select({
      cred: platformCredentials,
      target: publishingTargets,
    })
    .from(platformCredentials)
    .innerJoin(publishingTargets, eq(publishingTargets.id, platformCredentials.targetId))
    .where(
      and(
        lt(platformCredentials.expiresAt, cutoff),
        eq(publishingTargets.active, true)
      )
    );

  const results: RotationResult[] = [];
  for (const { cred, target } of candidates) {
    const margin = SAFETY_MARGIN_MS[target.platform] ?? 60_000;
    if (cred.expiresAt.getTime() - now > margin) {
      results.push({ targetId: target.id, platform: target.platform, rotated: false, mode: 'real' });
      continue;
    }
    const r = await rotateOne(cred, target.platform);
    results.push(r);
  }
  return results;
}

async function rotateOne(cred: PlatformCredential, platform: Platform): Promise<RotationResult> {
  try {
    const out =
      platform === 'instagram'
        ? await rotateInstagram(cred)
        : platform === 'tiktok'
          ? await rotateTikTok(cred)
          : { newAccessToken: cred.accessToken, newRefreshToken: cred.refreshToken, newExpiresAt: new Date(Date.now() + 60 * 60 * 1000), mode: 'mock' as const };

    await db
      .update(platformCredentials)
      .set({
        accessToken: out.newAccessToken,
        refreshToken: out.newRefreshToken ?? cred.refreshToken,
        expiresAt: out.newExpiresAt,
        lastRotatedAt: new Date(),
        lastRotationError: null,
        rotationAttempts: 0,
      })
      .where(eq(platformCredentials.id, cred.id));

    return { targetId: cred.targetId, platform, rotated: true, newExpiresAt: out.newExpiresAt, mode: out.mode };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(platformCredentials)
      .set({
        lastRotationError: message,
        rotationAttempts: cred.rotationAttempts + 1,
      })
      .where(eq(platformCredentials.id, cred.id));
    return { targetId: cred.targetId, platform, rotated: false, error: message, mode: 'real' };
  }
}

interface RotationOut {
  newAccessToken: string;
  newRefreshToken?: string | null;
  newExpiresAt: Date;
  mode: 'real' | 'mock';
}

async function rotateInstagram(cred: PlatformCredential): Promise<RotationOut> {
  if (env.DEMO_MODE || !cred.clientId || !cred.clientSecret) {
    return mockRefresh('instagram');
  }
  const url = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', cred.clientId);
  url.searchParams.set('client_secret', cred.clientSecret);
  url.searchParams.set('fb_exchange_token', cred.accessToken);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`IG token refresh failed: ${res.status}`);
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('IG returned no access_token');

  return {
    newAccessToken: data.access_token,
    newExpiresAt: new Date(Date.now() + (data.expires_in ?? 60 * 24 * 3600) * 1000),
    mode: 'real',
  };
}

async function rotateTikTok(cred: PlatformCredential): Promise<RotationOut> {
  if (env.DEMO_MODE || !cred.refreshToken || !cred.clientId || !cred.clientSecret) {
    return mockRefresh('tiktok');
  }
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: cred.clientId,
      client_secret: cred.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: cred.refreshToken,
    }).toString(),
  });
  if (!res.ok) throw new Error(`TikTok token refresh failed: ${res.status}`);
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) throw new Error('TikTok returned no access_token');
  return {
    newAccessToken: data.access_token,
    newRefreshToken: data.refresh_token,
    newExpiresAt: new Date(Date.now() + (data.expires_in ?? 24 * 3600) * 1000),
    mode: 'real',
  };
}

function mockRefresh(platform: 'instagram' | 'tiktok'): RotationOut {
  const lifeMs = platform === 'instagram' ? 60 * 24 * 3600_000 : 24 * 3600_000;
  return {
    newAccessToken: `mock_${platform}_${Math.random().toString(36).slice(2, 14)}`,
    newRefreshToken: platform === 'tiktok' ? `mock_refresh_${Math.random().toString(36).slice(2, 14)}` : null,
    newExpiresAt: new Date(Date.now() + lifeMs),
    mode: 'mock',
  };
}
