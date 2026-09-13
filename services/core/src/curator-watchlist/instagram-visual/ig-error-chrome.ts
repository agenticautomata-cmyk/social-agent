/**
 * Reject Instagram acquisition / auth / error-page chrome.
 * These strings must never become event titles, findings, leads, or Calendar candidates.
 */

const IG_ERROR_CHROME_PATTERNS: RegExp[] = [
  /sorry,?\s+this\s+page\s+isn['’]?t\s+available/i,
  /the\s+link\s+you\s+followed\s+may\s+be\s+broken/i,
  /page\s+not\s+found/i,
  /log\s*in\s+to\s+continue/i,
  /open\s+(?:the\s+)?app/i,
  /content\s+(?:is\s+)?unavailable/i,
  /this\s+content\s+isn['’]?t\s+available/i,
  /challenge_required|checkpoint|confirm\s+it['’]?s\s+you/i,
  /something\s+went\s+wrong/i,
  /try\s+again\s+later/i,
  /restricted\s+profile/i,
];

/** True when text is (or is dominated by) Instagram error / auth chrome. */
export function isInstagramErrorChrome(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  const head = t.slice(0, 240);
  return IG_ERROR_CHROME_PATTERNS.some((re) => re.test(head));
}

/** True when a candidate title is error chrome (reject at normalization). */
export function isInstagramErrorChromeTitle(title: string | null | undefined): boolean {
  return isInstagramErrorChrome(title);
}
