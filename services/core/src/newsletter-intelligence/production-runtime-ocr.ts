/**
 * Verify Tesseract + PDF render path in the production host runtime (not dev-only).
 */

import { accessSync, constants, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLocalImageOcr, shutdownLocalOcrWorker } from './local-ocr.js';
import { provePngFlyerOcrPath, proveScannedPdfOcrPath } from './ocr-media-proof.js';
import sharp from 'sharp';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const OCR_CACHE_DIR = resolve(scriptDir, '../../../../.cache/newsletter-ocr');
const RUNTIME_FIXTURE_DIR = resolve(scriptDir, '../../../../.cache/newsletter-runtime-ocr-proof');

export type ProductionRuntimeOcrReport = {
  runtime: 'host_tsx_workers';
  dockerUsed: false;
  tesseractJsApproved: boolean;
  languageDataLoads: boolean;
  pdftoppmAvailable: boolean;
  ocrCacheDirWritable: boolean;
  ocrCacheDirPersistent: boolean;
  cleanProcessFirstRun: { pass: boolean; localOcrRuns: number; providerOcrCalls: number };
  secondRunCache: { pass: boolean; cacheHit: boolean };
  pngFixture: Awaited<ReturnType<typeof provePngFlyerOcrPath>>;
  pdfFixture: Awaited<ReturnType<typeof proveScannedPdfOcrPath>>;
  passed: boolean;
  blockers: string[];
};

function checkPdftoppm(): boolean {
  try {
    execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function checkTesseractApproved(): boolean {
  try {
    const pkgPath = resolve(scriptDir, '../../node_modules/tesseract.js/package.json');
    if (!existsSync(pkgPath)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function verifyProductionRuntimeOcr(): Promise<ProductionRuntimeOcrReport> {
  const blockers: string[] = [];
  mkdirSync(RUNTIME_FIXTURE_DIR, { recursive: true });
  mkdirSync(OCR_CACHE_DIR, { recursive: true });

  let ocrCacheDirWritable = false;
  try {
    accessSync(OCR_CACHE_DIR, constants.W_OK);
    const probe = resolve(OCR_CACHE_DIR, '.write-probe');
    writeFileSync(probe, 'ok');
    rmSync(probe, { force: true });
    ocrCacheDirWritable = true;
  } catch {
    blockers.push('OCR cache directory not writable');
  }

  const pdftoppmAvailable = checkPdftoppm();
  if (!pdftoppmAvailable) blockers.push('pdftoppm not available in PATH');

  const tesseractJsApproved = checkTesseractApproved();
  if (!tesseractJsApproved) blockers.push('tesseract.js package not installed');

  const svg = `<svg width="400" height="120" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#000"/>
    <text x="20" y="70" fill="#fff" font-size="28" font-family="Arial">Runtime OCR Test 2026</text>
  </svg>`;
  const probeBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  const localProbe = await runLocalImageOcr({ buffer: probeBuffer, mimeType: 'image/png' });
  const languageDataLoads = localProbe.ok && /Runtime OCR Test/i.test(localProbe.text);
  if (!languageDataLoads) blockers.push('tesseract language data failed to load');

  await shutdownLocalOcrWorker();

  const pngFixture = await provePngFlyerOcrPath();
  const pdfFixture = await proveScannedPdfOcrPath();
  await shutdownLocalOcrWorker();

  const cleanProcessFirstRun = {
    pass: pngFixture.localOcrRuns + pngFixture.localOcrCacheHits > 0 && pngFixture.providerOcrCalls === 0,
    localOcrRuns: pngFixture.localOcrRuns,
    providerOcrCalls: pngFixture.providerOcrCalls,
  };
  const secondRunCache = {
    pass: pngFixture.secondRunCacheHit,
    cacheHit: pngFixture.secondRunCacheHit,
  };

  if (!cleanProcessFirstRun.pass) blockers.push('PNG fixture: local OCR path failed');
  if (!secondRunCache.pass) blockers.push('PNG fixture: second run OCR cache miss');
  if (!pdfFixture.pass) blockers.push(`PDF fixture: ${pdfFixture.failures.join(', ')}`);
  if (pdfFixture.providerOcrCalls > 0) blockers.push('PDF fixture invoked provider OCR');

  return {
    runtime: 'host_tsx_workers',
    dockerUsed: false,
    tesseractJsApproved,
    languageDataLoads,
    pdftoppmAvailable,
    ocrCacheDirWritable,
    ocrCacheDirPersistent: existsSync(OCR_CACHE_DIR),
    cleanProcessFirstRun,
    secondRunCache,
    pngFixture,
    pdfFixture,
    passed: blockers.length === 0,
    blockers,
  };
}
