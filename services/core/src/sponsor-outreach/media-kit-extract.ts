/// <reference path="../types/pdf-parse.d.ts" />
import { readMediaKitFile } from './media-kit-storage.js';

export type MediaKitExtractionResult = {
  text: string | null;
  method: 'pdf' | 'docx' | 'ocr' | null;
  error?: string;
};

const TEXT_CAP = 8000;

/** PDF text extraction via pdf-parse. */
export async function extractPdfText(storageFilename: string): Promise<MediaKitExtractionResult> {
  try {
    const file = await readMediaKitFile(storageFilename);
    if (!file) return { text: null, method: null, error: 'file_not_found' };
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(file.buffer);
    const text = data.text?.trim().slice(0, TEXT_CAP) ?? null;
    return text ? { text, method: 'pdf' } : { text: null, method: 'pdf', error: 'empty_pdf' };
  } catch (err) {
    return {
      text: null,
      method: null,
      error: err instanceof Error ? err.message : 'pdf_extract_failed',
    };
  }
}

/** DOCX text extraction via mammoth. */
export async function extractDocxText(storageFilename: string): Promise<MediaKitExtractionResult> {
  try {
    const file = await readMediaKitFile(storageFilename);
    if (!file) return { text: null, method: null, error: 'file_not_found' };
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    const text = result.value?.trim().slice(0, TEXT_CAP) ?? null;
    return text ? { text, method: 'docx' } : { text: null, method: 'docx', error: 'empty_docx' };
  } catch (err) {
    return {
      text: null,
      method: null,
      error: err instanceof Error ? err.message : 'docx_extract_failed',
    };
  }
}

export async function extractImageText(_storageFilename: string): Promise<MediaKitExtractionResult> {
  return { text: null, method: null, error: 'Image OCR not implemented yet.' };
}

export async function scoreMediaKitReadiness(input: {
  kitId: string;
  extractedText: string | null;
}): Promise<{ score: number | null; notes: string[] }> {
  const notes: string[] = [];
  if (!input.extractedText?.trim()) {
    return { score: null, notes: ['Upload a PDF or DOCX so Benson can read your kit.'] };
  }
  const len = input.extractedText.length;
  let score = 40;
  if (len > 500) score += 20;
  if (len > 1500) score += 15;
  if (/rate|pricing|partnership|audience|demographic|follower|tiktok|instagram/i.test(input.extractedText)) {
    score += 15;
  }
  if (/kansas city|\bkc\b/i.test(input.extractedText)) score += 10;
  notes.push(`Extracted ${len.toLocaleString()} characters from kit file.`);
  return { score: Math.min(100, score), notes };
}

export async function extractMediaKitContent(input: {
  mimeType: string | null;
  storageFilename: string | null;
}): Promise<MediaKitExtractionResult> {
  if (!input.storageFilename) {
    return { text: null, method: null, error: 'no_storage_file' };
  }
  const mime = input.mimeType?.toLowerCase() ?? '';
  if (mime.includes('pdf') || input.storageFilename.toLowerCase().endsWith('.pdf')) {
    return extractPdfText(input.storageFilename);
  }
  if (
    mime.includes('word') ||
    mime.includes('docx') ||
    input.storageFilename.toLowerCase().endsWith('.docx')
  ) {
    return extractDocxText(input.storageFilename);
  }
  return { text: null, method: null, error: 'unsupported_mime' };
}

export async function enrichMediaKitAfterUpload(input: {
  kitId: string;
  mimeType: string | null;
  storageFilename: string | null;
  existingDescription: string | null;
}): Promise<{ description: string | null; extraction: MediaKitExtractionResult }> {
  const extraction = await extractMediaKitContent({
    mimeType: input.mimeType,
    storageFilename: input.storageFilename,
  });
  if (!extraction.text) {
    return { description: input.existingDescription, extraction };
  }
  const snippet = extraction.text.slice(0, 1200).replace(/\s+/g, ' ').trim();
  const block = `[Extracted from ${extraction.method ?? 'file'}]\n${snippet}`;
  const description = input.existingDescription?.trim()
    ? `${input.existingDescription.trim()}\n\n${block}`
    : block;
  return { description, extraction };
}
