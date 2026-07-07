import { copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const here = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(here, '../../../../uploads/equipment-manuals');

export function equipmentManualUploadRoot(): string {
  return process.env.EQUIPMENT_MANUAL_UPLOAD_DIR ?? defaultRoot;
}

export async function ensureEquipmentStorage(): Promise<string> {
  const root = equipmentManualUploadRoot();
  await mkdir(root, { recursive: true });
  return root;
}

function storageExtension(originalFilename: string): string {
  const ext = extname(originalFilename).toLowerCase();
  if (['.pdf', '.html', '.htm', '.mhtml'].includes(ext)) return ext;
  return '.pdf';
}

export async function copyManualToStorage(input: {
  sourcePath: string;
  originalFilename: string;
  storageFilename?: string;
}): Promise<{ storageFilename: string; storagePath: string; fileSize: number }> {
  const root = await ensureEquipmentStorage();
  const ext = storageExtension(input.originalFilename);
  const storageFilename = input.storageFilename ?? `${randomUUID()}${ext}`;
  const storagePath = join(root, storageFilename);
  await copyFile(input.sourcePath, storagePath);
  const buffer = await readFile(storagePath);
  return { storageFilename, storagePath, fileSize: buffer.length };
}

export async function readEquipmentManualFile(
  storageFilename: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const root = equipmentManualUploadRoot();
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
