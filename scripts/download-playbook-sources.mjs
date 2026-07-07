#!/usr/bin/env node
/**
 * Download official TikTok Creator Playbook sources into ~/Downloads.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const DOWNLOADS = join(homedir(), 'Downloads');

const SOURCES = [
  {
    filename: 'TikTok Academy - creator education best practices.html',
    title: 'TikTok Academy (official excerpts)',
    pages: [
      { label: 'Creator Academy home', url: 'https://www.tiktok.com/creator-academy/en' },
      { label: 'Grow your audience', url: 'https://www.tiktok.com/creator-academy/en/article/grow-your-audience' },
      { label: 'Create high-quality videos', url: 'https://www.tiktok.com/creator-academy/en/article/create-high-quality-videos' },
      { label: 'Understanding TikTok analytics', url: 'https://www.tiktok.com/creator-academy/en/article/understanding-tiktok-analytics' },
    ],
  },
  {
    filename: 'TikTok Creator Tools - in-app analytics guide.html',
    title: 'TikTok Creator Tools (official excerpts)',
    pages: [
      { label: 'Creator Search Insights', url: 'https://www.tiktok.com/creator-academy/en/article/Creator-Search-Insights' },
      { label: 'Why Search Analytics Matter', url: 'https://www.tiktok.com/creator-academy/en/article/Why-Search-Analytics-Matter' },
      { label: 'Creator Search Insights Newsroom', url: 'https://newsroom.tiktok.com/en-us/creator-search-insights' },
    ],
  },
  {
    filename: 'TikTok Studio help - upload analytics workflow.html',
    title: 'TikTok Studio Help (official excerpts)',
    pages: [
      { label: 'Introducing TikTok Studio', url: 'https://newsroom.tiktok.com/en-us/helping-creators-bring-creativity-to-life-with-tiktok-studio' },
      { label: 'Advanced Desktop Tools', url: 'https://www.tiktok.com/creator-academy/article/advanced-desktop-tools' },
    ],
  },
  {
    filename: 'Creator Search Insights help guide.html',
    title: 'Creator Search Insights Help (official excerpts)',
    pages: [
      { label: 'Creator Search Insights Academy', url: 'https://www.tiktok.com/creator-academy/en/article/Creator-Search-Insights' },
      { label: 'TikTok Support — Search Insights', url: 'https://support.tiktok.com/en/using-tiktok/growing-your-audience/creator-search-insights' },
      { label: 'Search Analytics Matter', url: 'https://www.tiktok.com/creator-academy/en/article/Why-Search-Analytics-Matter' },
    ],
  },
  {
    filename: 'TikTok Creative Center - trends and top ads.html',
    title: 'TikTok Creative Center (official excerpts)',
    pages: [
      { label: 'Creative Center inspiration', url: 'https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en' },
      { label: 'Creative Center keyword insights', url: 'https://ads.tiktok.com/business/creativecenter/keyword-insights/pc/en' },
    ],
  },
  {
    filename: 'TikTok Ads Creative Best Practices guide.html',
    title: 'TikTok Ads Creative Best Practices (official excerpts)',
    pages: [
      { label: 'Video ad specs and creative', url: 'https://ads.tiktok.com/help/article?aid=10002111' },
      { label: 'Creative best practices', url: 'https://ads.tiktok.com/help/article/creative-best-practices' },
    ],
  },
  {
    filename: 'TikTok Ads Best Practices guide.html',
    title: 'TikTok Ads Best Practices (official excerpts)',
    pages: [
      { label: 'TikTok Ads best practices overview', url: 'https://ads.tiktok.com/help/article/tiktok-ads-best-practices' },
      { label: 'Campaign structure best practices', url: 'https://ads.tiktok.com/help/article/best-practices-for-campaign-structure' },
    ],
  },
];

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

function wrapSection(label, url, html) {
  return [
    `<section data-source="${url}">`,
    `<h1>${label}</h1>`,
    `<p><strong>Source:</strong> <a href="${url}">${url}</a></p>`,
    html,
    '</section>',
  ].join('\n');
}

async function buildConsolidatedHtml(bundle) {
  const sections = [];
  for (const page of bundle.pages) {
    process.stdout.write(`  fetching ${page.label}…\n`);
    try {
      const html = await fetchPage(page.url);
      sections.push(wrapSection(page.label, page.url, html));
    } catch (err) {
      process.stdout.write(`  ⚠️ skipped (${err instanceof Error ? err.message : err})\n`);
    }
  }
  if (sections.length === 0) throw new Error('No pages fetched');
  return [
    '<!DOCTYPE html>',
    '<html lang="en"><head>',
    `<title>${bundle.title}</title>`,
    '</head><body>',
    `<h1>${bundle.title}</h1>`,
    sections.join('\n<hr>\n'),
    '</body></html>',
  ].join('\n');
}

async function main() {
  await mkdir(DOWNLOADS, { recursive: true });
  console.log(`Saving TikTok Creator Playbook sources to ${DOWNLOADS}\n`);

  for (const bundle of SOURCES) {
    console.log(`📄 ${bundle.filename}`);
    try {
      const html = await buildConsolidatedHtml(bundle);
      await writeFile(join(DOWNLOADS, bundle.filename), html, 'utf8');
      console.log(`   ✅ ${(html.length / 1024).toFixed(0)} KB\n`);
    } catch (err) {
      console.log(`   ❌ ${err instanceof Error ? err.message : err}\n`);
    }
  }

  console.log('Done. Run: pnpm playbook:ingest');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
