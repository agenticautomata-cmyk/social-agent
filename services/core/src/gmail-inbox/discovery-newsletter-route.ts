import type { DiscoveryIntent } from './email-category.js';

export type DiscoveryNewsletterRouteAction =
  | 'confirmation_only'
  | 'confirmation_and_newsletter'
  | 'newsletter'
  | 'skip_intent'
  | 'opportunity_ingest';

export type DiscoveryNewsletterRoute = {
  action: DiscoveryNewsletterRouteAction;
  runNewsletterIntelligence: boolean;
  runConfirmation: boolean;
};

/**
 * Live discoveries@ routing.
 * An enabled newsletter_sources row is sufficient to run newsletter intelligence.
 * Coarse discovery_intent must not terminal-skip extraction for those sources.
 */
export function resolveDiscoveryNewsletterRoute(input: {
  discoveryIntent: DiscoveryIntent;
  enabledNewsletterSource: boolean;
  hasActiveSubscription: boolean;
}): DiscoveryNewsletterRoute {
  const newsletterAuthority = input.enabledNewsletterSource || input.hasActiveSubscription;

  if (input.discoveryIntent === 'discovery_subscription_confirmation') {
    if (newsletterAuthority) {
      return {
        action: 'confirmation_and_newsletter',
        runNewsletterIntelligence: true,
        runConfirmation: true,
      };
    }
    return {
      action: 'confirmation_only',
      runNewsletterIntelligence: false,
      runConfirmation: true,
    };
  }

  if (
    input.discoveryIntent === 'discovery_subscription_welcome' ||
    input.discoveryIntent === 'discovery_marketing' ||
    input.discoveryIntent === 'discovery_other'
  ) {
    if (newsletterAuthority) {
      return {
        action: 'newsletter',
        runNewsletterIntelligence: true,
        runConfirmation: false,
      };
    }
    return {
      action: 'skip_intent',
      runNewsletterIntelligence: false,
      runConfirmation: false,
    };
  }

  if (newsletterAuthority) {
    return {
      action: 'newsletter',
      runNewsletterIntelligence: true,
      runConfirmation: false,
    };
  }

  return {
    action: 'opportunity_ingest',
    runNewsletterIntelligence: false,
    runConfirmation: false,
  };
}

/**
 * Coarse routing still labels untrusted discovery_opportunity as opportunity_ingest.
 * That path must still run newsletter occurrence extraction so dated list mail
 * cannot be marked processed with zero occurrences.
 */
export function shouldRunNewsletterOccurrenceExtraction(route: DiscoveryNewsletterRoute): boolean {
  return route.runNewsletterIntelligence || route.action === 'opportunity_ingest';
}
