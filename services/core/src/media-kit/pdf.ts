/**
 * Minimal PDF for an approved media-kit version.
 *
 * Hand-rolled PDF 1.4 with Helvetica + optional JPEG image XObjects (DCTDecode).
 * Images are embedded at generation time so historical PDFs stay self-contained.
 */

import type { MediaKitContent } from './build.js';

export type PdfEmbeddedImage = {
  bytes: Buffer;
  width: number;
  height: number;
  label: string;
};

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

function isJpeg(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * Builds a letter PDF (612×792). When images are provided (JPEG bytes), embeds them
 * without stretch — fit-inside a fixed box, preserve aspect ratio.
 */
export function renderMediaKitPdf(
  content: MediaKitContent,
  images: PdfEmbeddedImage[] = [],
): Buffer {
  const lines: Array<{ text: string; size: number; gap?: number }> = [];

  lines.push({ text: content.creatorName, size: 22, gap: 8 });
  lines.push({ text: content.headline, size: 12, gap: 14 });

  for (const bioLine of wrapLines(content.bio, images.length ? 58 : 88)) {
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

  const jpegImages = images.filter((img) => isJpeg(img.bytes)).slice(0, 3);
  if (jpegImages.length > 0) {
    lines.push({ text: 'Photos', size: 12, gap: 14 });
    for (const img of jpegImages) {
      lines.push({ text: `• ${img.label}`, size: 10, gap: 11 });
    }
  } else if (content.assignedAssets?.length) {
    lines.push({ text: 'Photos', size: 12, gap: 14 });
    for (const asset of content.assignedAssets.slice(0, 3)) {
      lines.push({
        text: `• ${asset.role} (image unavailable at PDF build)`,
        size: 10,
        gap: 11,
      });
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

  // Text content stream (may leave room on the right for a headshot).
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

  // Draw embedded JPEGs (fit-inside, no stretch) on the right / below text.
  const imageDrawOps: string[] = [];
  if (jpegImages[0]) {
    const img = jpegImages[0]!;
    const maxW = 160;
    const maxH = 210;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const drawW = Math.max(1, img.width * scale);
    const drawH = Math.max(1, img.height * scale);
    const x = 612 - 50 - drawW;
    const imgY = 792 - 50 - drawH;
    imageDrawOps.push('q');
    imageDrawOps.push(
      `${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x.toFixed(2)} ${imgY.toFixed(2)} cm`,
    );
    imageDrawOps.push('/Im0 Do');
    imageDrawOps.push('Q');
  }

  // Additional photos along the bottom if present.
  let bottomX = 50;
  for (let i = 1; i < jpegImages.length; i++) {
    const img = jpegImages[i]!;
    const maxW = 120;
    const maxH = 120;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const drawW = Math.max(1, img.width * scale);
    const drawH = Math.max(1, img.height * scale);
    const imgY = 36;
    imageDrawOps.push('q');
    imageDrawOps.push(
      `${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${bottomX.toFixed(2)} ${imgY.toFixed(2)} cm`,
    );
    imageDrawOps.push(`/Im${i} Do`);
    imageDrawOps.push('Q');
    bottomX += drawW + 12;
  }

  const streamText = [...ops, ...imageDrawOps].join('\n');
  const streamBytes = Buffer.from(streamText, 'utf8');

  const xobjectEntries: string[] = [];
  const imageObjects: Buffer[] = [];
  for (let i = 0; i < jpegImages.length; i++) {
    const img = jpegImages[i]!;
    const objNum = 6 + i;
    xobjectEntries.push(`/Im${i} ${objNum} 0 R`);
    const dict =
      `${objNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`;
    const end = '\nendstream\nendobj\n';
    imageObjects.push(Buffer.concat([Buffer.from(dict, 'utf8'), img.bytes, Buffer.from(end, 'utf8')]));
  }

  const resourcesXObject =
    xobjectEntries.length > 0 ? ` /XObject << ${xobjectEntries.join(' ')} >>` : '';

  const objects: Buffer[] = [];
  objects.push(Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n', 'utf8'));
  objects.push(Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n', 'utf8'));
  objects.push(
    Buffer.from(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >>${resourcesXObject} >> >>\nendobj\n`,
      'utf8',
    ),
  );
  objects.push(
    Buffer.concat([
      Buffer.from(`4 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`, 'utf8'),
      streamBytes,
      Buffer.from('\nendstream\nendobj\n', 'utf8'),
    ]),
  );
  objects.push(
    Buffer.from('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n', 'utf8'),
  );
  for (const imgObj of imageObjects) objects.push(imgObj);

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'utf8')];
  const offsets: number[] = [0];
  let offset = chunks[0]!.length;
  for (const obj of objects) {
    offsets.push(offset);
    chunks.push(obj);
    offset += obj.length;
  }
  const xrefPos = offset;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  xref += `startxref\n${xrefPos}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'utf8'));

  return Buffer.concat(chunks);
}

/**
 * Load print/web JPEG bytes for assigned assets so PDF embedding is self-contained.
 */
export async function loadAssignedAssetImagesForPdf(
  assignedAssets: MediaKitContent['assignedAssets'],
): Promise<PdfEmbeddedImage[]> {
  if (!assignedAssets?.length) return [];
  const { getCreatorAsset } = await import('../creator-assets/assets.js');
  const { readCreatorAssetFile } = await import('../creator-assets/storage.js');

  const images: PdfEmbeddedImage[] = [];
  for (const ref of assignedAssets) {
    const asset = await getCreatorAsset(ref.id);
    if (!asset || asset.publicUseState !== 'approved_public_use') continue;
    const filename =
      asset.printStorageFilename ||
      asset.webStorageFilename ||
      asset.publicStorageFilename ||
      null;
    if (!filename) continue;
    try {
      const bytes = await readCreatorAssetFile(filename);
      if (!isJpeg(bytes)) continue;
      images.push({
        bytes,
        width: asset.widthPx && asset.widthPx > 0 ? asset.widthPx : 800,
        height: asset.heightPx && asset.heightPx > 0 ? asset.heightPx : 1000,
        label: ref.role || asset.role || 'photo',
      });
    } catch {
      // Skip missing files rather than failing the whole PDF.
    }
  }
  return images;
}
