/**
 * Content hashing for the approval -> send contract.
 *
 * Kellie approves a specific subject, a specific body and a specific recipient. The
 * send path must deliver exactly that, and must be able to prove afterwards that it
 * did. Before this existed, the only record of an approval was a timestamp, so an
 * edit between approval and dispatch would have gone out silently — and the two real
 * Gmail sends in the system's lifetime went to the same contact with the same subject
 * six days apart with nothing to detect the repeat.
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
}): string {
  const normalize = (value: string): string => value.replace(/\r\n/g, '\n').trim();
  const payload = [
    normalize(input.subject),
    normalize(input.body),
    normalize(input.recipient).toLowerCase(),
    input.mediaKitId ?? '',
  ].join('\u0000');
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * True when what is about to be sent is byte-for-byte what was approved.
 * A mismatch means the draft or the contact changed after approval, which must send
 * the row back for re-approval rather than going out.
 */
export function matchesApprovedContent(input: {
  approvedContentHash: string | null;
  approvedRecipient: string | null;
  currentSubject: string;
  currentBody: string;
  currentRecipient: string;
  mediaKitId?: string | null;
}): { matches: boolean; reason: string | null } {
  if (!input.approvedContentHash) {
    return {
      matches: false,
      reason: 'No approved content was recorded for this pitch, so there is nothing to send against.',
    };
  }
  const currentHash = outreachContentHash({
    subject: input.currentSubject,
    body: input.currentBody,
    recipient: input.currentRecipient,
    mediaKitId: input.mediaKitId,
  });
  if (currentHash === input.approvedContentHash) return { matches: true, reason: null };

  const recipientChanged =
    (input.approvedRecipient ?? '').trim().toLowerCase() !==
    input.currentRecipient.trim().toLowerCase();
  return {
    matches: false,
    reason: recipientChanged
      ? 'The recipient changed after Kellie approved this pitch, so it needs approving again.'
      : 'The pitch was edited after Kellie approved it, so it needs approving again.',
  };
}
