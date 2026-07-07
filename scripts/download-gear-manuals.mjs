#!/usr/bin/env node
/**
 * Download official gear manuals / guides into ~/Downloads for Benson Gear Coach ingest.
 * Prefers Apple, TikTok, CapCut, and Blackmagic official sources.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const DOWNLOADS = join(homedir(), 'Downloads');

const SOURCES = [
  {
    filename: 'iPhone 17 Pro User Guide - Camera Control camera basics advanced camera settings.html',
    title: 'Apple iPhone 17 Pro User Guide (official excerpts)',
    pages: [
      {
        label: 'iPhone 17 Pro hardware overview',
        url: 'https://support.apple.com/guide/iphone/iph6b52d7c95/ios',
      },
      {
        label: 'Use the Camera Control on iPhone',
        url: 'https://support.apple.com/guide/iphone/iph0c397b154/ios',
      },
      {
        label: 'Use iPhone camera tools to set up your shot',
        url: 'https://support.apple.com/guide/iphone/iph3dc593597/ios',
      },
      {
        label: 'Record ProRes video with your iPhone camera',
        url: 'https://support.apple.com/guide/iphone/iphde02c478d/ios',
      },
      {
        label: 'About Apple ProRes on iPhone',
        url: 'https://support.apple.com/en-us/109041',
      },
    ],
  },
  {
    filename: 'TikTok Creator Tools - Creator Search Insights TikTok Academy analytics.html',
    title: 'TikTok Creator Tools (official excerpts)',
    pages: [
      {
        label: 'Creator Search Insights — TikTok Newsroom',
        url: 'https://newsroom.tiktok.com/en-us/creator-search-insights',
      },
      {
        label: 'Creator Search Insights — TikTok Creator Academy',
        url: 'https://www.tiktok.com/creator-academy/en/article/Creator-Search-Insights',
      },
      {
        label: 'Why Search Analytics Matter — TikTok Creator Academy',
        url: 'https://www.tiktok.com/creator-academy/en/article/Why-Search-Analytics-Matter',
      },
      {
        label: 'Creator Search Insights — TikTok Support',
        url: 'https://support.tiktok.com/en/using-tiktok/growing-your-audience/creator-search-insights',
      },
    ],
  },
  {
    filename: 'TikTok Studio guide - upload analytics workflow.html',
    title: 'TikTok Studio (official excerpts)',
    pages: [
      {
        label: 'Introducing TikTok Studio — TikTok Newsroom',
        url: 'https://newsroom.tiktok.com/en-us/helping-creators-bring-creativity-to-life-with-tiktok-studio',
      },
      {
        label: 'Advanced Desktop Tools — TikTok Creator Academy',
        url: 'https://www.tiktok.com/creator-academy/article/advanced-desktop-tools',
      },
    ],
  },
  {
    filename: 'CapCut editing guide - help center tutorials.html',
    title: 'CapCut Editing Guide (official excerpts)',
    pages: [
      {
        label: 'CapCut Help Center',
        url: 'https://www.capcut.com/help',
      },
      {
        label: 'How to Use CapCut',
        url: 'https://www.capcut.com/resource/how-to-use-capcut',
      },
      {
        label: 'CapCut Video Editor Guide',
        url: 'https://www.capcut.com/resource/capcut-video-editor-guide',
      },
    ],
  },
];

const PDFS = [
  {
    filename: 'Blackmagic Camera iPhone tech specs.pdf',
    url: 'https://www.blackmagicdesign.com/api/print/to-pdf/products/blackmagiccamera/techspecs/W-APP-01?filename=blackmagiccameraios-techspecs.pdf',
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

async function fetchBinary(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
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
    const html = await fetchPage(page.url);
    sections.push(wrapSection(page.label, page.url, html));
  }
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    `<title>${bundle.title}</title>`,
    `<meta name="source" content="Official documentation compiled for Benson Gear Coach">`,
    '</head>',
    '<body>',
    `<h1>${bundle.title}</h1>`,
    '<p>Official sources only. Each section cites its source URL.</p>',
    sections.join('\n<hr>\n'),
    '</body>',
    '</html>',
  ].join('\n');
}

async function main() {
  await mkdir(DOWNLOADS, { recursive: true });
  console.log(`Saving gear manuals to ${DOWNLOADS}\n`);

  for (const bundle of SOURCES) {
    console.log(`📄 ${bundle.filename}`);
    const html = await buildConsolidatedHtml(bundle);
    const out = join(DOWNLOADS, bundle.filename);
    await writeFile(out, html, 'utf8');
    console.log(`   ✅ ${(html.length / 1024).toFixed(0)} KB\n`);
  }

  for (const pdf of PDFS) {
    console.log(`📥 ${pdf.filename}`);
    const buf = await fetchBinary(pdf.url);
    const out = join(DOWNLOADS, pdf.filename);
    await writeFile(out, buf);
    console.log(`   ✅ ${(buf.length / 1024).toFixed(0)} KB\n`);
  }

  console.log('Done. Run: pnpm equipment:ingest');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
