/**
 * Hard ban on inferring email addresses from person names or common formats.
 *
 * Discovery may only record addresses that appear on an official published page
 * (or trusted workbook with provenance). Guessing first.last@domain is never
 * allowed and never becomes send-ready evidence.
 */

export type EmailInferenceRejection = {
  allowed: false;
  reason: string;
  /** Pattern family that was refused, when detected. */
  patternFamily:
    | 'first_last'
    | 'first_dot_last'
    | 'flast'
    | 'first_initial_last'
    | 'generic_guess'
    | 'name_local_part'
    | null;
};

export type EmailInferenceAllowed = {
  allowed: true;
  reason: null;
  patternFamily: null;
};

export type EmailInferenceVerdict = EmailInferenceRejection | EmailInferenceAllowed;

function normalizePersonTokens(name: string | null | undefined): string[] {
  return (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/[\s'-]+/)
    .filter((token) => token.length > 1);
}

function localPart(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return null;
  return trimmed.slice(0, at);
}

/**
 * Detects whether a candidate address looks like it was fabricated from a name
 * rather than copied from a published page.
 *
 * Call this when the address was NOT observed on an official source. When
 * `sourceIsOfficial` is true and `observedOnPage` is true, inference checks
 * do not apply — the page published the address.
 */
export function evaluateEmailFormatInference(input: {
  personName?: string | null;
  email?: string | null;
  /** True only when the exact address was copied from an official page. */
  observedOnOfficialPage: boolean;
  /** Domain someone proposed for guessing (without observing an address). */
  guessedDomain?: string | null;
}): EmailInferenceVerdict {
  if (input.observedOnOfficialPage && input.email?.trim()) {
    return { allowed: true, reason: null, patternFamily: null };
  }

  if (!input.email?.trim()) {
    // Proposing a guess without an observed address is always refused.
    if (input.personName?.trim() && input.guessedDomain?.trim()) {
      return {
        allowed: false,
        reason:
          'Benson never invents an email from a person\'s name and a domain. Only addresses published on an official page may be recorded.',
        patternFamily: 'generic_guess',
      };
    }
    return { allowed: true, reason: null, patternFamily: null };
  }

  const local = localPart(input.email);
  if (!local) {
    return {
      allowed: false,
      reason: 'Address is not a usable email.',
      patternFamily: 'generic_guess',
    };
  }

  const tokens = normalizePersonTokens(input.personName);
  if (tokens.length === 0) {
    // Without a name we still refuse when the caller admits the address was not observed.
    return {
      allowed: false,
      reason:
        'Address was not observed on an official page, so it cannot be stored as verified contact evidence.',
      patternFamily: 'generic_guess',
    };
  }

  const first = tokens[0]!;
  const last = tokens[tokens.length - 1]!;

  const candidates: Array<{ family: EmailInferenceRejection['patternFamily']; value: string }> = [
    { family: 'first_dot_last', value: `${first}.${last}` },
    { family: 'first_last', value: `${first}${last}` },
    { family: 'flast', value: `${first[0]}${last}` },
    { family: 'first_initial_last', value: `${first[0]}.${last}` },
    { family: 'name_local_part', value: first },
    { family: 'name_local_part', value: last },
  ];

  for (const candidate of candidates) {
    if (local === candidate.value || local.replace(/[._-]/g, '') === candidate.value.replace(/[._-]/g, '')) {
      return {
        allowed: false,
        reason: `Refusing name-derived email pattern (${candidate.family}). Never infer an address from a person\'s name.`,
        patternFamily: candidate.family,
      };
    }
  }

  return {
    allowed: false,
    reason:
      'Address was not observed on an official page. Discovery will not treat inferred or third-hand addresses as verified.',
    patternFamily: 'generic_guess',
  };
}

/**
 * Convenience guard used by evidence builders. Returns a human reason when the
 * address must be rejected, otherwise null.
 */
export function emailInferenceBlockReason(input: {
  personName?: string | null;
  email?: string | null;
  observedOnOfficialPage: boolean;
  guessedDomain?: string | null;
}): string | null {
  const verdict = evaluateEmailFormatInference(input);
  return verdict.allowed ? null : verdict.reason;
}
