import { env } from '../../env.js';
import { GmailSendAsProvider } from './gmail.js';
import { ResendEmailProvider } from './resend.js';
import type { EmailProvider } from './types.js';

export type { EmailProvider, EmailSendPayload, EmailSendResult } from './types.js';
export { ResendEmailProvider } from './resend.js';
export { GmailSendAsProvider } from './gmail.js';

export type OutreachSendMode = 'live' | 'simulate';

export type OutreachSendConfig = {
  mode: OutreachSendMode;
  liveEnabled: boolean;
  liveReady: boolean;
  provider: string | null;
  missingForLive: string[];
  fromEmail: string | null;
  replyTo: string | null;
};

export function getOutreachSendConfig(): OutreachSendConfig {
  const liveEnabled = env.OUTREACH_ENABLE_LIVE_SEND === true;
  const apiKey = env.RESEND_API_KEY?.trim() || null;
  const fromEmail = env.OUTREACH_FROM_EMAIL?.trim() || null;
  const replyTo = env.OUTREACH_REPLY_TO?.trim() || null;

  const missingForLive: string[] = [];
  if (!liveEnabled) missingForLive.push('OUTREACH_ENABLE_LIVE_SEND');
  if (!apiKey) missingForLive.push('RESEND_API_KEY');
  if (!fromEmail) missingForLive.push('OUTREACH_FROM_EMAIL');

  const liveReady = liveEnabled && !!apiKey && !!fromEmail;

  return {
    mode: liveReady ? 'live' : 'simulate',
    liveEnabled,
    liveReady,
    provider: liveReady ? 'resend' : null,
    missingForLive,
    fromEmail,
    replyTo,
  };
}

export function createEmailProvider(providerId?: string): EmailProvider | null {
  const config = getOutreachSendConfig();
  if (providerId === 'gmail') {
    return new GmailSendAsProvider();
  }
  if (!config.liveReady) return null;
  return new ResendEmailProvider(
    env.RESEND_API_KEY!,
    config.fromEmail!,
    config.replyTo,
  );
}
