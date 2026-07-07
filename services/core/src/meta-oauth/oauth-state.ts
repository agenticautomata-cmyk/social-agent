import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { getMetaAppSecret, getMetaOAuthConfig } from './config.js';

const STATE_TTL_MS = 10 * 60 * 1000;

type StatePayload = {
  nonce: string;
  exp: number;
  instagramAccountId: string;
  facebookAccountId: string;
};

function stateSecret(): string {
  const secret = getMetaAppSecret();
  if (!secret) {
    throw new Error('IG_APP_SECRET is required for Meta OAuth state signing');
  }
  return `${secret}:meta-oauth-state`;
}

export function createMetaOAuthState(
  instagramAccountId: string,
  facebookAccountId: string,
): string {
  const payload: StatePayload = {
    nonce: randomBytes(16).toString('hex'),
    exp: Date.now() + STATE_TTL_MS,
    instagramAccountId,
    facebookAccountId,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyMetaOAuthState(state: string): StatePayload {
  getMetaOAuthConfig(); // ensure configured before verify
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
  if (!payload.instagramAccountId || !payload.facebookAccountId) {
    throw new Error('OAuth state missing account ids');
  }
  return payload;
}
