import type { MediaKitRecord } from './sponsor-outreach-types';

export function isGeneratedKit(kit: Pick<MediaKitRecord, 'kitKind' | 'webSlug'>): boolean {
  return Boolean(kit.kitKind?.startsWith('generated') || kit.webSlug);
}

/** Generated kits must never surface uploaded-collateral empty-file language. */
export function generatedKitForbiddenCopy(
  kit: Pick<MediaKitRecord, 'kitKind' | 'webSlug' | 'originalFilename' | 'fileUrl'>,
): string[] {
  if (!isGeneratedKit(kit)) return [];
  const probe = [kit.originalFilename, kit.fileUrl].filter(Boolean).join(' ').toLowerCase();
  const forbidden: string[] = [];
  if (probe.includes('no file')) forbidden.push('no file');
  return forbidden;
}
