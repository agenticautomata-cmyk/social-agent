export type EmailSendPayload = {
  to: string;
  subject: string;
  body: string;
  replyTo?: string | null;
};

export type EmailSendResult = {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
};

export interface EmailProvider {
  readonly providerId: string;
  send(payload: EmailSendPayload): Promise<EmailSendResult>;
}
