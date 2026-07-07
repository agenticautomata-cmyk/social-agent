export type EmailSendPayload = {
  to: string;
  subject: string;
  body: string;
  replyTo?: string | null;
  fromEmail?: string | null;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    content: Buffer;
  }>;
};

export type EmailSendResult = {
  ok: boolean;
  providerMessageId?: string;
  threadId?: string;
  error?: string;
};

export interface EmailProvider {
  readonly providerId: string;
  send(payload: EmailSendPayload): Promise<EmailSendResult>;
}
