// Approval Gate — auto-approves items in campaigns set to autonomy_mode='auto'.
// HITL items are left untouched; the dashboard transitions them.
//
// Implemented as a cron-style worker that runs a single SQL UPDATE — much
// simpler than the per-item polling pattern, and avoids the "claim then no-op"
// loop that would otherwise hot-poll HITL items.

import { sql } from 'drizzle-orm';
import { db } from '@social-agent/core';
import { createCronWorker } from '../runtime.js';

export const approvalGateWorker = createCronWorker({
  name: 'approval-gate',
  intervalMs: 5_000,
  run: async () => {
    const result = await db.execute(sql`
      UPDATE content_items ci
      SET state = 'script_approved',
          script_approved_at = now(),
          script_approved_by = 'auto',
          updated_at = now()
      FROM campaigns c
      WHERE ci.campaign_id = c.id
        AND ci.state = 'script_drafted'
        AND c.autonomy_mode = 'auto'
      RETURNING ci.id
    `);
    const rows = result as unknown as { id: string }[];
    if (rows.length > 0) {
      console.log(`[approval-gate] auto-approved ${rows.length} items`);
    }
  },
});
