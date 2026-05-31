import { mkdir, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const here = dirname(fileURLToPath(import.meta.url));
const defaultUploadRoot = resolve(here, '../../../../uploads/intake');

export type SavedIntakeImage = {
  uploaded_image_path: string;
  uploaded_image_url: string | null;
};

function uploadRoot(): string {
  return process.env.INTAKE_UPLOAD_DIR ?? defaultUploadRoot;
}

export async function saveIntakeImage(file: File): Promise<SavedIntakeImage> {
  const root = uploadRoot();
  await mkdir(root, { recursive: true });

  const ext = file.name.includes('.')
    ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    : '.jpg';
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.gif'].includes(ext) ? ext : '.jpg';
  const filename = `${randomUUID()}${safeExt}`;
  const fullPath = join(root, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(fullPath, buffer);

  const publicBase = process.env.INTAKE_UPLOAD_PUBLIC_BASE ?? null;

  return {
    uploaded_image_path: fullPath,
    uploaded_image_url: publicBase ? `${publicBase.replace(/\/$/, '')}/${filename}` : null,
  };
}
