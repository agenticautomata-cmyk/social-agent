import { gmailApiFetch, headerValue, parseFromHeader } from './client.js';
import { ROUTING_HEADER_NAMES } from './resolve-channel.js';

export type GmailMessageSummary = {
  id: string;
  threadId: string;
  fromRaw: string | null;
  fromEmail: string | null;
  fromName: string | null;
  subject: string | null;
  snippet: string | null;
  internalDate: Date | null;
  labelIds: string[];
  headers: Array<{ name?: string; value?: string }>;
};

type ListResponse = {
  messages?: Array<{ id?: string; threadId?: string }>;
  nextPageToken?: string;
};

type MessageResponse = {
  id?: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: {
    headers?: Array<{ name?: string; value?: string }>;
  };
};

const METADATA_HEADERS = ['From', 'Subject', 'Date', ...ROUTING_HEADER_NAMES];

export async function listGmailMessageIds(query: string, maxResults = 50): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(maxResults - ids.length, 50)),
    });
    if (pageToken) params.set('pageToken', pageToken);

    const json = await gmailApiFetch<ListResponse>(`/messages?${params.toString()}`);
    for (const msg of json.messages ?? []) {
      if (msg.id) ids.push(msg.id);
    }
    pageToken = json.nextPageToken;
  } while (pageToken && ids.length < maxResults);

  return ids;
}

export async function fetchGmailMessageSummary(messageId: string): Promise<GmailMessageSummary | null> {
  const metadataHeaders = METADATA_HEADERS.map((h) => `metadataHeaders=${encodeURIComponent(h)}`).join('&');
  const json = await gmailApiFetch<MessageResponse>(
    `/messages/${encodeURIComponent(messageId)}?format=metadata&${metadataHeaders}`,
  );
  if (!json.id || !json.threadId) return null;

  const headers = json.payload?.headers ?? [];
  const fromRaw = headerValue(headers, 'From') ?? null;
  const parsed = parseFromHeader(fromRaw ?? undefined);

  return {
    id: json.id,
    threadId: json.threadId,
    fromRaw,
    fromEmail: parsed.email,
    fromName: parsed.name,
    subject: headerValue(headers, 'Subject') ?? null,
    snippet: json.snippet ?? null,
    internalDate: json.internalDate ? new Date(Number(json.internalDate)) : null,
    labelIds: json.labelIds ?? [],
    headers,
  };
}

export async function fetchGmailMessageSummaries(messageIds: string[]): Promise<GmailMessageSummary[]> {
  const summaries: GmailMessageSummary[] = [];
  for (const id of messageIds) {
    const summary = await fetchGmailMessageSummary(id);
    if (summary) summaries.push(summary);
  }
  return summaries;
}

/** Primary inbox unread — excludes promotions, spam, trash. */
export const PRIMARY_UNREAD_QUERY =
  'in:inbox category:primary -category:promotions -in:spam -in:trash is:unread';
