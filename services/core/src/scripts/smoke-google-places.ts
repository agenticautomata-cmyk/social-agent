import 'dotenv/config';
import { env } from '../env.js';
import { GooglePlacesLocationProvider } from '../opportunity-location/providers/google-places.js';
import { buildLocationSearchQuery, decideLocationResolution, scoreLocationCandidate } from '../opportunity-location/scoring.js';
import type { LocationSearchContext } from '../opportunity-location/types.js';

type SmokeCase = {
  label: string;
  context: LocationSearchContext;
  expectStatus: 'resolved' | 'needs_review' | 'unresolved';
};

const CASES: SmokeCase[] = [
  {
    label: 'Union Station Kansas City',
    context: {
      venueName: 'Union Station Kansas City',
      address: '30 W Pershing Rd, Kansas City, MO 64108',
      city: 'Kansas City',
      state: 'MO',
    },
    expectStatus: 'resolved',
  },
  {
    label: 'Country Club Plaza Kansas City',
    context: {
      venueName: 'Country Club Plaza',
      city: 'Kansas City',
      state: 'MO',
    },
    expectStatus: 'resolved',
  },
  {
    label: 'Starbucks Kansas City',
    context: {
      businessName: 'Starbucks',
      city: 'Kansas City',
      state: 'MO',
    },
    expectStatus: 'needs_review',
  },
  {
    label: 'The Midland Kansas City',
    context: {
      venueName: 'The Midland',
      city: 'Kansas City',
      state: 'MO',
    },
    expectStatus: 'resolved',
  },
  {
    label: 'Nonexistent Kansas City business',
    context: {
      businessName: 'Zorbax Nonexistent Cafe KC',
      city: 'Kansas City',
      state: 'MO',
    },
    expectStatus: 'unresolved',
  },
];

function redactSecrets(text: string): string {
  return text.replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED]');
}

async function runCase(provider: GooglePlacesLocationProvider, testCase: SmokeCase) {
  const query = buildLocationSearchQuery(testCase.context);
  const result = await provider.search(testCase.context);
  const scored = result.candidates.map((candidate) =>
    scoreLocationCandidate(candidate, testCase.context),
  );
  const decision = decideLocationResolution(scored, testCase.context);
  const best = [...scored].sort((a, b) => b.score - a.score)[0] ?? null;

  return {
    label: testCase.label,
    query,
    httpStatus: result.diagnostics?.httpStatus ?? null,
    resultCount: result.diagnostics?.resultCount ?? result.candidates.length,
    latencyMs: result.diagnostics?.latencyMs ?? null,
    providerConfigured: result.configured,
    providerError: result.error ? redactSecrets(result.error) : null,
    bestCandidate: best?.displayName ?? null,
    formattedAddress: best?.formattedAddress ?? null,
    confidence: best?.score ?? null,
    finalStatus: decision.status,
    autoResolved: decision.status === 'resolved',
    needsReview: decision.status === 'needs_review',
    expectedStatus: testCase.expectStatus,
    pass:
      decision.status === testCase.expectStatus ||
      (testCase.expectStatus === 'unresolved' &&
        (decision.status === 'unresolved' || result.errorCode === 'no_results')),
  };
}

async function main() {
  const providerConfigured = env.LOCATION_PROVIDER === 'google' && Boolean(env.GOOGLE_PLACES_API_KEY?.trim());
  console.log('=== Google Places live smoke test ===');
  console.log(`provider: ${env.LOCATION_PROVIDER}`);
  console.log(`provider configured: ${providerConfigured}`);

  if (!providerConfigured) {
    console.error('Set LOCATION_PROVIDER=google and configure the server Places key before running smoke tests.');
    process.exit(1);
  }

  const provider = new GooglePlacesLocationProvider(env.GOOGLE_PLACES_API_KEY);
  const results = [];
  for (const testCase of CASES) {
    results.push(await runCase(provider, testCase));
  }

  console.log('\n=== Results ===');
  for (const row of results) {
    console.log(JSON.stringify(row, null, 2));
  }

  const failed = results.filter((row) => !row.pass);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(redactSecrets(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
