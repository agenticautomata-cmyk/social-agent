import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { getGoogleCalendarClientSecret } from './config.js';

const STATE_TTL_MS = 10 * 60 * 1000;

type StatePayload = {
  nonce: string;
  exp: number;
};

/** One-time state nonces to block OAuth callback replay. */
const consumedNonces = new Map<string, number>();

function purgeExpiredNonces(): void {
  const now = Date.now();
  for (const [nonce, exp] of consumedNonces) {
    if (exp < now) consumedNonces.delete(nonce);
  }
}

function stateSecret(): string {
  const secret = getGoogleCalendarClientSecret();
  if (!secret) throw new Error('Google Calendar OAuth client secret is required for state signing');
  return `${secret}:google-calendar-oauth-state`;
}

export function createGoogleCalendarOAuthState(): string {
  purgeExpiredNonces();
  const payload: StatePayload = {
    nonce: randomBytes(16).toString('hex'),
    exp: Date.now() + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyGoogleCalendarOAuthState(state: string): StatePayload {
  const [body, sig] = state.split('.');
  if (!body || !sig) throw new Error('Invalid OAuth state format');
  const expected = createHmac('sha256', stateSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Invalid OAuth state signature');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
  if (payload.exp < Date.now()) throw new Error('OAuth state expired');
  purgeExpiredNonces();
  if (consumedNonces.has(payload.nonce)) {
    throw new Error('OAuth state already used');
  }
  consumedNonces.set(payload.nonce, payload.exp);
  return payload;
}

/** Test helper — clears consumed nonce cache. */
export function resetOAuthStateConsumptionForTests(): void {
  consumedNonces.clear();
}
