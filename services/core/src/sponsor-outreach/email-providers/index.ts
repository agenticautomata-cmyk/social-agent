import { env } from '../../env.js';
import { getSponsorOutreachReplyTo } from '../../creator-info/index.js';
import { getGmailConnectionStatus } from '../../gmail-oauth/connections.js';
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
  provider: 'gmail' | 'resend' | null;
  missingForLive: string[];
  fromEmail: string | null;
  replyTo: string | null;
  gmailConnected: boolean;
};

/** RFC5322 From header — display name + address for Gmail MIME. */
export function formatOutreachFromEmail(email: string): string {
  const trimmed = email.trim();
  const outreachFrom = env.OUTREACH_FROM_EMAIL?.trim();
  if (outreachFrom?.includes('<') && outreachFrom.includes('>')) {
    const match = outreachFrom.match(/<([^>]+)>/);
    if (match?.[1]?.toLowerCase() === trimmed.toLowerCase()) return outreachFrom;
  }
  const name = env.CREATOR_DISPLAY_NAME?.trim() || 'Kellie';
  return `${name} <${trimmed}>`;
}

export async function getOutreachSendConfig(): Promise<OutreachSendConfig> {
  const liveEnabled = env.OUTREACH_ENABLE_LIVE_SEND === true;
  const resendKey = env.RESEND_API_KEY?.trim() || null;
  const resendFrom = env.OUTREACH_FROM_EMAIL?.trim() || null;
  const replyTo = getSponsorOutreachReplyTo() || null;
  const gmailStatus = await getGmailConnectionStatus();
  const gmailConnected = gmailStatus.status === 'connected';
  const gmailFrom = gmailStatus.connection?.email ?? null;

  const resendMissing: string[] = [];
  if (!liveEnabled) resendMissing.push('OUTREACH_ENABLE_LIVE_SEND');
  if (!resendKey) resendMissing.push('RESEND_API_KEY');
  if (!resendFrom) resendMissing.push('OUTREACH_FROM_EMAIL');
  const resendReady = liveEnabled && !!resendKey && !!resendFrom;

  const gmailMissing: string[] = [];
  if (!liveEnabled) gmailMissing.push('OUTREACH_ENABLE_LIVE_SEND');
  if (!gmailConnected) gmailMissing.push('GMAIL_CONNECTION');
  if (!gmailFrom) gmailMissing.push('GMAIL_EMAIL');

  const preferGmail = env.OUTREACH_SEND_PROVIDER === 'gmail';
  let provider: 'gmail' | 'resend' | null = null;
  let missingForLive: string[] = [];
  let fromEmail: string | null = null;

  if (preferGmail && gmailConnected && gmailFrom) {
    provider = 'gmail';
    missingForLive = gmailMissing.filter((m) => m !== 'GMAIL_CONNECTION' && m !== 'GMAIL_EMAIL');
    fromEmail = formatOutreachFromEmail(gmailFrom);
  } else if (resendReady) {
    provider = 'resend';
    missingForLive = resendMissing;
    fromEmail = resendFrom;
  } else if (gmailConnected && gmailFrom) {
    provider = 'gmail';
    missingForLive = gmailMissing.filter((m) => m !== 'GMAIL_CONNECTION' && m !== 'GMAIL_EMAIL');
    fromEmail = formatOutreachFromEmail(gmailFrom);
  }

  const liveReady = !!provider && missingForLive.length === 0;

  return {
    mode: liveReady ? 'live' : 'simulate',
    liveEnabled,
    liveReady,
    provider,
    missingForLive,
    fromEmail,
    replyTo,
    gmailConnected,
  };
}

export async function createEmailProvider(providerId?: 'gmail' | 'resend'): Promise<EmailProvider | null> {
  const config = await getOutreachSendConfig();
  const id = providerId ?? config.provider;
  if (id === 'gmail') return new GmailSendAsProvider();
  if (id === 'resend' && config.liveReady && config.provider === 'resend') {
    return new ResendEmailProvider(env.RESEND_API_KEY!, config.fromEmail!, config.replyTo);
  }
  return null;
}
