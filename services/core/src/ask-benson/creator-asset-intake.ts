/**
 * Ask Benson photo → Creator Assets intake.
 *
 * Response text is generated from the persisted asset row. Pending photos never
 * claim that a media kit was updated. OCR / URL-reading is a separate intent.
 */

import type { CreatorAssetRole } from '../creator-assets/types.js';
import type { AskBensonResponse } from './types.js';

const READ_REQUEST =
  /\b(read (this|it|the (image|photo|screenshot|flyer|page))|ocr|extract text|what does (this|that) say|transcribe|inspect this (screenshot|flyer|page|email))\b/i;

const HEADSHOT = /\b(head ?shot|profile photo|headshot)\b/i;
const LIFESTYLE = /\b(lifestyle|candid|out and about)\b/i;
const BRAND = /\b(logo|brand mark|wordmark)\b/i;
const WORK = /\b(work sample|proof still|portfolio still)\b/i;

export function isExplicitImageReadRequest(message: string | null | undefined): boolean {
  return READ_REQUEST.test((message ?? '').trim());
}

export function inferCreatorAssetRoleFromMessage(
  message: string | null | undefined,
  filename?: string | null,
): CreatorAssetRole {
  const blob = `${message ?? ''} ${filename ?? ''}`;
  if (HEADSHOT.test(blob)) return 'headshot';
  if (LIFESTYLE.test(blob)) return 'lifestyle';
  if (BRAND.test(blob)) return 'hero';
  if (WORK.test(blob)) return 'proof_still';
  return 'other';
}

/**
 * Default: an attached photo is a creator asset, not a flyer to OCR —
 * unless Kellie explicitly asked Benson to read it and did not also call it a
 * headshot / kit photo.
 */
export function shouldTreatImageAsCreatorAsset(message: string | null | undefined): boolean {
  const text = (message ?? '').trim();
  if (HEADSHOT.test(text) || /\bmedia kit\b/i.test(text) || /\bcreator asset\b/i.test(text)) {
    return true;
  }
  if (isExplicitImageReadRequest(text)) return false;
  return true;
}

const KIT_CLAIM = /(added .+ to the media kit|updated media kit is ready|media kit is ready for use)/i;

export function pendingCreatorAssetAnswer(input: {
  publicUseState: string;
  role: string;
  originalFilename: string | null;
}): { answer: string; evidence: string[]; suggestedActions: string[] } {
  const filename = input.originalFilename ?? 'your photo';
  const answer = [
    `Your photo (${filename}) was uploaded privately and is waiting for approval.`,
    'It is not on any media kit yet, and nothing public has changed.',
    'Review it in Creator Assets before Benson uses it publicly or adds it to a media kit.',
  ].join(' ');

  if (KIT_CLAIM.test(answer)) {
    throw new Error('Pending creator-asset copy must never claim a kit update.');
  }

  return {
    answer,
    evidence: [
      `Persisted public_use_state=${input.publicUseState}`,
      `Persisted role=${input.role}`,
      'No media-kit assignment was created',
    ],
    suggestedActions: ['Open Creator Assets → /creator-assets'],
  };
}

export function pendingCreatorAssetResponse(input: {
  conversationId: string;
  messageId: string | null;
  publicUseState: string;
  role: string;
  originalFilename: string | null;
}): AskBensonResponse {
  const built = pendingCreatorAssetAnswer(input);
  return {
    ok: true,
    answer: built.answer,
    evidence: built.evidence,
    suggestedActions: built.suggestedActions,
    usedData: ['creatorAsset', 'persistedState'],
    confidence: 100,
    conversationId: input.conversationId,
    messageId: input.messageId,
    cached: false,
    tokenUsage: null,
    estimatedCost: 0,
  };
}

export const FORBIDDEN_PENDING_KIT_CLAIMS = [
  'I added your headshot to the media kit',
  'Updated media kit is ready for use',
] as const;
