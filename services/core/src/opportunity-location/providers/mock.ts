import type { LocationSearchContext } from '../types.js';
import type { LocationProvider, LocationProviderResult } from './types.js';
import { mockCandidatesForContext } from './mock-fixtures.js';

export class MockLocationProvider implements LocationProvider {
  readonly id = 'mock';

  async search(context: LocationSearchContext): Promise<LocationProviderResult> {
    const result = mockCandidatesForContext(context);

    if (result.type === 'error') {
      return {
        ok: result.errorCode === 'no_results',
        configured: true,
        providerId: this.id,
        candidates: [],
        errorCode: result.errorCode,
        error: result.error,
      };
    }

    return {
      ok: true,
      configured: true,
      providerId: this.id,
      candidates: result.candidates,
      ...(result.candidates.length === 0
        ? { errorCode: 'no_results' as const, error: 'No matching places found' }
        : {}),
    };
  }
}
