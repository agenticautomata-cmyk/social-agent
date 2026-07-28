import { gmailApiFetch } from '../gmail-inbox/client.js';
import type { ParsedDiscoveryMessage } from '../gmail-inbox/message-parse.js';

export type MessagePartDescriptor = {
  attachmentId: string | null;
  filename: string | null;
  mimeType: string;
  size: number;
  inline: boolean;
  contentId: string | null;
  bodyData: string | null;
};

export type FetchedAttachment = {
  descriptor: MessagePartDescriptor;
  buffer: Buffer;
};

function decodeBase64Url(data: string): Buffer {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64');
}

type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { attachmentId?: string; size?: number; data?: string };
  headers?: Array<{ name?: string; value?: string }>;
  parts?: GmailPart[];
};

export function collectMessageParts(
  parts: GmailPart[] | undefined,
  out: MessagePartDescriptor[] = [],
): MessagePartDescriptor[] {
  if (!parts) return out;
  for (const part of parts) {
    const contentId =
      part.headers?.find((h) => h.name?.toLowerCase() === 'content-id')?.value?.replace(/^<|>$/g, '') ??
      null;
    const disposition =
      part.headers?.find((h) => h.name?.toLowerCase() === 'content-disposition')?.value ?? '';
    const inline = /inline/i.test(disposition) || Boolean(contentId);

    if (part.body?.attachmentId || part.body?.data) {
      out.push({
        attachmentId: part.body.attachmentId ?? null,
        filename: part.filename ?? null,
        mimeType: part.mimeType ?? 'application/octet-stream',
        size: part.body.size ?? 0,
        inline,
        contentId,
        bodyData: part.body.data ?? null,
      });
    }
    if (part.parts?.length) collectMessageParts(part.parts, out);
  }
  return out;
}

export async function fetchGmailAttachmentBuffer(
  messageId: string,
  attachmentId: string,
): Promise<Buffer | null> {
  const json = await gmailApiFetch<{ data?: string; size?: number }>(
    `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  );
  if (!json.data) return null;
  return decodeBase64Url(json.data);
}

export async function fetchMessageAttachments(
  message: ParsedDiscoveryMessage,
): Promise<FetchedAttachment[]> {
  const fetched: FetchedAttachment[] = [];
  for (const part of message.parts ?? []) {
    let buffer: Buffer | null = null;
    if (part.bodyData) {
      buffer = decodeBase64Url(part.bodyData);
    } else if (part.attachmentId) {
      buffer = await fetchGmailAttachmentBuffer(message.id, part.attachmentId);
    }
    if (!buffer?.length) continue;
    fetched.push({ descriptor: part, buffer });
  }
  return fetched;
}

export function extractInlineImageUrls(html: string): string[] {
  const urls: string[] = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const src = match[1]?.trim();
    if (!src || src.startsWith('cid:')) continue;
    if (/^https?:\/\//i.test(src)) urls.push(src);
  }
  return [...new Set(urls)].slice(0, 15);
}

export async function fetchLinkedImageBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'BensonNewsletterBot/1.0 (+https://kckellie.com)' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? 'image/jpeg';
    if (!/^image\//i.test(ct)) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength < 1500) return null;
    return { buffer, mimeType: ct.split(';')[0] ?? 'image/jpeg' };
  } catch {
    return null;
  }
}

export function isPdfPart(part: MessagePartDescriptor): boolean {
  return part.mimeType.includes('pdf') || (part.filename?.toLowerCase().endsWith('.pdf') ?? false);
}

export function isCalendarPart(part: MessagePartDescriptor): boolean {
  return (
    part.mimeType.includes('text/calendar') ||
    part.mimeType.includes('application/ics') ||
    (part.filename?.toLowerCase().endsWith('.ics') ?? false)
  );
}

export function isImagePart(part: MessagePartDescriptor): boolean {
  return /^image\//i.test(part.mimeType);
}

export function calendarRawFromPart(_part: MessagePartDescriptor, buffer: Buffer): string {
  return buffer.toString('utf8');
}
