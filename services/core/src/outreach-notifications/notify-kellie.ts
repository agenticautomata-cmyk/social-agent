import { env } from '../env.js';
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

export async function notifyOutreachDraftReady(input: {
  emailId: string;
  businessName: string;
}): Promise<{ push: Awaited<ReturnType<typeof sendBensonPush>>; telegram: Awaited<ReturnType<typeof sendTelegramMessage>> }> {
  const url = `${publicAppBase()}/email/approvals?id=${input.emailId}`;
  const body = `Benson drafted a pitch to ${input.businessName} — tap to approve`;

  const push = await sendBensonPush({
    topic: 'sponsor_outreach',
    title: 'Benson · sponsor pitch',
    body,
    url: `/email/approvals?id=${input.emailId}`,
  });

  let telegram = { sent: false, skipped: true, reason: 'push_delivered' } as Awaited<
    ReturnType<typeof sendTelegramMessage>
  >;

  if (push.skipped || push.sent === 0) {
    telegram = await sendTelegramMessage(`${body}\n\n${url}`);
  }

  await markOutreachApprovalNotified(input.emailId);
  return { push, telegram };
}

export async function notifyOutreachReply(input: {
  businessName: string;
  threadId?: string | null;
}): Promise<void> {
  const url = `${publicAppBase()}/email/inbox`;
  const body = `${input.businessName} replied to your sponsor pitch`;

  const push = await sendBensonPush({
    topic: 'sponsor_outreach',
    title: 'Benson · sponsor reply',
    body,
    url: '/email/inbox',
  });

  if (push.skipped || push.sent === 0) {
    await sendTelegramMessage(`${body}\n\n${url}`);
  }
}
