import { copyFile, mkdir, readFile } from 'fs/promises';
import { dirname, extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const here = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(here, '../../../../uploads/playbook-sources');

export function playbookUploadRoot(): string {
  return process.env.PLAYBOOK_UPLOAD_DIR ?? defaultRoot;
}

export async function ensurePlaybookStorage(): Promise<string> {
  const root = playbookUploadRoot();
  await mkdir(root, { recursive: true });
  return root;
}

function storageExtension(originalFilename: string): string {
  const ext = extname(originalFilename).toLowerCase();
  if (['.pdf', '.html', '.htm', '.mhtml'].includes(ext)) return ext;
  return '.html';
}

export async function copyPlaybookToStorage(input: {
  sourcePath: string;
  originalFilename: string;
  storageFilename?: string;
}): Promise<{ storageFilename: string; storagePath: string; fileSize: number }> {
  const root = await ensurePlaybookStorage();
  const ext = storageExtension(input.originalFilename);
  const storageFilename = input.storageFilename ?? `${randomUUID()}${ext}`;
  const storagePath = join(root, storageFilename);
  await copyFile(input.sourcePath, storagePath);
  const buffer = await readFile(storagePath);
  return { storageFilename, storagePath, fileSize: buffer.length };
}

export async function readPlaybookFile(
  storageFilename: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const root = playbookUploadRoot();
  const path = join(root, storageFilename);
  try {
    const buffer = await readFile(path);
    const ext = extname(storageFilename).toLowerCase();
    const mimeType =
      ext === '.pdf'
        ? 'application/pdf'
        : ext === '.mhtml'
          ? 'application/x-mimearchive'
          : 'text/html';
    return { buffer, mimeType };
  } catch {
    return null;
  }
}
