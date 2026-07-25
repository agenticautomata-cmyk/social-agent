import type { LocationSearchContext } from '../types.js';
import type { RawLocationCandidate } from '../scoring.js';

export type LocationProviderErrorCode =
  | 'not_configured'
  | 'no_results'
  | 'rate_limit'
  | 'provider_error';

export type LocationProviderDiagnostics = {
  httpStatus: number | null;
  latencyMs: number;
  resultCount: number;
  success: boolean;
};

export type LocationProviderResult = {
  ok: boolean;
  configured: boolean;
  providerId: string;
  candidates: RawLocationCandidate[];
  error?: string;
  errorCode?: LocationProviderErrorCode;
  diagnostics?: LocationProviderDiagnostics;
};

export interface LocationProvider {
  readonly id: string;
  search(context: LocationSearchContext): Promise<LocationProviderResult>;
}
