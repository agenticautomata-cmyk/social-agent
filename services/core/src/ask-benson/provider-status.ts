import type { UrlIntakeDiagnostics } from './url-intake-pipeline.js';

export type AskBensonNormalizedProvider = 'generic' | 'instagram' | 'tiktok';
export type AskBensonProviderStatus =
  | 'processing'
  | 'fallback_active'
  | 'terminal_failure'
  | 'complete';

export type AskBensonProviderStatusState = {
  provider: AskBensonNormalizedProvider;
  status: AskBensonProviderStatus;
  originalUrl: string | null;
  diagnostics: UrlIntakeDiagnostics[];
};

export function normalizedProviderFromUrl(
  value: string | null | undefined,
): AskBensonNormalizedProvider {
  if (!value) return 'generic';
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram';
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  } catch {
    // Invalid/missing URLs remain generic; status copy must not guess a provider.
  }
  return 'generic';
}

function diagnosticsSupportProvider(
  provider: AskBensonNormalizedProvider,
  diagnostics: UrlIntakeDiagnostics[],
): boolean {
  if (provider === 'generic') return true;
  if (provider === 'instagram') {
    return diagnostics.some(
      (entry) =>
        normalizedProviderFromUrl(entry.url) === 'instagram' &&
        (entry.domain === 'instagram.com' || entry.methodsAttempted.includes('instagram_session')),
    );
  }
  // There is no TikTok URL processor yet. A URL alone is not sufficient evidence.
  return false;
}

export function resolveAskBensonProviderStatus(input: {
  sourceUrls?: string[] | null;
  diagnostics?: UrlIntakeDiagnostics[] | null;
  terminal?: boolean;
  complete?: boolean;
}): AskBensonProviderStatusState {
  const diagnostics = input.diagnostics ?? [];
  const originalUrl = input.sourceUrls?.[0] ?? diagnostics[0]?.url ?? null;
  const detectedProvider = normalizedProviderFromUrl(originalUrl);
  const provider = diagnosticsSupportProvider(detectedProvider, diagnostics)
    ? detectedProvider
    : 'generic';

  let status: AskBensonProviderStatus = 'processing';
  if (input.complete) {
    status = 'complete';
  } else if (input.terminal) {
    status = 'terminal_failure';
  } else if (diagnostics.some((entry) => entry.webSearchFallback)) {
    status = 'fallback_active';
  }

  return { provider, status, originalUrl, diagnostics };
}

export type AskBensonTerminalResearchStatus = 'complete' | 'needs_verification' | 'failed';

/**
 * Finalize provider/status when the same assistant message reaches a terminal
 * research state. Preserves URL + diagnostics provenance; never leaves
 * status=processing after research is terminal.
 */
export function resolveAskBensonProviderStatusForResearchTerminal(input: {
  prior?: AskBensonProviderStatusState | null;
  researchStatus: AskBensonTerminalResearchStatus;
}): AskBensonProviderStatusState | null {
  const prior = input.prior;
  if (!prior) return null;
  return resolveAskBensonProviderStatus({
    sourceUrls: prior.originalUrl ? [prior.originalUrl] : null,
    diagnostics: prior.diagnostics ?? [],
    complete: input.researchStatus === 'complete',
    terminal: input.researchStatus !== 'complete',
  });
}

/** Status string written into persisted providerStatus on terminal chat patches. */
export function providerStatusValueForTerminalResearch(
  researchStatus: AskBensonTerminalResearchStatus,
): AskBensonProviderStatus {
  return resolveAskBensonProviderStatus({
    complete: researchStatus === 'complete',
    terminal: researchStatus !== 'complete',
  }).status;
}
