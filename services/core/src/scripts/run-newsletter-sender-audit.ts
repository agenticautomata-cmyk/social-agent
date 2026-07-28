import dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(scriptDir, '../../../../.env') });

import { headerValue, parseFromHeader } from '../gmail-inbox/client.js';
import { listGmailMessageIds } from '../gmail-inbox/messages.js';
import { fetchDiscoveryMessage } from '../gmail-inbox/message-parse.js';
import { classifyNewsletterEmail, isProcessableNewsletterCategory, senderDomainFromEmail } from '../newsletter-intelligence/classify.js';
import { enrichNewsletterMessage } from '../newsletter-intelligence/enrich.js';
import { evaluateNewsletterItem } from '../newsletter-intelligence/quality-gates.js';
import { entityResolutionRejected } from '../newsletter-intelligence/entity-resolve.js';

const SENDERS = [
  'newsletter.do816.com',
  'thepitchkc.com',
  'kcdaily.com',
  'kcur.org',
  'madeinkc.co',
];

function countHumanVisibleItems(bodyText: string, subject: string): number {
  const text = `${subject}\n${bodyText}`;
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 8 && l.length <= 200);
  const hits = new Set<string>();
  for (const line of lines) {
    if (/unsubscribe|privacy|view in browser|follow us|copyright|all rights/i.test(line)) continue;
    const dated =
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(line) ||
      /\b\d{1,2}\/\d{1,2}\b/.test(line) ||
      /\b\d{1,2}:\d{2}\s?(?:am|pm)\b/i.test(line);
    const place =
      /\b(?:restaurant|cafe|bar|brewery|shop|store|market|venue|theater|gallery|opening|concert|festival|sale)\b/i.test(
        line,
      );
    if (dated || place) hits.add(line.slice(0, 120));
  }
  return Math.max(hits.size, 1);
}

async function auditSender(domain: string) {
  const query = `in:inbox newer_than:180d from:*@${domain} (to:discoveries@kckellie.com OR deliveredto:discoveries@kckellie.com)`;
  const ids = await listGmailMessageIds(query, 1);
  if (!ids[0]) return { domain, error: 'no_messages' };

  const message = await fetchDiscoveryMessage(ids[0]!);
  if (!message) return { domain, error: 'fetch_failed' };

  const fromRaw = headerValue(message.headers, 'From') ?? '';
  const parsedFrom = parseFromHeader(fromRaw);
  const subject = headerValue(message.headers, 'Subject') ?? message.snippet ?? '';
  const senderDomain = senderDomainFromEmail(parsedFrom.email) ?? domain;

  const category = classifyNewsletterEmail({
    subject,
    bodyText: message.bodyText,
    bodyHtml: message.bodyHtml,
    senderEmail: parsedFrom.email,
    senderName: parsedFrom.name,
  });

  if (!isProcessableNewsletterCategory(category)) {
    return { domain, subject, category, skipped: true };
  }

  const enriched = await enrichNewsletterMessage({
    message,
    subject,
    senderEmail: parsedFrom.email,
    senderName: parsedFrom.name,
    senderDomain,
    newsletterSourceName: parsedFrom.name,
    skipOcr: true,
  });

  let accepted = 0;
  let rejected = 0;
  const rejectReasons: string[] = [];
  for (const item of enriched.items) {
    if (entityResolutionRejected(item)) {
      rejected += 1;
      rejectReasons.push('generic_entity_name');
      continue;
    }
    const gate = evaluateNewsletterItem(item);
    if (!gate.accept) {
      rejected += 1;
      rejectReasons.push(gate.reason);
      continue;
    }
    accepted += 1;
  }

  const humanVisible = countHumanVisibleItems(message.bodyText, subject);

  return {
    domain,
    gmailMessageId: ids[0],
    subject,
    category,
    humanVisibleItems: humanVisible,
    extractedItems: accepted,
    rejectedItems: rejected,
    rawExtracted: enriched.items.length,
    missEstimate: Math.max(0, humanVisible - accepted),
    falsePositives: rejected,
    precision: accepted + rejected > 0 ? Number((accepted / (accepted + rejected)).toFixed(3)) : 1,
    recall: humanVisible > 0 ? Number((accepted / humanVisible).toFixed(3)) : 0,
    sampleTitles: enriched.items.slice(0, 8).map((i) => i.title),
    rejectReasons: [...new Set(rejectReasons)].slice(0, 5),
  };
}

async function main() {
  const results = [];
  for (const domain of SENDERS) {
    console.log(`Auditing ${domain}…`);
    results.push(await auditSender(domain));
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
