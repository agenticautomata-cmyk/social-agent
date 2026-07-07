import 'dotenv/config';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../../.env') });

import { sendBensonPush } from '../push-notifications/send.js';

const UPDATE = {
  id: '2026-07-05-gear-coach-tiktok-playbook',
  title: "Benson · What's new",
  body: 'Gear Coach + TikTok Creator Playbook are live — hooks, captions, iPhone setup & more.',
  url: '/playbook/coach',
};

async function main() {
  console.log(`Sending studio update push (${UPDATE.id})…\n`);

  const result = await sendBensonPush(
    {
      topic: 'top_picks',
      title: UPDATE.title,
      body: UPDATE.body,
      url: UPDATE.url,
    },
    { force: true },
  );

  if (result.skipped) {
    console.log(`Skipped: ${result.reason ?? 'unknown'}`);
    process.exit(result.reason === 'no_subscriptions' ? 0 : 1);
  }

  console.log(`Sent: ${result.sent}, failed: ${result.failed}`);
  process.exit(result.sent > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
