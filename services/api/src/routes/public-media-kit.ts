import { Hono } from 'hono';
import {
  getMediaKitVersionBySlug,
  loadMediaKitBySlug,
  renderMediaKitHtml,
  renderMediaKitPdf,
  loadAssignedAssetImagesForPdf,
  type MediaKitContent,
} from '@social-agent/core/media-kit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Public read-only access to a generated media kit.
 *
 * Deliberately unauthenticated: the link goes out in a pitch. Supports optional
 * `?v=` version pin so an approved pitch keeps showing the reviewed snapshot.
 */
export const publicMediaKitRoute = new Hono();

const CACHE_SECONDS = 300;

function pdfRoot(): string {
  return (
    process.env.MEDIA_KIT_PDF_DIR?.trim() || join(process.cwd(), 'uploads', 'media-kit-pdfs')
  );
}

async function resolveKit(slug: string, versionParam: string | undefined) {
  const versionNumber =
    versionParam && /^\d+$/.test(versionParam) ? Number(versionParam) : null;

  if (versionNumber != null) {
    const versioned = await getMediaKitVersionBySlug(slug, versionNumber);
    // Explicit ?v= pin: missing or public-access-revoked versions must 404.
    // Do not silently substitute the latest kit (that would re-expose revoked fixtures).
    if (!versioned) return null;
    return {
      id: versioned.kitId,
      name: `Kellie — media kit`,
      content: versioned.content,
      generatedAt: versioned.version.generatedAt.toISOString(),
      versionNumber: versioned.version.versionNumber,
      contentHash: versioned.version.contentHash,
      pdfFilename: versioned.version.pdfStorageFilename,
    };
  }

  const versionedLatest = await getMediaKitVersionBySlug(slug, null);
  if (versionedLatest) {
    return {
      id: versionedLatest.kitId,
      name: `Kellie — media kit`,
      content: versionedLatest.content,
      generatedAt: versionedLatest.version.generatedAt.toISOString(),
      versionNumber: versionedLatest.version.versionNumber,
      contentHash: versionedLatest.version.contentHash,
      pdfFilename: versionedLatest.version.pdfStorageFilename,
    };
  }

  // Pre-versioning fallback.
  const kit = await loadMediaKitBySlug(slug);
  if (!kit) return null;
  return {
    id: kit.id,
    name: kit.name,
    content: kit.content,
    generatedAt: kit.generatedAt,
    versionNumber: null as number | null,
    contentHash: null as string | null,
    pdfFilename: null as string | null,
  };
}

publicMediaKitRoute.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return c.json({ error: 'not found' }, 404);

  const kit = await resolveKit(slug, c.req.query('v'));
  if (!kit) return c.json({ error: 'not found' }, 404);

  c.header('Cache-Control', `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`);
  return c.json({
    ok: true,
    id: kit.id,
    name: kit.name,
    generatedAt: kit.generatedAt,
    versionNumber: kit.versionNumber,
    contentHash: kit.contentHash,
    content: kit.content,
  });
});

