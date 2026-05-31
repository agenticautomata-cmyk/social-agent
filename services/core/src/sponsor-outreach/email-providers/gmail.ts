import type { EmailProvider, EmailSendPayload, EmailSendResult } from './types.js';

/**
 * Gmail Send-As provider — Phase B stub for future OAuth + Gmail API integration.
 */
export class GmailSendAsProvider implements EmailProvider {
  readonly providerId = 'gmail';

  async send(_payload: EmailSendPayload): Promise<EmailSendResult> {
    return {
      ok: false,
      error: 'Gmail Send-As is not implemented yet. Use Resend or simulation mode.',
    };
  }
}
