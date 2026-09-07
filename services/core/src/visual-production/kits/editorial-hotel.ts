/**
 * Editorial hotel media-kit HTML — partnership document, not a credibility DB dump.
 * Facts stay in structured HTML text. Kellie portrait is a local approved asset only.
 */

export type EditorialKitAudience = {
  platform: string;
  handle: string | null;
  followersCount: number | null;
  medianViewsPerPost: number | null;
  totalViews: number | null;
  postsWithMetrics: number | null;
  engagementRatePercent: number | null;
  lastSyncedAt: string | null;
  followersAvailable: boolean;
};

export type EditorialKitExample = {
  title: string;
  url: string | null;
  views: number | null;
  engagement: number | null;
};

export type EditorialHotelKitContent = {
  creatorName: string;
  market: string;
  headline: string;
  positioning: string;
  partnershipConcept: {
    title: string;
    body: string;
    deliverables: string[];
  };
  audience: EditorialKitAudience;
  examples: EditorialKitExample[];
  examplesStatus: 'ready' | 'needs_evidence_review';
  examplesNote: string;
  collaborationTermsPublic: string[];
  contactEmail: string | null;
  handle: string;
  portraitDataUrl: string | null;
  portraitAlt: string;
  generatedAt: string;
};

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

function monthYear(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Map internal role enums to human labels for any public surface. */
export function humanAssetRoleLabel(role: string | null | undefined): string | null {
  const r = (role ?? '').trim();
  if (!r || r === 'other' || r === 'proof_still') return null;
  const map: Record<string, string> = {
    hero: 'Featured photo',
    headshot: 'Portrait',
    lifestyle: 'Lifestyle',
    property: 'Property',
    food: 'Food',
    event: 'Event',
  };
  return map[r] ?? null;
}

export function renderEditorialHotelKitHtml(content: EditorialHotelKitContent): string {
  const a = content.audience;
  const synced = a.lastSyncedAt
    ? new Date(a.lastSyncedAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const portrait = content.portraitDataUrl
    ? `<figure class="portrait">
        <img src="${esc(content.portraitDataUrl)}" alt="${esc(content.portraitAlt)}" />
      </figure>`
    : '';

  const examplesSection =
    content.examplesStatus === 'needs_evidence_review'
      ? `<section class="panel">
          <h2>Relevant work</h2>
          <p class="hold">On-topic hotel stay examples are being curated. Unrelated portfolio posts are intentionally not shown.</p>
          <p class="muted">${esc(content.examplesNote)}</p>
        </section>`
      : `<section class="panel">
          <h2>Relevant work</h2>
          <ul class="examples">
            ${content.examples
              .map(
                (ex) => `<li>
              ${
                ex.url
                  ? `<a href="${esc(ex.url)}" rel="noopener nofollow">${esc(ex.title)}</a>`
                  : `<span>${esc(ex.title)}</span>`
              }
              <p class="meta">${num(ex.views)} views${
                  ex.engagement !== null ? ` · ${num(ex.engagement)} engagements` : ''
                }</p>
            </li>`,
              )
              .join('')}
          </ul>
          <p class="muted">${esc(content.examplesNote)}</p>
        </section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(content.creatorName)} — Hotel partnership kit</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  :root {
    --navy: #0B1F3A;
    --navy-deep: #071628;
    --yellow: #F5C518;
    --teal: #1FA6A0;
    --cream: #F7F1E3;
    --ink: #101820;
    --muted: #5c6675;
    --line: #e6e1d6;
    --paper: #fbf8f2;
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font: 17px/1.55 "DM Sans", Helvetica, Arial, sans-serif;
  }
  .hero {
    min-height: 78vh;
    padding: 36px 28px 40px;
    background:
      linear-gradient(145deg, rgba(7,22,40,0.94), rgba(11,31,58,0.9) 55%, rgba(14,111,107,0.35)),
      var(--navy);
    color: var(--cream);
    display: grid;
    gap: 28px;
  }
  @media (min-width: 720px) {
    .hero {
      grid-template-columns: 1.2fr 0.8fr;
      align-items: end;
      padding: 52px 56px 48px;
      min-height: 70vh;
    }
  }
  .hero-concept {
    margin-top: 22px;
    padding: 14px 16px;
    border-left: 4px solid var(--yellow);
    background: rgba(255,255,255,0.06);
    max-width: 36rem;
  }
  .hero-concept strong {
    display: block;
    font-family: "IBM Plex Mono", monospace;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--yellow);
    margin-bottom: 6px;
  }
  .hero-concept p { margin: 0; font-size: 1rem; color: rgba(247,241,227,0.92); }
  .kicker {
    font-family: "IBM Plex Mono", monospace;
    font-size: 0.78rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--yellow);
    margin: 0 0 14px;
  }
  h1 {
    font-family: "Bebas Neue", Impact, sans-serif;
    font-size: clamp(3.4rem, 10vw, 5.6rem);
    line-height: 0.9;
    letter-spacing: 0.02em;
    margin: 0 0 12px;
  }
  .lede {
    font-size: 1.15rem;
    max-width: 34rem;
    margin: 0;
    color: rgba(247,241,227,0.9);
  }
  .market {
    margin-top: 18px;
    font-family: "IBM Plex Mono", monospace;
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--teal);
  }
  .portrait {
    margin: 0;
    justify-self: end;
    width: min(100%, 320px);
  }
  .portrait img {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 2 / 3;
    object-fit: cover;
    object-position: center 12%;
    border: 1px solid rgba(245,197,24,0.45);
  }
  main {
    max-width: 920px;
    margin: 0 auto;
    padding: 28px 20px 64px;
  }
  .panel {
    border-top: 1px solid var(--line);
    padding: 28px 0;
  }
  h2 {
    font-family: "Bebas Neue", Impact, sans-serif;
    font-size: 1.8rem;
    letter-spacing: 0.04em;
    margin: 0 0 12px;
    color: var(--navy);
  }
  h3 {
    font-size: 1.05rem;
    margin: 0 0 8px;
    color: var(--navy);
  }
  .concept {
    background: #fff;
    border-left: 4px solid var(--yellow);
    padding: 18px 20px;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 0 0 12px;
    padding: 0;
    list-style: none;
  }
  @media (min-width: 640px) {
    .stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
  .stat {
    background: #fff;
    border: 1px solid var(--line);
    padding: 14px 14px 12px;
  }
  .stat dt {
    font-family: "IBM Plex Mono", monospace;
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .stat dd {
    margin: 6px 0 0;
    font-size: 1.35rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--navy);
  }
  .examples { list-style: none; margin: 0; padding: 0; }
  .examples li {
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  .examples a { color: var(--navy); font-weight: 600; text-decoration-thickness: 1px; }
  .meta, .muted { color: var(--muted); font-size: 0.9rem; }
  .hold {
    background: #fff8e8;
    border: 1px solid #ead7a0;
    padding: 14px 16px;
    margin: 0 0 10px;
  }
  ul.plain { margin: 0; padding-left: 1.1rem; }
  ul.plain li { margin: 0 0 8px; }
  footer {
    margin-top: 12px;
    padding-top: 18px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 0.9rem;
  }
  @media print {
    .hero { min-height: auto; }
    .portrait img { max-height: 320px; }
  }
</style>
</head>
<body>
  <header class="hero">
    <div>
      <p class="kicker">KCKellie · Hotel partnership kit</p>
      <h1>${esc(content.creatorName)}</h1>
      <p class="lede">${esc(content.headline)}</p>
      <p class="market">${esc(content.market)}</p>
      <div class="hero-concept">
        <strong>Partnership idea</strong>
        <p><strong style="font-family:inherit;letter-spacing:0;text-transform:none;color:var(--cream);font-size:1.05rem;display:inline">${esc(content.partnershipConcept.title)}</strong> — host one evening stay; Kellie films the arc and publishes while still on property.</p>
      </div>
    </div>
    ${portrait}
  </header>

  <main>
    <section class="panel">
      <h2>Why hotels work with Kellie</h2>
      <p>${esc(content.positioning)}</p>
    </section>

    <section class="panel">
      <h2>Partnership concept</h2>
      <div class="concept">
        <h3>${esc(content.partnershipConcept.title)}</h3>
        <p>${esc(content.partnershipConcept.body)}</p>
        <ul class="plain">
          ${content.partnershipConcept.deliverables.map((d) => `<li>${esc(d)}</li>`).join('')}
        </ul>
      </div>
    </section>

    <section class="panel">
      <h2>Audience</h2>
      ${
        a.followersAvailable
          ? `<dl class="stats">
        <div class="stat"><dt>Followers</dt><dd>${esc(num(a.followersCount))}</dd></div>
        <div class="stat"><dt>Median views</dt><dd>${esc(num(a.medianViewsPerPost))}</dd></div>
        <div class="stat"><dt>Views tracked</dt><dd>${esc(num(a.totalViews))}</dd></div>
        <div class="stat"><dt>Engagement</dt><dd>${
          a.engagementRatePercent !== null ? esc(`${a.engagementRatePercent}%`) : '—'
        }</dd></div>
      </dl>
      <p class="muted">${esc(a.platform)} ${esc(a.handle)} · live connected account${
            synced ? `, last synced ${esc(synced)}` : ''
          }${a.postsWithMetrics ? ` · ${esc(num(a.postsWithMetrics))} posts with metrics` : ''}.</p>`
          : `<p class="muted">Audience figures are being re-synced and are not estimated.</p>`
      }
    </section>

    ${examplesSection}

    <section class="panel">
      <h2>Collaboration terms</h2>
      <ul class="plain">
        ${content.collaborationTermsPublic.map((t) => `<li>${esc(t)}</li>`).join('')}
      </ul>
    </section>

    <footer>
      ${
        content.contactEmail
          ? `Contact: <a href="mailto:${esc(content.contactEmail)}">${esc(content.contactEmail)}</a> · `
          : ''
      }
      ${esc(content.handle)} · Prepared ${esc(monthYear(content.generatedAt))}.
      Paid and hosted collaborations considered.
    </footer>
  </main>
</body>
</html>`;
}
