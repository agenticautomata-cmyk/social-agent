import type { CreatorContactChannelId } from '../creator-info/channels.js';
import { getChannelEmail, getCreatorContactChannels } from '../creator-info/channels.js';
import { headerValue } from './client.js';

/** Headers Cloudflare / Gmail may use for the original alias recipient. */
export const ROUTING_HEADER_NAMES = [
  'To',
  'Delivered-To',
  'X-Original-To',
  'Envelope-To',
  'Original-Recipient',
  'Resent-To',
  'X-Forwarded-To',
] as const;

export type InboundChannelResolution = {
  channelId: CreatorContactChannelId | 'discoveries';
  matchedEmail: string;
  matchedHeader: string;
};

function normalizeEmail(raw: string): string {
  const stripped = raw.replace(/^rfc822;/i, '').trim();
  // Prefer the angle-bracket address: "Name" <addr@host>
  const angle = stripped.match(/<([^>]+)>/);
  if (angle?.[1]) {
    return angle[1].trim().toLowerCase().replace(/^"+|"+$/g, '');
  }
  const match = stripped.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  return (match?.[1] ?? stripped).trim().toLowerCase().replace(/^"+|"+$/g, '');
}

function emailsFromHeaderValue(value: string): string[] {
  return value
    .split(',')
    .map((part) => normalizeEmail(part))
    .filter(Boolean);
}

export function resolveInboundChannelFromHeaders(
  headers: Array<{ name?: string; value?: string }> | undefined,
): InboundChannelResolution | null {
  const channels = getCreatorContactChannels();
  const discoveriesEmail = getChannelEmail('discoveries').toLowerCase();

  const aliasMap: Array<{ id: CreatorContactChannelId | 'discoveries'; email: string }> = [
    ...channels.map((c) => ({ id: c.id as CreatorContactChannelId, email: c.email.toLowerCase() })),
    { id: 'discoveries', email: discoveriesEmail },
  ];

  for (const headerName of ROUTING_HEADER_NAMES) {
    const raw = headerValue(headers, headerName);
    if (!raw) continue;
    for (const candidate of emailsFromHeaderValue(raw)) {
      for (const alias of aliasMap) {
        if (candidate === alias.email) {
          return { channelId: alias.id, matchedEmail: candidate, matchedHeader: headerName };
        }
      }
    }
  }

  return null;
}

export function isDiscoveryEmail(resolution: InboundChannelResolution | null): boolean {
  return resolution?.channelId === 'discoveries';
}

export function isSponsorOrBookingChannel(resolution: InboundChannelResolution | null): boolean {
  if (!resolution) return false;
  return ['sponsors', 'booking', 'collabs', 'media', 'contact'].includes(resolution.channelId);
}
