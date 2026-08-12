import 'server-only';
import { randomUUID } from 'node:crypto';

export type ControlTowerAccessResult = {
  authorized: boolean;
  email: string | null;
  reason: 'cloudflare_access' | 'local_acceptance' | 'admin_not_configured' | 'unauthenticated' | 'not_admin';
};

const ALLOWED_ROUTE_RULES: Array<{ pattern: RegExp; methods: ReadonlySet<string> }> = [
  { pattern: /^summary$/, methods: new Set(['GET']) },
  { pattern: /^spend$/, methods: new Set(['GET']) },
  { pattern: /^dependencies$/, methods: new Set(['GET']) },
  { pattern: /^readiness$/, methods: new Set(['GET']) },
  { pattern: /^workers\/[^/]+\/runs$/, methods: new Set(['GET']) },
];

export function parseAdminEmails(): string[] {
  return (process.env.BENSON_ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function headerEmail(headers: Headers): string | null {
  const cf =
    headers.get('cf-access-authenticated-user-email') ??
    headers.get('Cf-Access-Authenticated-User-Email');
  if (cf) return cf;
  if (isLocalHost(headers)) {
    return headers.get('x-benson-admin-session-email');
  }
  return null;
}

function isLocalHost(headers: Headers): boolean {
  const host = (headers.get('host') ?? '').split(':')[0]?.toLowerCase();
  return host === '127.0.0.1' || host === 'localhost';
}

/** Cloudflare Access is the user auth boundary; admin emails gate Control Tower. */
export function evaluateControlTowerAccess(headers: Headers): ControlTowerAccessResult {
  const adminEmails = parseAdminEmails();
  if (adminEmails.length === 0) {
    return { authorized: false, email: null, reason: 'admin_not_configured' };
  }

  const email = headerEmail(headers)?.trim().toLowerCase() ?? null;
  if (email && adminEmails.includes(email)) {
    return {
      authorized: true,
      email,
      reason: isLocalHost(headers) ? 'local_acceptance' : 'cloudflare_access',
    };
  }

  if (!email) {
    return { authorized: false, email: null, reason: 'unauthenticated' };
  }
  return { authorized: false, email, reason: 'not_admin' };
}

export function isAllowedControlTowerProxyPath(method: string, pathParts: string[]): boolean {
  const suffix = pathParts.join('/');
  if (!suffix || suffix.includes('..')) return false;
  return ALLOWED_ROUTE_RULES.some(
    (rule) => rule.methods.has(method.toUpperCase()) && rule.pattern.test(suffix),
  );
}

export function controlTowerDeniedEnvelope(
  reason: ControlTowerAccessResult['reason'],
  requestId = randomUUID(),
): { ok: false; error: { code: string; message: string; requestId: string } } {
  const messages: Record<ControlTowerAccessResult['reason'], { code: string; message: string }> = {
    admin_not_configured: {
      code: 'ADMIN_NOT_CONFIGURED',
      message: 'Control Tower is not configured for this environment.',
    },
    unauthenticated: {
      code: 'ADMIN_AUTH_REQUIRED',
      message: 'Admin access required.',
    },
    not_admin: {
      code: 'ADMIN_FORBIDDEN',
      message: 'Admin access required.',
    },
    cloudflare_access: { code: 'ADMIN_OK', message: 'Authorized' },
    local_acceptance: { code: 'ADMIN_OK', message: 'Authorized' },
  };
  const row = messages[reason];
  return { ok: false, error: { code: row.code, message: row.message, requestId } };
}
