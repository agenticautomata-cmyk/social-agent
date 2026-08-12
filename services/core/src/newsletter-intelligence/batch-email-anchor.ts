/**
 * Deterministic Gmail sent-time anchor for offline batch/readiness scripts.
 * Production ingestion uses message.internalDate — never wall-clock time here.
 */
export function stableBatchEmailSentAt(gmailMessageId: string): string {
  let hash = 0;
  for (const ch of gmailMessageId) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  const dayOffset = hash % 120;
  const base = new Date(Date.UTC(2026, 5, 1, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + dayOffset);
  return base.toISOString();
}
