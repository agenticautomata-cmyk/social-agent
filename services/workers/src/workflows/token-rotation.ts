// Token Rotation — runs hourly. Refreshes IG / TikTok tokens before expiry.

import { tokenRotation } from '@social-agent/core';
import { createCronWorker } from '../runtime.js';

export const tokenRotationWorker = createCronWorker({
  name: 'token-rotation',
  intervalMs: 60 * 60 * 1000, // hourly
  run: async () => {
    const results = await tokenRotation.rotateAllExpiring();
    const rotated = results.filter((r) => r.rotated).length;
    const failed = results.filter((r) => r.error).length;
    if (rotated > 0 || failed > 0) {
      console.log(`[token-rotation] checked ${results.length}, rotated ${rotated}, failed ${failed}`);
    }
  },
});