/** The rendered page, for the link that goes out in a pitch. */
publicMediaKitRoute.get('/:slug/view', async (c) => {
  const slug = c.req.param('slug');
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return c.text('Not found', 404);

  const kit = await resolveKit(slug, c.req.query('v'));
  if (!kit) return c.text('Not found', 404);

  return new Response(renderMediaKitHtml(kit.content), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`,
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
});

/** One-page PDF for the pinned (or latest) version. */
publicMediaKitRoute.get('/:slug/pdf', async (c) => {
  const slug = c.req.param('slug');
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return c.text('Not found', 404);

  const kit = await resolveKit(slug, c.req.query('v'));
  if (!kit) return c.text('Not found', 404);

  let pdf: Buffer;
  const content = kit.content as MediaKitContent;
  const buildPdf = async () => {
    const images = await loadAssignedAssetImagesForPdf(content.assignedAssets ?? []);
    return renderMediaKitPdf(content, images);
  };
  if (kit.pdfFilename) {
    try {
      const safe = kit.pdfFilename.replace(/[^a-zA-Z0-9._-]/g, '');
      pdf = await readFile(join(pdfRoot(), safe));
    } catch {
      pdf = await buildPdf();
    }
  } else {
    pdf = await buildPdf();
  }

  const versionSuffix = kit.versionNumber != null ? `-v${kit.versionNumber}` : '';
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${slug}${versionSuffix}.pdf"`,
      'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`,
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
});

/** Approved public-use assets assigned to this kit, or present in a version snapshot. */
publicMediaKitRoute.get('/:slug/asset/:assetId', async (c) => {
  const slug = c.req.param('slug');
  const assetId = c.req.param('assetId');
  if (!/^[a-z0-9-]{1,64}$/.test(slug) || !/^[0-9a-f-]{36}$/i.test(assetId)) {
    return c.text('Not found', 404);
  }

  const { db } = await import('@social-agent/core/db');
  const { mediaKits, mediaKitAssetAssignments, creatorAssets } = await import(
    '@social-agent/core/schema'
  );
  const { and, eq, sql } = await import('drizzle-orm');
  const { readCreatorAssetFile } = await import('@social-agent/core/creator-assets');

  const kit = await db.select().from(mediaKits).where(eq(mediaKits.webSlug, slug)).limit(1);
  if (!kit[0]) return c.text('Not found', 404);

  const assigned = await db
    .select({
      publicStorageFilename: creatorAssets.publicStorageFilename,
      webStorageFilename: creatorAssets.webStorageFilename,
      publicUseState: creatorAssets.publicUseState,
      mimeType: creatorAssets.mimeType,
    })
    .from(mediaKitAssetAssignments)
    .innerJoin(creatorAssets, eq(creatorAssets.id, mediaKitAssetAssignments.creatorAssetId))
    .where(
      and(
        eq(mediaKitAssetAssignments.mediaKitId, kit[0].id),
        eq(mediaKitAssetAssignments.creatorAssetId, assetId),
        eq(creatorAssets.publicUseState, 'approved_public_use'),
      ),
    )
    .limit(1);

  let row = assigned[0];

  // Historical / pinned versions may reference an asset later unassigned from the live kit.
  // Skip revoked fixture-contaminated versions; archived assets never serve publicly.
  if (!row) {
    const inSnapshot = await db.execute(sql`
      SELECT 1
      FROM media_kit_versions
      WHERE media_kit_id = ${kit[0].id}::uuid
        AND content_snapshot->'assignedAssets' @> ${JSON.stringify([{ id: assetId }])}::jsonb
        AND (notes IS NULL OR notes NOT LIKE '%[public_access_revoked]%')
      LIMIT 1
    `);
    const snapRows = (
      Array.isArray(inSnapshot) ? inSnapshot : ((inSnapshot as { rows: unknown[] }).rows ?? [])
    ) as unknown[];
    if (snapRows.length > 0) {
      const assetRows = await db
        .select({
          publicStorageFilename: creatorAssets.publicStorageFilename,
          webStorageFilename: creatorAssets.webStorageFilename,
          publicUseState: creatorAssets.publicUseState,
          mimeType: creatorAssets.mimeType,
        })
        .from(creatorAssets)
        .where(
          and(
            eq(creatorAssets.id, assetId),
            eq(creatorAssets.publicUseState, 'approved_public_use'),
          ),
        )
        .limit(1);
      row = assetRows[0];
    }
  }

  const filename = row?.publicStorageFilename || row?.webStorageFilename;
  if (!row || !filename) return c.text('Not found', 404);

  try {
    const buffer = await readCreatorAssetFile(filename);
    return new Response(buffer, {
      headers: {
        'Content-Type': row.mimeType || 'image/jpeg',
        'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=600`,
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch {
    return c.text('Not found', 404);
  }
});
