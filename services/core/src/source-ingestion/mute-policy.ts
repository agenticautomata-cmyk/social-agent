import { isMajorEventException } from '../creator-agent/exclusion-rules.js';

export type SourceMutePolicy = 'none' | 'always_ignore';

export type SourceMuteDecision = {
  muted: boolean;
  reason: string;
};

/**
 * Reads the persisted per-source content policy. Stored on `sources.config.mutePolicy`
 * so it survives future ingestion runs without depending on regex text-matching alone.
 */
export function getSourceMutePolicy(config: unknown): SourceMutePolicy {
  const raw = (config as Record<string, unknown> | null | undefined)?.mutePolicy;
  return raw === 'always_ignore' ? 'always_ignore' : 'none';
}

/**
 * Returns a new config object with the mute policy applied. Preserves all other
 * existing config keys (feed URLs, limits, etc).
 */
export function withSourceMutePolicy(
  config: unknown,
  policy: SourceMutePolicy,
  setBy?: string,
): Record<string, unknown> {
  const base = typeof config === 'object' && config !== null ? (config as Record<string, unknown>) : {};
  return {
    ...base,
    mutePolicy: policy,
    mutePolicyUpdatedAt: new Date().toISOString(),
    ...(setBy ? { mutePolicySetBy: setBy } : {}),
  };
}

/**
 * Decides whether an item from a muted source should be hidden. A source with
 * `always_ignore` still surfaces genuinely notable exceptions (major celebrity,
 * viral exhibit, etc.) rather than blanket-suppressing everything forever.
 */
export function evaluateSourceMute(config: unknown, text: string): SourceMuteDecision {
  const policy = getSourceMutePolicy(config);
  if (policy !== 'always_ignore') {
    return { muted: false, reason: 'source_policy:none' };
  }
  if (isMajorEventException(text)) {
    return { muted: false, reason: 'source_policy:always_ignore_exception_major_event' };
  }
  return { muted: true, reason: 'source_policy:always_ignore' };
}
