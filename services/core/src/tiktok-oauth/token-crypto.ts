/**
 * Phase B placeholder token encryption.
 *
 * NOT production-safe: base64 encoding only. Before production, replace with
 * AES-256-GCM (or KMS envelope encryption) using TOKEN_ENCRYPTION_KEY from a
 * secrets manager. Never log plaintext or ciphertext in application logs.
 */

const PREFIX = 'enc:v1:';

export function encryptToken(plaintext: string): string {
  return `${PREFIX}${Buffer.from(plaintext, 'utf8').toString('base64url')}`;
}

export function decryptToken(blob: string | null | undefined): string | null {
  if (!blob) return null;
  if (!blob.startsWith(PREFIX)) {
    throw new Error('Unsupported token encryption format');
  }
  return Buffer.from(blob.slice(PREFIX.length), 'base64url').toString('utf8');
}

/** Safe for logs — never includes token material. */
export function redactTokenRef(_token?: string | null): string {
  return '[redacted]';
}
