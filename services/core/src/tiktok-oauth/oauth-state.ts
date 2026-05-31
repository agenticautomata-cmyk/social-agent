import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { getTikTokClientSecret, getTikTokOAuthConfig } from './config.js';

const STATE_TTL_MS = 10 * 60 * 1000;

type StatePayload = {
  nonce: string;
  exp: number;
  creatorAccountId: string;
};

function stateSecret(): string {
  const cfg = getTikTokOAuthConfig();
  const secret = getTikTokClientSecret();
  if (!secret) {
    throw new Error('TIKTOK_CLIENT_SECRET is required for OAuth state signing');
  }
  return `${secret}:oauth-state`;
}

export function createOAuthState(creatorAccountId: string): string {
  const payload: StatePayload = {
    nonce: randomBytes(16).toString('hex'),
    exp: Date.now() + STATE_TTL_MS,
    creatorAccountId,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyOAuthState(state: string): StatePayload {
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
  if (!payload.creatorAccountId) throw new Error('OAuth state missing account');
  return payload;
}
