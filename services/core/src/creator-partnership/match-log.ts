/** Structured, privacy-safe logging for email → partnership/platform matching. */
export function logCreatorEmailMatch(event: string, data: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      scope: 'creator-email-match',
      event,
      ...data,
      at: new Date().toISOString(),
    }),
  );
}
