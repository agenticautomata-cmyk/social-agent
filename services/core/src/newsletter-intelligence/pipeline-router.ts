/**
 * Routes newsletter processing to legacy or token-efficient pipeline.
 * Canary disabled by default — see canary-routing.ts env flags.
 */

import { resolveNewsletterPipelineMode, type NewsletterPipelineMode } from './canary-routing.js';
import { processNewsletterEmail } from './pipeline.js';
import { processTokenEfficientNewsletterEmail } from './pipeline-token-efficient.js';
import type { ParsedDiscoveryMessage } from '../gmail-inbox/message-parse.js';
import type { NewsletterParseResult } from './types.js';
import type { TokenEfficientEmailResult } from './pipeline-token-efficient.js';

export type NewsletterPipelineRouteResult =
  | { mode: 'legacy'; result: NewsletterParseResult }
  | { mode: 'token_efficient'; result: TokenEfficientEmailResult }
  | { mode: 'comparison'; legacy: NewsletterParseResult; tokenEfficient: TokenEfficientEmailResult };

export function resolveNewsletterPipelineForMessage(gmailMessageId: string): NewsletterPipelineMode {
  return resolveNewsletterPipelineMode(gmailMessageId);
}

export async function processNewsletterEmailRouted(input: {
  message: ParsedDiscoveryMessage;
  subject: string;
  senderEmail: string | null;
  senderName: string | null;
  discoveryEmailMessageId: string;
  discoverySubscriptionId?: string | null;
  originalRecipient?: string | null;
  dryRun?: boolean;
  forceReprocess?: boolean;
  emailSentAt?: Date | string | null;
}): Promise<NewsletterPipelineRouteResult> {
  const mode = resolveNewsletterPipelineMode(input.message.id);

  if (mode === 'comparison') {
    const [legacy, tokenEfficient] = await Promise.all([
      processNewsletterEmail(input),
      processTokenEfficientNewsletterEmail({
        gmailMessageId: input.message.id,
        subject: input.subject,
        bodyText: input.message.bodyText,
        bodyHtml: input.message.bodyHtml,
        senderEmail: input.senderEmail,
        senderName: input.senderName,
        urls: input.message.urls,
        fromActiveSubscription: true,
        emailSentAt: input.emailSentAt ?? input.message.internalDate ?? null,
        recordSpend: !input.dryRun,
      }),
    ]);
    return { mode: 'comparison', legacy, tokenEfficient };
  }

  if (mode === 'token_efficient') {
    const result = await processTokenEfficientNewsletterEmail({
      gmailMessageId: input.message.id,
      subject: input.subject,
      bodyText: input.message.bodyText,
      bodyHtml: input.message.bodyHtml,
      senderEmail: input.senderEmail,
      senderName: input.senderName,
      urls: input.message.urls,
      fromActiveSubscription: true,
      emailSentAt: input.emailSentAt ?? input.message.internalDate ?? null,
      recordSpend: !input.dryRun,
    });
    return { mode: 'token_efficient', result };
  }

  const result = await processNewsletterEmail(input);
  return { mode: 'legacy', result };
}
