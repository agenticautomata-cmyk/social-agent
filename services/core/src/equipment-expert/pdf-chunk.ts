import { homedir } from 'os';
import { readdir, access, readFile } from 'fs/promises';
import { join, extname } from 'path';
import { SEED_EQUIPMENT, type SeedEquipment } from './constants.js';

export type LocatedManual = {
  seedSlug: string;
  sourcePath: string;
  originalFilename: string;
  sourceKind: 'pdf' | 'html';
};

export type DocumentChunk = {
  pageNumber: number | null;
  sectionTitle: string | null;
  chunkIndex: number;
  chunkText: string;
};

function scoreFilename(filename: string, seed: SeedEquipment): number {
  if (seed.excludePatterns?.some((p) => p.test(filename))) return 0;
  let score = 0;
  for (const pattern of seed.downloadPatterns) {
    if (pattern.test(filename)) score += 10;
  }
  return score;
}

export async function findManualsInDownloads(): Promise<LocatedManual[]> {
  const downloads = join(homedir(), 'Downloads');
  let files: string[] = [];
  try {
    files = await readdir(downloads);
  } catch {
    return [];
  }

  const candidates = files.filter((f) => /\.(pdf|html?|mhtml)$/i.test(f));
  const located: LocatedManual[] = [];
  const usedFiles = new Set<string>();

  for (const seed of SEED_EQUIPMENT) {
    let best: { file: string; score: number } | null = null;
    for (const file of candidates) {
      if (usedFiles.has(file)) continue;
      const score = scoreFilename(file, seed);
      if (score > 0 && (!best || score > best.score)) {
        best = { file, score };
      }
    }
    if (!best) continue;

    const sourcePath = join(downloads, best.file);
    try {
      await access(sourcePath);
      usedFiles.add(best.file);
      const ext = extname(best.file).toLowerCase();
      located.push({
        seedSlug: seed.slug,
        sourcePath,
        originalFilename: best.file,
        sourceKind: ext === '.pdf' ? 'pdf' : 'html',
      });
    } catch {
      // skip unreadable
    }
  }

  return located;
}

const HEADING_RE = /^(?:\d+(?:\.\d+)*[\.\)]?\s+)?([A-Z][A-Za-z0-9\s\-/&:]{3,100})$/;
const ALLCAPS_HEADING_RE = /^([A-Z][A-Z0-9\s\-/&:]{4,100})$/;

export async function extractAndChunkPdf(buffer: Buffer): Promise<{
  pageCount: number;
  chunks: DocumentChunk[];
}> {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  const pageCount = data.numpages ?? 1;
  const rawText = (data.text ?? '').replace(/\r\n/g, '\n').trim();
  if (!rawText) return { pageCount, chunks: [] };

  const pageTexts = rawText.includes('\f')
    ? rawText.split('\f').map((p: string) => p.trim()).filter(Boolean)
    : splitApproxPages(rawText, pageCount);

  const chunks: DocumentChunk[] = [];
  let globalIndex = 0;

  pageTexts.forEach((pageText: string, pageIdx: number) => {
    const pageNumber = pageIdx + 1;
    for (const section of splitPageIntoSections(pageText)) {
      for (const piece of splitLongText(section.text, 1800)) {
        chunks.push({
          pageNumber,
          sectionTitle: section.title,
          chunkIndex: globalIndex++,
          chunkText: piece,
        });
      }
    }
  });

  return { pageCount, chunks };
}

export function extractAndChunkHtml(html: string): { pageCount: number | null; chunks: DocumentChunk[] } {
  const cleaned = stripHtml(html);
  if (!cleaned.trim()) return { pageCount: null, chunks: [] };

  let sections = splitHtmlSections(html, cleaned);
  const captured = sections.reduce((n, s) => n + s.text.length, 0);
  if (sections.length === 0 || captured < cleaned.length * 0.08) {
    sections = splitPageIntoSections(cleaned);
  }

  const chunks: DocumentChunk[] = [];
  let index = 0;

  sections.forEach((section, sectionIdx) => {
    for (const piece of splitLongText(section.text, 1800)) {
      if (piece.length < 40) continue;
      chunks.push({
        pageNumber: sectionIdx + 1,
        sectionTitle: section.title,
        chunkIndex: index++,
        chunkText: piece,
      });
    }
  });

  return { pageCount: sections.length || null, chunks };
}

export async function extractAndChunkDocument(input: {
  buffer: Buffer;
  sourceKind: 'pdf' | 'html';
}): Promise<{ pageCount: number | null; chunks: DocumentChunk[] }> {
  if (input.sourceKind === 'pdf') {
    return extractAndChunkPdf(input.buffer);
  }
  return extractAndChunkHtml(input.buffer.toString('utf8'));
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function splitHtmlSections(
  html: string,
  plainText: string,
): Array<{ title: string | null; text: string }> {
  const headingMatches = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)];
  if (headingMatches.length === 0) {
    return splitPageIntoSections(plainText);
  }

  const sections: Array<{ title: string | null; text: string }> = [];
  for (const match of headingMatches) {
    const title = stripHtml(match[1] ?? '').trim() || null;
    const start = match.index ?? 0;
    const next = html.indexOf('<h', start + match[0].length);
    const slice = html.slice(start, next > start ? next : undefined);
    const text = stripHtml(slice);
    if (text.length >= 40) sections.push({ title, text });
  }

  return sections.length > 0 ? sections : [{ title: null, text: plainText }];
}

function splitApproxPages(text: string, pageCount: number): string[] {
  if (pageCount <= 1) return [text];
  const size = Math.ceil(text.length / pageCount);
  const pages: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    pages.push(text.slice(i * size, (i + 1) * size).trim());
  }
  return pages.filter(Boolean);
}

function splitPageIntoSections(pageText: string): Array<{ title: string | null; text: string }> {
  const lines = pageText.split('\n');
  const sections: Array<{ title: string | null; text: string }> = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    const text = currentLines.join('\n').trim();
    if (text.length >= 40) sections.push({ title: currentTitle, text });
    currentLines = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      currentLines.push('');
      continue;
    }
    const heading =
      ALLCAPS_HEADING_RE.exec(trimmed)?.[1] ?? HEADING_RE.exec(trimmed)?.[1] ?? null;
    if (heading && trimmed.length < 100 && !/[.!?]$/.test(trimmed)) {
      flush();
      currentTitle = heading.trim();
      continue;
    }
    currentLines.push(trimmed);
  }
  flush();

  if (sections.length === 0) return [{ title: null, text: pageText.trim() }];
  return sections;
}

function splitLongText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxLen, text.length);
    if (end < text.length) {
      const breakAt = text.lastIndexOf('\n', end);
      if (breakAt > start + maxLen * 0.5) end = breakAt;
    }
    parts.push(text.slice(start, end).trim());
    start = end;
  }
  return parts.filter(Boolean);
}
