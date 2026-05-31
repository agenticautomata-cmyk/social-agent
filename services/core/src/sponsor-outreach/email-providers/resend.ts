import type { EmailProvider, EmailSendPayload, EmailSendResult } from './types.js';

const RESEND_API_URL = 'https://api.resend.com/emails';

export class ResendEmailProvider implements EmailProvider {
  readonly providerId = 'resend';

  constructor(
    private readonly apiKey: string,
    private readonly fromEmail: string,
    private readonly replyTo?: string | null,
  ) {}

  async send(payload: EmailSendPayload): Promise<EmailSendResult> {
    const body: Record<string, unknown> = {
      from: this.fromEmail,
      to: [payload.to],
      subject: payload.subject,
      text: payload.body,
      reply_to: payload.replyTo ?? this.replyTo ?? undefined,
    };

    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as { id?: string; message?: string; name?: string };

    if (!res.ok) {
      const errMsg = json.message ?? json.name ?? `Resend API error (${res.status})`;
      return { ok: false, error: errMsg };
    }

    if (!json.id) {
      return { ok: false, error: 'Resend returned no message id' };
    }

    return { ok: true, providerMessageId: json.id };
  }
}
