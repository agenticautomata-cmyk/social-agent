import { brandCssVariables, loadWeekendDropTheme, type BrandTheme } from '../brand/index.js';
import type { PackedSlide, WeekendFactEvent, WeekendFactSheet } from '../facts/weekend-facts.js';

export type SlideFormat = 'carousel' | 'story';

function esc(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function googleFontsLink(): string {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap" rel="stylesheet">`;
}

function baseStyles(theme: BrandTheme, format: SlideFormat): string {
  const w = format === 'story' ? theme.layout.story.width : theme.layout.carousel.width;
  const h = format === 'story' ? theme.layout.story.height : theme.layout.carousel.height;
  const margin = format === 'story' ? theme.layout.safeMarginStoryPx : theme.layout.safeMarginPx;
  const isStory = format === 'story';
  return `
  :root { ${brandCssVariables(theme)} }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; width: ${w}px; height: ${h}px; overflow: hidden;
    background: var(--kd-navy-deep); color: var(--kd-cream);
    font-family: var(--kd-sans);
    -webkit-font-smoothing: antialiased;
  }
  .slide {
    position: relative;
    width: ${w}px; height: ${h}px;
    padding: ${margin}px;
    background:
      radial-gradient(1100px 620px at 100% 0%, rgba(31,166,160,0.28), transparent 52%),
      radial-gradient(900px 520px at 0% 100%, rgba(245,197,24,0.14), transparent 48%),
      linear-gradient(168deg, var(--kd-navy-mid) 0%, var(--kd-navy) 46%, var(--kd-navy-deep) 100%);
    display: flex; flex-direction: column;
  }
  .slide::before {
    content: "";
    position: absolute; inset: 28px;
    border: 1px solid var(--kd-rule);
    pointer-events: none;
  }
  .eyebrow {
    font-family: var(--kd-mono);
    font-size: ${isStory ? 28 : 26}px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--kd-yellow);
    margin: 0 0 14px;
  }
  .wordmark {
    font-family: var(--kd-display);
    font-size: ${isStory ? 78 : 70}px;
    letter-spacing: 0.04em;
    line-height: 0.9;
    color: var(--kd-cream);
    margin: 0;
  }
  .product {
    font-family: var(--kd-display);
    font-size: ${isStory ? 168 : 148}px;
    letter-spacing: 0.02em;
    line-height: 0.86;
    color: var(--kd-yellow);
    margin: 4px 0 0;
  }
  .range {
    margin-top: 22px;
    font-size: ${isStory ? 44 : 38}px;
    font-weight: 600;
    color: var(--kd-cream);
  }
  .tagline {
    margin-top: 48px;
    max-width: 920px;
    font-size: ${isStory ? 48 : 44}px;
    font-weight: 600;
    line-height: 1.18;
    color: var(--kd-cream);
  }
  .tagline em {
    font-style: normal;
    color: var(--kd-yellow);
  }
  .city-chip {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    margin-top: 28px;
    padding: 12px 20px;
    border: 1px solid rgba(31,166,160,0.65);
    background: rgba(7,22,40,0.35);
    color: var(--kd-teal);
    font-family: var(--kd-mono);
    font-size: ${isStory ? 26 : 24}px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .cover-promise {
    margin-top: auto;
    padding-top: 24px;
    font-size: ${isStory ? 32 : 30}px;
    color: var(--kd-muted);
    max-width: 880px;
    line-height: 1.35;
  }
  .day-head {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 24px; margin-bottom: 28px;
  }
  .day-title {
    font-family: var(--kd-display);
    font-size: ${isStory ? 96 : 84}px;
    letter-spacing: 0.03em;
    color: var(--kd-yellow);
    margin: 0;
    line-height: 0.9;
  }
  .day-date {
    font-family: var(--kd-mono);
    font-size: ${isStory ? 28 : 26}px;
    color: var(--kd-muted);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .events { display: flex; flex-direction: column; gap: ${isStory ? 36 : 28}px; flex: 1; }
  .event {
    padding-bottom: ${isStory ? 28 : 22}px;
    border-bottom: 1px solid var(--kd-rule);
  }
  .event:last-child { border-bottom: 0; padding-bottom: 0; }
  .event-time {
    font-family: var(--kd-mono);
    font-size: ${isStory ? 28 : 26}px;
    color: var(--kd-teal);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 0 0 8px;
  }
  .event-title {
    font-family: var(--kd-display);
    font-size: ${isStory ? 56 : 50}px;
    letter-spacing: 0.01em;
    line-height: 0.95;
    margin: 0 0 10px;
    color: var(--kd-cream);
    text-transform: none;
  }
  .event-meta {
    font-size: ${isStory ? 32 : 30}px;
    font-weight: 600;
    color: var(--kd-yellow-soft);
    margin: 0;
    line-height: 1.3;
  }
  .event-desc {
    margin: 10px 0 0;
    font-size: ${isStory ? 30 : 28}px;
    line-height: 1.35;
    color: rgba(247,241,227,0.86);
    max-width: 920px;
  }
  .foot {
    margin-top: auto;
    padding-top: 24px;
    display: flex; justify-content: space-between; gap: 16px; align-items: flex-end;
    font-family: var(--kd-mono);
    font-size: ${isStory ? 22 : 20}px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--kd-muted);
  }
  .foot span:last-child { text-align: right; max-width: 58%; }
  .cta-block { margin-top: auto; }
  .cta-title {
    font-family: var(--kd-display);
    font-size: ${isStory ? 110 : 96}px;
    line-height: 0.9;
    color: var(--kd-yellow);
    margin: 0 0 24px;
  }
  .cta-body {
    font-size: ${isStory ? 40 : 36}px;
    line-height: 1.3;
    max-width: 900px;
    margin: 0 0 36px;
  }
  .handle {
    display: inline-block;
    padding: 14px 22px;
    background: var(--kd-yellow);
    color: var(--kd-navy-deep);
    font-family: var(--kd-mono);
    font-weight: 500;
    font-size: ${isStory ? 30 : 28}px;
    letter-spacing: 0.08em;
  }
  .accent-bar {
    width: 120px; height: 8px; background: var(--kd-teal); margin: 24px 0 0;
  }
`;
}

function eventBlock(event: WeekendFactEvent, truncateDesc = 140): string {
  const venueLine = event.venue?.trim() || null;
  const cityLine =
    event.city && (!venueLine || !venueLine.toLowerCase().includes(event.city.toLowerCase()))
      ? event.city
      : null;
  const meta = [venueLine, cityLine].filter(Boolean).join(' · ');
  const desc =
    event.description && event.description.length > truncateDesc
      ? `${event.description.slice(0, truncateDesc - 1).trim()}…`
      : event.description;
  return `
    <article class="event">
      ${event.startTimeLabel ? `<p class="event-time">${esc(event.startTimeLabel)}</p>` : `<p class="event-time">Time listed with source</p>`}
      <h3 class="event-title">${esc(event.title)}</h3>
      ${meta ? `<p class="event-meta">${esc(meta)}</p>` : ''}
      ${desc ? `<p class="event-desc">${esc(desc)}</p>` : ''}
    </article>`;
}

function coverHtml(sheet: WeekendFactSheet, theme: BrandTheme, format: SlideFormat): string {
  const pickCount = sheet.events.length;
  return `
  <div class="slide cover">
    <p class="eyebrow">${esc(theme.copy.wordmark)}</p>
    <h1 class="wordmark">WEEKEND</h1>
    <p class="product">DROP</p>
    <div class="accent-bar"></div>
    <p class="range">${esc(sheet.rangeLabelFull)}</p>
    <div class="city-chip">${esc(theme.copy.city)}</div>
    <p class="tagline">Every Thursday,<br><em>I’m putting you on.</em></p>
    <p class="cover-promise">${pickCount} verified picks for the weekend — venues, times, and what is actually worth leaving the house for.</p>
    <div class="foot">
      <span>@kckellie</span>
      <span>${esc(theme.copy.attendanceDisclaimer)}</span>
    </div>
  </div>`;
}

function dayHtml(slide: PackedSlide, sheet: WeekendFactSheet, theme: BrandTheme, format: SlideFormat): string {
  return `
  <div class="slide day">
    <p class="eyebrow">${esc(theme.seriesName)}</p>
    <div class="day-head">
      <h2 class="day-title">${esc(slide.dayHeading ?? '')}</h2>
      <p class="day-date">${esc(slide.dateLabel ?? sheet.rangeLabel)}</p>
    </div>
    <div class="events">
      ${slide.events.map((e) => eventBlock(e, format === 'story' ? 160 : 130)).join('')}
    </div>
    <div class="foot">
      <span>${esc(sheet.rangeLabel)}</span>
      <span>${esc(theme.tagline)}</span>
    </div>
  </div>`;
}

function ctaHtml(sheet: WeekendFactSheet, theme: BrandTheme): string {
  return `
  <div class="slide cta">
    <p class="eyebrow">${esc(theme.copy.wordmark)}</p>
    <div class="cta-block">
      <h2 class="cta-title">SAVE IT.<br>SHARE IT.<br>GO.</h2>
      <p class="cta-body">${esc(theme.tagline)} Fresh KC picks every Thursday.</p>
      <span class="handle">@kckellie</span>
    </div>
    <div class="foot">
      <span>${esc(sheet.rangeLabelFull)}</span>
      <span>${esc(theme.copy.attendanceDisclaimer)}</span>
    </div>
  </div>`;
}

export function renderWeekendSlideHtml(input: {
  sheet: WeekendFactSheet;
  slide: PackedSlide;
  format: SlideFormat;
}): string {
  const theme = loadWeekendDropTheme();
  const body =
    input.slide.role === 'cover'
      ? coverHtml(input.sheet, theme, input.format)
      : input.slide.role === 'cta'
        ? ctaHtml(input.sheet, theme)
        : dayHtml(input.slide, input.sheet, theme, input.format);

  const w = input.format === 'story' ? theme.layout.story.width : theme.layout.carousel.width;
  const h = input.format === 'story' ? theme.layout.story.height : theme.layout.carousel.height;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${w}, height=${h}">
<title>KC Kellie Weekend Drop</title>
${googleFontsLink()}
<style>${baseStyles(theme, input.format)}</style>
</head>
<body>${body}</body>
</html>`;
}
