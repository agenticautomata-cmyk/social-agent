// Proactively refresh TikTok OAuth tokens before they expire so scheduled sync
// never fails silently when the access token lapses between pulse cycles.

import {
  getActiveTikTokConnectionRow,
  refreshTikTokConnection,
} from '@social-agent/core/tiktok-oauth';
import { createCronWorker } from '../runtime.js';

const REFRESH_WINDOW_MS = 3 * 60 * 60 * 1000;

export const tiktokTokenRefreshWorker = createCronWorker({
  name: 'tiktok-token-refresh',
  intervalMs: 15 * 60 * 1000,
  initialDelayMs: 30_000,
  run: async () => {
    const row = await getActiveTikTokConnectionRow();
    if (!row || row.status !== 'connected') return;

    const expiresAt = row.expiresAt?.getTime();
    if (expiresAt == null) return;

    const msUntilExpiry = expiresAt - Date.now();
    if (msUntilExpiry > REFRESH_WINDOW_MS) return;

    const result = await refreshTikTokConnection(row.creatorAccountId);
    if (result.ok) {
      console.log('[tiktok-token-refresh] access token refreshed proactively');
    } else {
      console.warn('[tiktok-token-refresh] refresh failed:', result.error);
    }
  },
});
