import { refreshGmailAccessTokenIfNeeded } from '../../gmail-oauth/connections.js';
import type { EmailProvider, EmailSendPayload, EmailSendResult } from './types.js';

function encodeBase64Url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildMimeMessage(payload: EmailSendPayload, fromEmail: string): string {
  const boundary = `benson_${Date.now()}`;
  const lines: string[] = [
    `From: ${fromEmail}`,
    `To: ${payload.to}`,
    `Subject: ${payload.subject}`,
    'MIME-Version: 1.0',
  ];
  if (payload.replyTo) lines.push(`Reply-To: ${payload.replyTo}`);

  const attachments = payload.attachments ?? [];
  if (attachments.length === 0) {
    lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('');
    lines.push(payload.body);
    return lines.join('\r\n');
  }

  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  lines.push('');
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/plain; charset=UTF-8');
  lines.push('');
  lines.push(payload.body);

  for (const file of attachments) {
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${file.mimeType}; name="${file.filename}"`);
    lines.push('Content-Transfer-Encoding: base64');
    lines.push(`Content-Disposition: attachment; filename="${file.filename}"`);
    lines.push('');
    lines.push(file.content.toString('base64'));
  }

  lines.push(`--${boundary}--`);
  return lines.join('\r\n');
}

export class GmailSendAsProvider implements EmailProvider {
  readonly providerId = 'gmail';

  async send(payload: EmailSendPayload): Promise<EmailSendResult> {
    const accessToken = await refreshGmailAccessTokenIfNeeded();
    if (!accessToken) {
      return { ok: false, error: 'Gmail is not connected or token refresh failed.' };
    }

    const fromEmail = payload.fromEmail?.trim();
    if (!fromEmail) {
      return { ok: false, error: 'Gmail from address is required.' };
    }

    const raw = encodeBase64Url(buildMimeMessage(payload, fromEmail));
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    const json = (await res.json()) as {
      id?: string;
      threadId?: string;
      error?: { message?: string };
    };

    if (!res.ok) {
      return { ok: false, error: json.error?.message ?? `Gmail send failed (${res.status})` };
    }

    return {
      ok: true,
      providerMessageId: json.id,
      threadId: json.threadId,
    };
  }
}
