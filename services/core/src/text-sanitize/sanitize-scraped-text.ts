/**
 * One canonical, deterministic sanitizer for text scraped/fetched from external
 * sources before it is persisted or rendered. Every provider used to carry its
 * own partial `stripHtml`, none of which stripped `<style>`/`<script>` bodies or
 * decoded the full numeric HTML entity range — so production cards showed raw
 * artifacts like `&#8217;`, `&#038;`, and leaked CSS selector text such as
 * `#lcs_slide_out_button13044 > img { transform: rotate(-90deg) !important; }`.
 *
 * This module is intentionally rule-based (not model-based) so it is fast,
 * stable, and safe to run on every ingested record.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '\u2014',
  ndash: '\u2013',
  hellip: '\u2026',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201d',
  ldquo: '\u201c',
  eacute: '\u00e9',
  egrave: '\u00e8',
  ecirc: '\u00ea',
  euml: '\u00eb',
  aacute: '\u00e1',
  agrave: '\u00e0',
  acirc: '\u00e2',
  auml: '\u00e4',
  aring: '\u00e5',
  iacute: '\u00ed',
  igrave: '\u00ec',
  icirc: '\u00ee',
  iuml: '\u00ef',
  oacute: '\u00f3',
  ograve: '\u00f2',
  ocirc: '\u00f4',
  ouml: '\u00f6',
  uacute: '\u00fa',
  ugrave: '\u00f9',
  ucirc: '\u00fb',
  uuml: '\u00fc',
  ntilde: '\u00f1',
  ccedil: '\u00e7',
  Eacute: '\u00c9',
  Aacute: '\u00c1',
  Ntilde: '\u00d1',
};

function decodeHtmlEntitiesOnce(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return '';
      }
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      try {
        return String.fromCodePoint(Number(dec));
      } catch {
        return '';
      }
    })
    .replace(/&([a-zA-Z]+);/g, (full, name: string) => {
      if (name in NAMED_ENTITIES) return NAMED_ENTITIES[name]!;
      const lower = name.toLowerCase();
      return lower in NAMED_ENTITIES ? NAMED_ENTITIES[lower]! : full;
    });
}

/** Runs decoding up to 3 passes to unwind double-encoded entities like `&amp;amp;` -> `&amp;` -> `&`. */
export function decodeHtmlEntitiesDeterministic(text: string): string {
  if (!text) return text;
  let current = text;
  for (let i = 0; i < 3; i += 1) {
    const next = decodeHtmlEntitiesOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

/** Strips <script>, <style>, <noscript> tags AND their inner text (the common leak). */
function stripScriptAndStyleBlocks(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, ' ');
}

/** Removes bare CSS/JS artifact fragments that survive as inline text nodes (no surrounding tags). */
const CSS_RULE_LINE_RE = /(?:^|\n)\s*[#.]?[\w-]+(?:\s*[>+~]\s*[\w.#-]+)*\s*\{[^{}]*\}\s*(?=\n|$)/g;
const CSS_DECLARATION_FRAGMENT_RE =
  /[#.][\w-]+(?:\s*[>+~]\s*[\w.:()-]+)*\s*\{[^{}]{0,300}?(?:!important;?)?\s*\}/gi;
const INLINE_JS_FUNCTION_RE = /\bfunction\s*\([^)]*\)\s*\{[^{}]{0,500}\}/gi;
const CSS_SELECTOR_STRAY_RE = /#[\w-]{3,}\s*>\s*[\w.#-]+\s*\{[^}]*\}/g;
/** Common email-client boilerplate CSS resets (Apple Mail auto-detected links, Outlook, etc). */
const EMAIL_CLIENT_CSS_RE =
  /[\w.#*-]+(?:\[[^\]]*\])?(?:\s*,\s*[\w.#*-]+(?:\[[^\]]*\])?)*\s*\{\s*[\w:;\s!-]*!important;?\s*\}/gi;
const CSS_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
/** @media blocks with up to one level of nested rule braces (typical of email/newsletter template CSS). */
const CSS_MEDIA_BLOCK_RE = /@media[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/gi;
/** A loose run of CSS-selector-looking tokens (".foo .bar > .baz, .qux") with no real prose words nearby. */
const CSS_SELECTOR_SOUP_RE = /(?:^|\s)(?:[.#][\w-]+[\s,>~+]*){3,}(?=\{|\s|$)/g;
/** Markdown-style autolinks that are really tracking-parameter spam, e.g. <https://x.com/?ss_campaign_id=...>. */
const TRACKING_AUTOLINK_RE = /<https?:\/\/[^\s>]*(?:utm_|ss_campaign|ss_source|ss_email)[^\s>]*>/gi;

function stripCssJsArtifacts(text: string): string {
  return text
    .replace(CSS_COMMENT_RE, ' ')
    .replace(CSS_MEDIA_BLOCK_RE, ' ')
    .replace(TRACKING_AUTOLINK_RE, ' ')
    .replace(EMAIL_CLIENT_CSS_RE, ' ')
    .replace(CSS_RULE_LINE_RE, ' ')
    .replace(CSS_DECLARATION_FRAGMENT_RE, ' ')
    .replace(CSS_SELECTOR_STRAY_RE, ' ')
    .replace(CSS_SELECTOR_SOUP_RE, ' ')
    .replace(INLINE_JS_FUNCTION_RE, ' ');
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

const NAV_BOILERPLATE_RE =
  /\b(skip to (?:main )?content|share on facebook|share on twitter|click to share|read more\s*[»›]?|continue reading|subscribe to our newsletter|advertisement)\b/gi;

/** Handles truncated CSS (no closing brace) that survives because the source was cut off mid-rule. */
const TRAILING_UNCLOSED_CSS_RE = /(?:^|\s)[\w.#*[\]:,\s-]{0,120}\{[^{}]*$/;

export function sanitizeScrapedText(raw: string | null | undefined): string {
  if (!raw) return '';
  let text = raw;
  text = stripScriptAndStyleBlocks(text);
  text = stripHtmlTags(text);
  text = decodeHtmlEntitiesDeterministic(text);
  text = stripCssJsArtifacts(text);
  text = text.replace(TRAILING_UNCLOSED_CSS_RE, ' ');
  text = text.replace(NAV_BOILERPLATE_RE, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/** Lighter-weight pass for already-plain text (titles) — no HTML tag stripping needed, just entities + CSS/JS leak cleanup. */
export function sanitizeScrapedTitle(raw: string | null | undefined): string {
  if (!raw) return '';
  let text = decodeHtmlEntitiesDeterministic(raw);
  text = stripCssJsArtifacts(text);
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/** True when the text still looks like it contains raw markup/CSS/JS artifacts after sanitization — used as a data-quality circuit breaker. */
export function looksLikeUnsanitizedArtifact(text: string | null | undefined): boolean {
  if (!text) return false;
  return (
    /&#\d+;|&#x[0-9a-f]+;|&[a-z]+;/i.test(text) ||
    /[#.][\w-]+\s*\{[^}]*\}/.test(text) ||
    /!important/i.test(text) ||
    /\bfunction\s*\(/i.test(text) ||
    /<\/?[a-z][\s\S]*>/i.test(text)
  );
}
