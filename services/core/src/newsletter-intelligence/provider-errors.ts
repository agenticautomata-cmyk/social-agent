export function isProviderQuotaError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /429|credits remaining|insufficient_quota|credit_balance|rate limit/i.test(message);
}
