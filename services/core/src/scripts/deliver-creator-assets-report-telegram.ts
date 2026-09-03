/**
 * Deliver the Creator Assets completion report summary to the operator Telegram chat.
 * Non-Urgent: requireOutreachEnabled false; does not use partnership urgency classifier.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendTelegramMessage } from '../telegram-notifications/send.js';

const here = dirname(fileURLToPath(import.meta.url));
const reportPath = resolve(here, '../../../../BENSON_CREATOR_ASSETS_AND_MEDIA_KIT_COMPLETION_2026-09-03.md');
const report = readFileSync(reportPath, 'utf8');

const fingerprint = (report.match(/Post-deploy fingerprint \(MATCH\):\*\* `([^`]+)`/) ?? [])[1] ?? 'see report';
const summary = [
  'Benson update (not urgent) — Creator Assets & Media Kit completion',
  '',
  'Photos: upload → approve public use → then kits. Nothing publishes silently.',
  'Media kits: versioned web + one-page PDF; approval pins kit version/hash.',
  'Crossroads: improved draft awaiting Kellie (prior draft preserved).',
  'Loews: form-only packet ready — human submits; Benson will not submit.',
  `Deploy fingerprint MATCH: ${fingerprint}`,
  '',
  'Full report: BENSON_CREATOR_ASSETS_AND_MEDIA_KIT_COMPLETION_2026-09-03.md',
  'Public: https://benson.kckellie.com',
].join('\n');

const result = await sendTelegramMessage(summary, { requireOutreachEnabled: false });
console.log(JSON.stringify({ ok: true, telegram: result, chars: summary.length }, null, 2));
process.exit(result.sent || result.skipped ? 0 : 1);
