/**
 * Deliver the Creator Assets + approval-queue trust repair report to Telegram.
 * Authorized operator report only — not partnership urgency.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendTelegramMessage } from '../telegram-notifications/send.js';

const here = dirname(fileURLToPath(import.meta.url));
const reportPath = resolve(
  here,
  '../../../../BENSON_CREATOR_ASSETS_APPROVAL_QUEUE_TRUST_REPAIR_2026-09-03.md',
);
const report = readFileSync(reportPath, 'utf8');

const fingerprint =
  (report.match(/deployment fingerprint[^`]*`([^`]+)`/i) ??
    report.match(/Fingerprint[^`]*`([^`]+)`/i) ??
    [])[1] ?? 'see report';

const summary = [
  'Benson update (not urgent) — Creator Assets + approval queue trust repair',
  '',
  'More → My Info: Creator Assets + Media Kit Library.',
  'Ask Benson pending photos no longer claim kit updates; deep link to Creator Assets.',
  'Email approvals: only evidenced email drafts. Form packets are separate (Loews).',
  'Junk “Selling Men’s Casual Styles” quarantined by invariant (not title hide).',
  `Deploy fingerprint: ${fingerprint}`,
  '',
  'Full report: BENSON_CREATOR_ASSETS_APPROVAL_QUEUE_TRUST_REPAIR_2026-09-03.md',
  'Public: https://benson.kckellie.com',
].join('\n');

const result = await sendTelegramMessage(summary, { requireOutreachEnabled: false });
console.log(JSON.stringify({ ok: true, telegram: result, chars: summary.length }, null, 2));
process.exit(result.sent || result.skipped ? 0 : 1);
