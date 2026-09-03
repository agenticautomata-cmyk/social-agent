/**
 * Loews influencer stay request — form-only packet.
 *
 * Benson prepares answers and a media-kit link. A human submits the form.
 * This module never submits anything to Loews.
 */

import { resolvePitchAudienceEvidence } from '../hospitality-pitch/creator-evidence.js';
import { loadMediaKitBySlug, mediaKitSlug, mediaKitWebUrl } from '../media-kit/build.js';

export const LOEWS_INFLUENCER_FORM_URL =
  'https://www.loewshotels.com/influencer-stay-request';

export const LOEWS_RIGHTS_WARNING =
  'Loews UGC terms grant a perpetual, worldwide, royalty-free license with no obligation to use the content. Weigh this before submitting — Benson will not submit the form.';

export type LoewsFormPacket = {
  formUrl: string;
  property: string;
  /** Explicit: Benson must never submit this form. */
  bensonMustNotSubmit: true;
  humanSubmits: true;
  rightsWarning: string;
  answers: Array<{ field: string; value: string; note?: string }>;
  mediaKitUrl: string | null;
  readiness: 'review_ready_form_only';
  summary: string;
};

/**
 * Builds a reviewable Loews packet from live TikTok analytics + hotel media kit.
 * Does not touch the Loews form endpoint.
 */
export async function buildLoewsFormPacket(): Promise<LoewsFormPacket> {
  const audience = await resolvePitchAudienceEvidence();
  const kit = await loadMediaKitBySlug(mediaKitSlug('hotel'));

  const followers = audience.followersAvailable
    ? String(audience.followersCount ?? '—')
    : 'Unavailable — do not invent';
  const medianViews = audience.medianViewsPerPost != null
    ? String(audience.medianViewsPerPost)
    : 'Unavailable — do not invent';

  const answers: LoewsFormPacket['answers'] = [
    {
      field: 'Property',
      value: 'Loews Kansas City Hotel',
      note: 'Property is in the Loews dropdown — confirm before submit.',
    },
    {
      field: 'Platform',
      value: 'TikTok only',
      note: 'Instagram/Facebook/YouTube are not connected — do not invent figures.',
    },
    {
      field: 'Followers (last 90 days / current)',
      value: followers,
      note: audience.followersAvailable
        ? `Live TikTok connector${audience.handle ? ` (${audience.handle})` : ''}`
        : 'Wait for analytics sync before submitting.',
    },
    {
      field: 'Typical engagement / median views',
      value: medianViews,
      note: 'Median views per post from live TikTok metrics.',
    },
    {
      field: 'Audience geography',
      value: 'Kansas City metro (Missouri and Kansas) primary',
      note: 'Honest local market — do not invent city percentages.',
    },
    {
      field: 'Media kit',
      value: kit ? mediaKitWebUrl(mediaKitSlug('hotel')) : 'Generate hotel media kit first',
    },
    {
      field: 'Proposed deliverables',
      value:
        'One in-feed TikTok covering arrival, room, and property; story set during the stay; stills for property channels.',
    },
    {
      field: 'Ask',
      value: 'Complimentary overnight stay + dining credit for content (hosted collaboration).',
    },
  ];

  return {
    formUrl: LOEWS_INFLUENCER_FORM_URL,
    property: 'Loews Kansas City Hotel',
    bensonMustNotSubmit: true,
    humanSubmits: true,
    rightsWarning: LOEWS_RIGHTS_WARNING,
    answers,
    mediaKitUrl: kit ? mediaKitWebUrl(mediaKitSlug('hotel')) : null,
    readiness: 'review_ready_form_only',
    summary:
      'Form-only packet ready for Kellie to review. Benson will not submit the Loews form.',
  };
}

/** Plain-text body for a form-only outreach row (not an email to send). */
export function formatLoewsPacketAsDraftBody(packet: LoewsFormPacket): string {
  const lines = [
    'LOEWS INFLUENCER STAY REQUEST — FORM ONLY',
    '',
    `Form: ${packet.formUrl}`,
    `Property: ${packet.property}`,
    '',
    '⚠️ RIGHTS WARNING',
    packet.rightsWarning,
    '',
    'Benson prepared these answers. A human must submit the form. Benson will not submit.',
    '',
    '--- Prepared answers ---',
  ];
  for (const answer of packet.answers) {
    lines.push(`${answer.field}: ${answer.value}`);
    if (answer.note) lines.push(`  (${answer.note})`);
  }
  if (packet.mediaKitUrl) {
    lines.push('', `Media kit: ${packet.mediaKitUrl}`);
  }
  lines.push('', 'Status: review_ready_form_only — not send-ready by email.');
  return lines.join('\n');
}
