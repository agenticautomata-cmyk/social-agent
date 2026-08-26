import { timingSafeEqual } from 'node:crypto';

export function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Dedicated voice-read secret. Does not accept the Control Tower key. */
export function isBensonVoiceAuthorized(authorization: string | undefined): boolean {
  const expected = process.env.BENSON_VOICE_API_KEY?.trim();
  if (!expected) return false;
  const token = parseBearerToken(authorization);
  if (!token) return false;
  return safeEqual(token, expected);
}

export function voiceUnauthorizedMessage(): string {
  return 'Benson voice requires a valid bearer token.';
}
