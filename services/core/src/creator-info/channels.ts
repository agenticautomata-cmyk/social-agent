import { env } from '../env.js';

export type CreatorContactChannelId =
  | 'contact'
  | 'sponsors'
  | 'media'
  | 'collabs'
  | 'booking'
  | 'discoveries';

export type CreatorContactChannel = {
  id: CreatorContactChannelId;
  label: string;
  email: string;
  purpose: string;
  /** Where Benson surfaces or uses this address */
  connections: string[];
  href: string | null;
};

export type CreatorInboxConfig = {
  sendAsGmail: string | null;
  displayName: string;
  domain: string;
  channels: CreatorContactChannel[];
};

const DEFAULTS: Record<CreatorContactChannelId, Omit<CreatorContactChannel, 'email'>> = {
  contact: {
    id: 'contact',
    label: 'General',
    purpose: 'Catch-all for site and profile inquiries routed through Cloudflare.',
    connections: ['My Info hub', 'Ask Benson context', 'Public contact'],
    href: '/my-info',
  },
  sponsors: {
    id: 'sponsors',
    label: 'Sponsors',
    purpose: 'Sponsor pitches, partnerships, and outreach replies.',
    connections: [
      'Sponsor email reply-to',
      'Outreach templates',
      'Gmail digest (Primary inbox)',
    ],
    href: '/email',
  },
  media: {
    id: 'media',
    label: 'Media kit',
    purpose: 'Press, media kit requests, and brand one-sheets.',
    connections: ['Media kits', 'Pitch templates (media_kit_send)'],
    href: '/media-kits',
  },
  collabs: {
    id: 'collabs',
    label: 'Collabs',
    purpose: 'Creator collabs, brand deals, and partnership intros.',
    connections: ['Sponsor intel', 'Ask Benson (collab questions)'],
    href: '/sponsor-intelligence',
  },
  booking: {
    id: 'booking',
    label: 'Booking',
    purpose: 'Appearances, events, and paid booking inquiries.',
    connections: ['Planner', 'Action center follow-ups'],
    href: '/planner',
  },
  discoveries: {
    id: 'discoveries',
    label: 'Discoveries',
    purpose: 'KC announcements and opportunity signals forwarded for Benson intake.',
    connections: ['Inventory discovery pipeline', 'Green Screen coverage'],
    href: '/review/inventory',
  },
};

function channelEmail(id: CreatorContactChannelId, fallback: string): string {
  const map: Record<CreatorContactChannelId, string | undefined> = {
    contact: env.CREATOR_EMAIL_CONTACT,
    sponsors: env.CREATOR_EMAIL_SPONSORS,
    media: env.CREATOR_EMAIL_MEDIA,
    collabs: env.CREATOR_EMAIL_COLLABS,
    booking: env.CREATOR_EMAIL_BOOKING,
    discoveries: env.CREATOR_EMAIL_DISCOVERIES,
  };
  return map[id]?.trim() || fallback;
}

export function getCreatorContactChannels(): CreatorContactChannel[] {
  const fallbacks: Record<CreatorContactChannelId, string> = {
    contact: 'contact@kckellie.com',
    sponsors: 'sponsors@kckellie.com',
    media: 'media@kckellie.com',
    collabs: 'collabs@kckellie.com',
    booking: 'booking@kckellie.com',
    discoveries: 'discoveries@kckellie.com',
  };

  return (Object.keys(DEFAULTS) as CreatorContactChannelId[]).map((id) => ({
    ...DEFAULTS[id],
    email: channelEmail(id, fallbacks[id]),
  }));
}

export function getCreatorInboxConfig(): CreatorInboxConfig {
  const channels = getCreatorContactChannels();
  return {
    sendAsGmail: env.CREATOR_GMAIL_SEND_AS?.trim() || 'kckelliecreator@gmail.com',
    displayName: env.CREATOR_DISPLAY_NAME?.trim() || 'Kellie',
    domain: 'kckellie.com',
    channels,
  };
}

export function getChannelEmail(id: CreatorContactChannelId): string {
  return getCreatorContactChannels().find((c) => c.id === id)?.email ?? '';
}

/** Default reply-to for sponsor outreach sends */
export function getSponsorOutreachReplyTo(): string {
  return env.OUTREACH_REPLY_TO?.trim() || getChannelEmail('sponsors');
}
