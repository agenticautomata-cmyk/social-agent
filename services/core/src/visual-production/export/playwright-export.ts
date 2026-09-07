import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
  applyPlaywrightBrowsersEnv,
  bensonRepoRoot,
  launchManagedChromium,
} from '../../playwright-runtime/index.js';

export type PngExportSpec = {
  html: string;
  width: number;
  height: number;
  outPath: string;
};

export type PdfExportSpec = {
  html: string;
  outPath: string;
  format?: 'Letter' | 'A4';
};

export async function exportHtmlToPng(specs: PngExportSpec[]): Promise<string[]> {
  const repoRoot = bensonRepoRoot();
  applyPlaywrightBrowsersEnv(repoRoot);
  const browser = await launchManagedChromium();
  const written: string[] = [];
  try {
    for (const spec of specs) {
      await mkdir(dirname(spec.outPath), { recursive: true });
      const page = await browser.newPage({
        viewport: { width: spec.width, height: spec.height },
        deviceScaleFactor: 1,
      });
      try {
        await page.setContent(spec.html, { waitUntil: 'networkidle' });
        // Allow webfonts to settle.
        await page.waitForTimeout(900);
        await page.screenshot({
          path: spec.outPath,
          type: 'png',
          clip: { x: 0, y: 0, width: spec.width, height: spec.height },
        });
        written.push(spec.outPath);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  return written;
}

export async function exportHtmlToPdf(spec: PdfExportSpec): Promise<string> {
  const repoRoot = bensonRepoRoot();
  applyPlaywrightBrowsersEnv(repoRoot);
  await mkdir(dirname(spec.outPath), { recursive: true });
  const browser = await launchManagedChromium();
  try {
    const page = await browser.newPage();
    try {
      await page.setContent(spec.html, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      await page.pdf({
        path: spec.outPath,
        format: spec.format ?? 'Letter',
        printBackground: true,
        margin: { top: '0.45in', right: '0.45in', bottom: '0.45in', left: '0.45in' },
      });
    } finally {
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return spec.outPath;
}

export async function writeTextArtifact(outPath: string, contents: string): Promise<string> {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, contents, 'utf8');
  return outPath;
}

export function proofDir(repoRoot = bensonRepoRoot()): string {
  return join(repoRoot, 'docs', 'ops', 'proofs', 'visual-production-2026-09-07');
}
