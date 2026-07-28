import { gmailApiFetch } from './client.js';
import { extractUrlsFromHtml, extractUrlsFromText } from '../discovery-subscriptions/extract.js';
import {
  collectMessageParts,
  extractInlineImageUrls,
  type MessagePartDescriptor,
} from '../newsletter-intelligence/attachments.js';

export type ParsedDiscoveryMessage = {
  id: string;
  threadId: string;
  snippet: string | null;
  internalDate: Date | null;
  headers: Array<{ name?: string; value?: string }>;
  bodyText: string;
  bodyHtml: string;
  urls: string[];
  /** MIME part descriptors from Gmail full payload (images/PDFs/ICS). */
  parts?: MessagePartDescriptor[];
  /** Linked http(s) image URLs extracted from HTML */
  inlineImageUrls?: string[];
};

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function walkParts(
  parts: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }> | undefined,
  out: { text: string[]; html: string[] },
): void {
  if (!parts) return;
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      out.text.push(decodeBase64Url(part.body.data));
    }
    if (part.mimeType === 'text/html' && part.body?.data) {
      out.html.push(decodeBase64Url(part.body.data));
    }
    if (part.parts) walkParts(part.parts as typeof parts, out);
  }
}

export async function fetchDiscoveryMessage(messageId: string): Promise<ParsedDiscoveryMessage | null> {
  const json = await gmailApiFetch<{
    id?: string;
    threadId?: string;
    snippet?: string;
    internalDate?: string;
    payload?: {
      headers?: Array<{ name?: string; value?: string }>;
      body?: { data?: string; attachmentId?: string; size?: number };
      mimeType?: string;
      filename?: string;
      parts?: unknown[];
    };
  }>(`/messages/${encodeURIComponent(messageId)}?format=full`);

  if (!json.id || !json.threadId) return null;

  const collected: { text: string[]; html: string[] } = { text: [], html: [] };
  if (json.payload?.body?.data) {
    collected.text.push(decodeBase64Url(json.payload.body.data));
  }
  walkParts(json.payload?.parts as Parameters<typeof walkParts>[0], collected);

  const bodyText = collected.text.join('\n').trim() || json.snippet || '';
  const bodyHtml = collected.html.join('\n');
  const urls = [
    ...extractUrlsFromText(bodyText),
    ...extractUrlsFromHtml(bodyHtml),
  ].slice(0, 30);

  const parts = collectMessageParts(
    (json.payload?.parts as Parameters<typeof collectMessageParts>[0]) ??
      (json.payload ? [json.payload as never] : undefined),
  );
  const inlineImageUrls = extractInlineImageUrls(bodyHtml);

  return {
    id: json.id,
    threadId: json.threadId,
    snippet: json.snippet ?? null,
    internalDate: json.internalDate ? new Date(Number(json.internalDate)) : null,
    headers: json.payload?.headers ?? [],
    bodyText,
    bodyHtml,
    urls: [...new Set(urls)],
    parts,
    inlineImageUrls,
  };
}
