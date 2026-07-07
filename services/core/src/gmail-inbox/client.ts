import { refreshGmailAccessTokenIfNeeded } from '../gmail-oauth/connections.js';

export class GmailInboxError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GmailInboxError';
  }
}

export async function gmailApiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const accessToken = await refreshGmailAccessTokenIfNeeded();
  if (!accessToken) {
    throw new GmailInboxError('Gmail is not connected or token refresh failed.');
  }

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new GmailInboxError(json.error?.message ?? `Gmail API error (${res.status})`, res.status);
  }
  return json;
}

export function parseFromHeader(raw: string | undefined): { name: string | null; email: string | null } {
  if (!raw) return { name: null, email: null };
  const match = raw.match(/^(?:"?([^"]*)"?\s)?<?([^>@\s]+@[^>\s]+)>?$/);
  if (!match) return { name: raw.trim() || null, email: null };
  return {
    name: match[1]?.trim() || null,
    email: match[2]?.trim().toLowerCase() ?? null,
  };
}

export function headerValue(
  headers: Array<{ name?: string; value?: string }> | undefined,
  name: string,
): string | undefined {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value;
}
