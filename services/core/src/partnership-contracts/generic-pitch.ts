/**
 * Mechanical checks for generic / off-mission outreach copy.
 *
 * Used to keep template shopping pitches out of Kellie's approval workflow
 * without matching on a specific business title.
 */

const GENERIC_PHRASES = [
  /local gems like yours/i,
  /over 5k followers/i,
  /over 5,000 followers/i,
  /your store/i,
  /your business/i,
  /let'?s collaborate/i,
  /gift card or exclusive discount/i,
  /who handles partnerships/i,
];

export function looksLikeGenericTemplatePitch(input: {
  subject?: string | null;
  body?: string | null;
}): boolean {
  const text = `${input.subject ?? ''}\n${input.body ?? ''}`;
  if (!text.trim()) return false;
  let hits = 0;
  for (const pattern of GENERIC_PHRASES) {
    if (pattern.test(text)) hits += 1;
  }
  // One generic greeting is not enough; the live junk pitch stacks several.
  return hits >= 2;
}
