import { sendBensonPush } from '../push-notifications/send.js';
import { sendTelegramMessage } from '../telegram-notifications/send.js';
import { markOutreachApprovalNotified } from '../sponsor-outreach/outreach.js';

function publicAppBase(): string {
  return (
    process.env.DASHBOARD_PUBLIC_URL?.replace(/\/$/, '') ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
    'https://benson.kckellie.com'
  );
}

/**
 * Sponsor outreach is high urgency — always Telegram + push.
 * (Previously Telegram was push-fallback only, so Telegram stayed quiet when push worked.)
 */
export async function notifyOutreachDraftReady(input: {
  emailId: string;
  businessName: string;
  subject?: string | null;
}): Promise<{ push: Awaited<ReturnType<typeof sendBensonPush>>; telegram: Awaited<ReturnType<typeof sendTelegramMessage>> }> {
  const url = `${publicAppBase()}/email/approvals?id=${input.emailId}`;
  const body = input.subject?.trim()
    ? `Benson · sponsor pitch ready\n${input.businessName}\n${input.subject.trim()}`
    : `Benson drafted a pitch to ${input.businessName} — tap to approve`;

  const [push, telegram] = await Promise.all([
    sendBensonPush({
      topic: 'sponsor_outreach',
      title: 'Benson · sponsor pitch',
      body: `Pitch ready for ${input.businessName} — tap to approve`,
      url: `/email/approvals?id=${input.emailId}`,
    }),
    sendTelegramMessage(`${body}\n\n${url}`),
  ]);

  await markOutreachApprovalNotified(input.emailId);
  return { push, telegram };
}

export async function notifyOutreachReply(input: {
  businessName: string;
  threadId?: string | null;
  subject?: string | null;
}): Promise<void> {
  const url = `${publicAppBase()}/email/inbox`;
  const body = input.subject?.trim()
    ? `Benson · sponsor reply\n${input.businessName}\n${input.subject.trim()}`
    : `${input.businessName} replied to your sponsor pitch`;

  await Promise.all([
    sendBensonPush({
      topic: 'sponsor_outreach',
      title: 'Benson · sponsor reply',
      body: `${input.businessName} replied to your sponsor pitch`,
      url: '/email/inbox',
    }),
    sendTelegramMessage(`${body}\n\n${url}`),
  ]);
}
