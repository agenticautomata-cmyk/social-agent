/**
 * Minimal one-page PDF for an approved media-kit version.
 *
 * Hand-rolled PDF 1.4 with Helvetica — no extra dependency, enough for a clean
 * one-pager Kellie can attach or print. Visually inspect after generate.
 */

import type { MediaKitContent } from './build.js';

function pdfEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapLines(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function formatNum(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-US');
}

/**
 * Builds a single-page letter PDF (612×792) with kit content.
 */
export function renderMediaKitPdf(content: MediaKitContent): Buffer {
  const lines: Array<{ text: string; size: number; gap?: number }> = [];

  lines.push({ text: content.creatorName, size: 22, gap: 8 });
  lines.push({ text: content.headline, size: 12, gap: 14 });

  for (const bioLine of wrapLines(content.bio, 88)) {
    lines.push({ text: bioLine, size: 10, gap: 12 });
  }
  lines.push({ text: `Market: ${content.market}`, size: 10, gap: 14 });

  lines.push({ text: 'Audience (TikTok only — live connector)', size: 12, gap: 14 });
  const a = content.audience;
  if (a.followersAvailable) {
    lines.push({
      text: `Followers: ${formatNum(a.followersCount)}${
        a.handle ? `  ·  ${a.platform} ${a.handle}` : ''
      }`,
      size: 10,
      gap: 12,
    });
    if (a.medianViewsPerPost !== null) {
      lines.push({
        text: `Median views per post: ${formatNum(a.medianViewsPerPost)}`,
        size: 10,
        gap: 12,
      });
    }
    if (a.totalViews !== null) {
      lines.push({
        text: `Views across ${formatNum(a.postsWithMetrics)} posts: ${formatNum(a.totalViews)}`,
        size: 10,
        gap: 12,
      });
    }
  } else {
    lines.push({
      text: 'Audience figures unavailable — deliberately omitted rather than estimated.',
      size: 10,
      gap: 12,
    });
  }

  lines.push({ text: 'Services', size: 12, gap: 14 });
  for (const service of content.services.slice(0, 5)) {
    for (const part of wrapLines(`• ${service}`, 88)) {
      lines.push({ text: part, size: 10, gap: 11 });
    }
  }

  lines.push({ text: 'Recent work', size: 12, gap: 14 });
  for (const example of content.examples.slice(0, 3)) {
    for (const part of wrapLines(
      `• ${example.title} — ${formatNum(example.views)} views`,
      88,
    )) {
      lines.push({ text: part, size: 10, gap: 11 });
    }
  }

  lines.push({ text: 'Disclosure', size: 12, gap: 14 });
  for (const d of content.disclosure.slice(0, 2)) {
    for (const part of wrapLines(d, 88)) {
      lines.push({ text: part, size: 9, gap: 10 });
    }
  }

  lines.push({
    text: `Generated ${content.generatedAt.slice(0, 10)} · TikTok analytics only · no invented IG/FB/YT`,
    size: 8,
    gap: 10,
  });

  // Build content stream
  let y = 750;
  const ops: string[] = ['BT', '/F1 11 Tf', '50 750 Td'];
  let first = true;
  for (const line of lines) {
    if (!first) {
      ops.push(`0 -${line.gap ?? 12} Td`);
      y -= line.gap ?? 12;
    }
    first = false;
    if (y < 48) break;
    ops.push(`/F1 ${line.size} Tf`);
    ops.push(`(${pdfEscape(line.text)}) Tj`);
  }
  ops.push('ET');
  const stream = ops.join('\n');
  const streamBytes = Buffer.from(stream, 'utf8');

  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
  );
  objects.push(
    `4 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  );
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefPos}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}
