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
import {
  humanAssetRoleLabel,
  renderEditorialHotelKitHtml,
} from '../visual-production/kits/editorial-hotel.js';

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

function roleCaption(role: string | null | undefined): string {
  return humanAssetRoleLabel(role) ?? '';
}

export function renderMediaKitHtml(content: MediaKitContent): string {
  if (content.variant === 'hotel') {
    const featured =
      content.assignedAssets.find((a) => a.placement === 'headshot' || a.role === 'headshot') ??
      content.assignedAssets.find((a) => a.publicUrl) ??
      null;
    return renderEditorialHotelKitHtml({
      creatorName: content.creatorName,
      market: content.market,
      headline: content.headline,
      positioning: content.bio,
      partnershipConcept: {
        title: 'One evening, one continuous stay story',
        body: 'Host Kellie for a single evening stay. She films arrival through the room, a meal or lounge moment, and a short neighborhood beat — then publishes an in-feed video plus Stories while she is still on property.',
        deliverables: content.services,
      },
      audience: {
        platform: content.audience.platform,
        handle: content.audience.handle,
        followersCount: content.audience.followersCount,
        medianViewsPerPost: content.audience.medianViewsPerPost,
        totalViews: content.audience.totalViews,
        postsWithMetrics: content.audience.postsWithMetrics,
        engagementRatePercent: content.audience.engagementRatePercent,
        lastSyncedAt: content.audience.lastSyncedAt,
        followersAvailable: content.audience.followersAvailable,
      },
      examples: content.examples,
      examplesStatus: content.examplesStatus ?? 'ready',
      examplesNote: content.examplesNote,
      collaborationTermsPublic: content.disclosure,
      contactEmail: content.contactEmail,
      handle: content.audience.handle
        ? `${content.audience.platform} ${content.audience.handle}`
        : 'TikTok @kckellie',
      portraitDataUrl: featured?.publicUrl ?? null,
      portraitAlt: 'Kellie, Kansas City creator',
      generatedAt: content.generatedAt,
    });
  }

  const a = content.audience;
  const title = `${content.creatorName} — Kansas City creator media kit`;
  const assigned = content.assignedAssets ?? [];
  const featured =
    assigned.find((asset) => asset.placement === 'headshot' || asset.role === 'headshot') ??
    assigned.find((asset) => asset.publicUrl) ??
    null;
  const gallery = assigned.filter((asset) => !featured || asset.id !== featured.id);
  const featuredRole = roleCaption(featured?.role);

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
      : '';

  const featuredBlock = featured?.publicUrl
    ? `<figure class="featured-photo">
        <img src="${esc(featured.publicUrl)}" alt="${esc(featuredRole || 'Kellie')}" width="480" height="640" style="max-width:100%;height:auto;object-fit:contain" />
        ${featuredRole ? `<figcaption class="muted">${esc(featuredRole)}</figcaption>` : ''}
      </figure>`
    : '';

  const photosSection =
    gallery.length > 0
      ? `<section>
    <h2>Photos</h2>
    <ul class="examples photo-grid">${gallery
      .map((asset) => {
        const label = roleCaption(asset.role);
        return `
      <li class="example">
        ${
          asset.publicUrl
            ? `<p><img src="${esc(asset.publicUrl)}" alt="${esc(label || 'Photo')}" style="max-width:100%;height:auto;object-fit:contain" /></p>`
            : ''
        }
        ${label ? `<p class="example-meta">${esc(label)}</p>` : ''}
      </li>`;
      })
      .join('')}</ul>
  </section>`
      : '';

  const examplesSection =
    content.examplesStatus === 'needs_evidence_review'
      ? `<section>
          <h2>Relevant work</h2>
          <p class="muted">On-topic examples are being curated. Unrelated portfolio posts are intentionally not shown.</p>
          <p class="muted">${esc(content.examplesNote)}</p>
        </section>`
      : `<section>
          <h2>Recent work</h2>
          <ul class="examples">${content.examples.map(exampleCard).join('')}</ul>
          <p class="muted">${esc(content.examplesNote)}</p>
        </section>`;

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
  .about-row { display: grid; gap: 16px; align-items: start; }
  @media (min-width: 560px) {
    .about-row.has-photo { grid-template-columns: 1fr 180px; }
  }
  .featured-photo { margin: 0; }
  .featured-photo img {
    display: block; width: 100%; max-width: 220px; height: auto;
    border-radius: 4px; background: #fff; border: 1px solid var(--line);
  }
  .featured-photo figcaption { margin-top: 6px; }
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
    <div class="about-row${featuredBlock ? ' has-photo' : ''}">
      <p>${esc(content.bio)}</p>
      ${featuredBlock}
    </div>
  </section>

  <section>
    <h2>Audience</h2>
    ${audienceBlock(content)}
  </section>

  ${examplesSection}

  ${photosSection}

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
