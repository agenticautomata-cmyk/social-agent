/**
 * Content hashing for the approval -> send contract.
 *
 * Kellie approves a specific subject, body, recipient, and media-kit content version.
 * Regenerating a kit in place (same row id, new snapshot) must invalidate approval.
 * Legacy approvals without a hash cannot bypass the integrity gate on live send.
 */

import { createHash } from 'node:crypto';

/**
 * Stable hash over exactly what a human reviewed. Whitespace is normalized so a
 * trailing newline does not read as a content change, but nothing else is.
 */
export function outreachContentHash(input: {
  subject: string;
  body: string;
  recipient: string;
  mediaKitId?: string | null;
  mediaKitVersionId?: string | null;
  mediaKitContentHash?: string | null;
}): string {
  const normalize = (value: string): string => value.replace(/\r\n/g, '\n').trim();
  const payload = [
    normalize(input.subject),
    normalize(input.body),
    normalize(input.recipient).toLowerCase(),
    input.mediaKitId ?? '',
    input.mediaKitVersionId ?? '',
    input.mediaKitContentHash ?? '',
  ].join('\u0000');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * True when what is about to be sent is byte-for-byte what was approved.
 * A mismatch means the draft, contact, or media kit changed after approval.
 */
export function matchesApprovedContent(input: {
  approvedContentHash: string | null;
  approvedRecipient: string | null;
  currentSubject: string;
  currentBody: string;
  currentRecipient: string;
  mediaKitId?: string | null;
  mediaKitVersionId?: string | null;
  mediaKitContentHash?: string | null;
}): { matches: boolean; reason: string | null } {
  if (!input.approvedContentHash) {
    return {
      matches: false,
      reason:
        'No approved content was recorded for this pitch, so there is nothing to send against. Re-approve under the current integrity gate.',
    };
  }
  const currentHash = outreachContentHash({
    subject: input.currentSubject,
    body: input.currentBody,
    recipient: input.currentRecipient,
    mediaKitId: input.mediaKitId,
    mediaKitVersionId: input.mediaKitVersionId,
    mediaKitContentHash: input.mediaKitContentHash,
  });
  if (currentHash === input.approvedContentHash) return { matches: true, reason: null };

  const recipientChanged =
    (input.approvedRecipient ?? '').trim().toLowerCase() !==
    input.currentRecipient.trim().toLowerCase();
  return {
    matches: false,
    reason: recipientChanged
      ? 'The recipient changed after Kellie approved this pitch, so it needs approving again.'
      : 'The pitch or media kit changed after Kellie approved it, so it needs approving again.',
  };
}

/**
 * Legacy rows approved before hashing existed. Live send must refuse these —
 * Kellie re-approves so the hash (including kit version) is recorded.
 */
export function legacyApprovalMissingHash(input: {
  approvedAt: Date | string | null;
  approvedContentHash: string | null;
}): boolean {
  return Boolean(input.approvedAt) && !input.approvedContentHash;
}
