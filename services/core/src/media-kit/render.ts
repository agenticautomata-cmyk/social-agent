/**
 * Renders a media kit as a standalone HTML page.
 *
 * Standalone on purpose: this URL is pasted into a pitch, so the reader is a hotel's
 * marketing manager on a phone, not Kellie inside the studio. No Benson navigation, no
 * app shell, no client-side JavaScript — one document that loads on a hotel's guest
 * wifi and prints to a single clean page.
 *
 * Everything rendered comes from the stored snapshot, so the page can never show a
 * number the pitch did not also quote.
 */

import type { MediaKitContent, MediaKitExample } from './build.js';

/** Escapes text for HTML. Every dynamic value passes through this. */
function esc(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function num(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString('en-US');
}

function monthYear(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function exampleCard(example: MediaKitExample): string {
  const when = monthYear(example.postedAt);
  const title = example.url
    ? `<a href="${esc(example.url)}" rel="noopener nofollow">${esc(example.title)}</a>`
    : esc(example.title);
  return `
    <li class="example">
      <p class="example-title">${title}</p>
      <p class="example-meta">${num(example.views)} views${
        example.engagement !== null ? ` · ${num(example.engagement)} likes, comments and shares` : ''
      }${when ? ` · ${esc(when)}` : ''}</p>
    </li>`;
}

/**
 * The audience block.
 *
 * Only states what the connector actually returned. If a figure is missing it is
 * omitted rather than filled with a band like "over 5K followers", which is what the
 * old pitch path did.
 */
function audienceBlock(content: MediaKitContent): string {
  const a = content.audience;
  if (!a.followersAvailable) {
    return `<p class="muted">Audience figures are being re-synced and are deliberately not shown rather than estimated.</p>`;
  }

  const stats: Array<{ label: string; value: string }> = [
    { label: 'Followers', value: num(a.followersCount) },
  ];
  if (a.medianViewsPerPost !== null) {
    stats.push({ label: 'Median views per post', value: num(a.medianViewsPerPost) });
  }
  if (a.totalViews !== null) {
    stats.push({ label: `Views across ${num(a.postsWithMetrics)} posts`, value: num(a.totalViews) });
  }
  if (a.engagementRatePercent !== null) {
    stats.push({ label: 'Engagement against views', value: `${a.engagementRatePercent}%` });
  }

  const synced = a.lastSyncedAt
    ? new Date(a.lastSyncedAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return `
    <dl class="stats">
      ${stats
        .map(
          (stat) => `<div class="stat">
        <dt>${esc(stat.label)}</dt>
        <dd>${esc(stat.value)}</dd>
      </div>`,
        )
        .join('')}
    </dl>
    <p class="muted">
      ${esc(a.platform)} ${a.handle ? esc(a.handle) : ''} · figures pulled directly from the
      connected account${synced ? `, last synced ${esc(synced)}` : ''}.
    </p>`;
}

export function renderMediaKitHtml(content: MediaKitContent): string {
  const a = content.audience;
  const title = `${content.creatorName} — Kansas City creator media kit`;

  const partnerships =
    content.verifiedPartnerships.length > 0
      ? `<section>
          <h2>Past partnerships</h2>
          <ul class="plain">
            ${content.verifiedPartnerships
              .map(
                (p) =>
                  `<li><strong>${esc(p.business)}</strong> — ${esc(p.what)} <span class="muted">(${esc(p.when)})</span></li>`,
              )
              .join('')}
          </ul>
        </section>`
      : // Saying nothing is better than padding this with unverified claims. A hotel
        // can tell the difference and it is the fastest way to lose the pitch.
        '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
  :root {
    --ink: #16161a;
    --muted: #5c5c66;
    --line: #e4e4ea;
    --accent: #7c3f2e;
    --bg: #fbfaf8;
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    padding: 24px 20px 56px;
    background: var(--bg);
    color: var(--ink);
    font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  main { max-width: 640px; margin: 0 auto; }
  h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 6px; letter-spacing: -0.01em; }
  h2 {
    font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--accent); margin: 34px 0 10px;
  }
  p { margin: 0 0 12px; }
  .lede { font-size: 1rem; color: var(--muted); margin-bottom: 4px; }
  .muted { color: var(--muted); font-size: 0.86rem; }
  section { border-top: 1px solid var(--line); padding-top: 4px; }
  section:first-of-type { border-top: 0; }
  .stats {
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px; margin: 0 0 12px;
  }
  .stat { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; }
  .stat dt { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
  .stat dd { margin: 4px 0 0; font-size: 1.3rem; font-weight: 650; font-variant-numeric: tabular-nums; }
  ul.plain, ul.examples { list-style: none; padding: 0; margin: 0 0 12px; }
  ul.plain li { padding: 6px 0 6px 16px; position: relative; }
  ul.plain li::before {
    content: ""; position: absolute; left: 0; top: 15px;
    width: 5px; height: 5px; border-radius: 50%; background: var(--accent);
  }
  .example { padding: 10px 0; border-bottom: 1px solid var(--line); }
  .example:last-child { border-bottom: 0; }
  .example-title { margin: 0 0 2px; font-weight: 560; }
  .example-meta { margin: 0; color: var(--muted); font-size: 0.84rem; font-variant-numeric: tabular-nums; }
  a { color: var(--accent); }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; padding: 0; list-style: none; }
  .tags li {
    border: 1px solid var(--line); background: #fff; border-radius: 999px;
    padding: 4px 11px; font-size: 0.84rem;
  }
  footer { margin-top: 36px; border-top: 1px solid var(--line); padding-top: 14px; }
  /* One clean page, no dark backgrounds burning ink. */
  @media print {
    body { padding: 0; background: #fff; }
    h2 { margin-top: 18px; }
    .stat { break-inside: avoid; }
    section { break-inside: avoid; }
  }
</style>
</head>
<body>
<main>
  <header>
    <h1>${esc(content.creatorName)}</h1>
    <p class="lede">${esc(content.headline)}</p>
    <p class="muted">${esc(content.market)}</p>
  </header>

  <section>
    <h2>About</h2>
    <p>${esc(content.bio)}</p>
  </section>

  <section>
    <h2>Audience</h2>
    ${audienceBlock(content)}
  </section>

  <section>
    <h2>Recent work</h2>
    <ul class="examples">${content.examples.map(exampleCard).join('')}</ul>
    <p class="muted">${esc(content.examplesNote)}</p>
  </section>

  <section>
    <h2>What a collaboration includes</h2>
    <ul class="plain">${content.services.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
  </section>

  <section>
    <h2>Coverage</h2>
    <ul class="tags">${content.coverage.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    <h2>Content</h2>
    <ul class="tags">${content.contentCategories.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
  </section>

  ${partnerships}

  <section>
    <h2>Disclosure and usage</h2>
    <ul class="plain">${content.disclosure.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
  </section>

  <footer>
    <p class="muted">
      ${content.contactEmail ? `Contact: <a href="mailto:${esc(content.contactEmail)}">${esc(content.contactEmail)}</a> · ` : ''}
      ${a.handle ? `${esc(a.platform)} ${esc(a.handle)} · ` : ''}Prepared ${esc(
        monthYear(content.generatedAt) ?? '',
      )}.
    </p>
  </footer>
</main>
</body>
</html>`;
}
