export {
  assertPublicHost,
  safeConfirmSubscriptionLink,
  validateConfirmationUrl,
  type SafeFetchBlockReason,
  type SafeFetchResult,
} from '../discovery-subscriptions/safe-fetch.js';

import { assertPublicHost, safeConfirmSubscriptionLink } from '../discovery-subscriptions/safe-fetch.js';

export async function scoutSafeFetch(url: string) {
  return safeConfirmSubscriptionLink(url);
}

export async function assertScoutUrlAllowed(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  const blocked = await assertPublicHost(parsed.hostname);
  if (blocked) {
    throw new Error('URL is not allowed for Scout fetching');
  }
}
