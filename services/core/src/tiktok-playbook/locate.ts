import { homedir } from 'os';
import { readdir, access } from 'fs/promises';
import { join, extname } from 'path';
import { SEED_PLAYBOOK_SOURCES, type SeedPlaybookSource } from './constants.js';

export type LocatedPlaybookDoc = {
  sourceSlug: string;
  sourcePath: string;
  originalFilename: string;
  sourceKind: 'pdf' | 'html';
};

function scoreFilename(filename: string, seed: SeedPlaybookSource): number {
  if (seed.excludePatterns?.some((p) => p.test(filename))) return 0;
  let score = 0;
  for (const pattern of seed.downloadPatterns) {
    if (pattern.test(filename)) score += 10;
  }
  return score;
}

export async function findPlaybookDocsInDownloads(): Promise<LocatedPlaybookDoc[]> {
  const downloads = join(homedir(), 'Downloads');
  let files: string[] = [];
  try {
    files = await readdir(downloads);
  } catch {
    return [];
  }

  const candidates = files.filter((f) => /\.(pdf|html?|mhtml)$/i.test(f));
  const located: LocatedPlaybookDoc[] = [];
  const usedFiles = new Set<string>();

  for (const seed of SEED_PLAYBOOK_SOURCES) {
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
        sourceSlug: seed.slug,
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
