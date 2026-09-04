import { Hono } from 'hono';
import {
  approvePublicUse,
  archiveCreatorAsset,
  assignAssetToMediaKit,
  assignAssetToKitTarget,
  createCreatorAsset,
  getCreatorAsset,
  listAssignmentDetailsForAsset,
  listCreatorAssets,
  rejectPublicUse,
  requestPublicUseApproval,
  serializeCreatorAsset,
  updateCreatorAssetRole,
  unassignAssetFromMediaKit,
  isCreatorAssetRole,
  readCreatorAssetFile,
  displayPublicUseStatus,
  KIT_ASSIGN_TARGETS,
  type CreatorAssetPublicUseState,
  type CreatorAssetRole,
  type KitAssignTarget,
} from '@social-agent/core/creator-assets';

/**
 * Creator Assets API — upload, approve public use, assign to kits.
 * Never silently publishes: approval is always an explicit step.
 */
export const creatorAssetsRoute = new Hono();

creatorAssetsRoute.get('/', async (c) => {
  const state = c.req.query('state');
  const role = c.req.query('role');
  const states = state
    ? (state.split(',').filter(Boolean) as CreatorAssetPublicUseState[])
    : undefined;
  const assets = await listCreatorAssets({
    states,
    role: role && isCreatorAssetRole(role) ? role : undefined,
  });
  const payload = [];
  for (const asset of assets) {
    const assignments = await listAssignmentDetailsForAsset(asset.id);
    payload.push({
      ...serializeCreatorAsset(asset),
      assignments,
      displayStatus: displayPublicUseStatus({
        publicUseState: asset.publicUseState,
        assignmentCount: assignments.length,
      }),
    });
  }
  return c.json({ ok: true, assets: payload });
});

creatorAssetsRoute.get('/files/:filename', async (c) => {
  const filename = c.req.param('filename');
  try {
    const buffer = await readCreatorAssetFile(filename);
    const lower = filename.toLowerCase();
    const mime = lower.endsWith('.png')
      ? 'image/png'
      : lower.endsWith('.webp')
        ? 'image/webp'
        : lower.endsWith('.gif')
          ? 'image/gif'
          : 'image/jpeg';
    return new Response(buffer, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return c.text('Not found', 404);
  }
});

creatorAssetsRoute.get('/:id', async (c) => {
  const asset = await getCreatorAsset(c.req.param('id'));
  if (!asset) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true, asset: serializeCreatorAsset(asset) });
});

creatorAssetsRoute.post('/', async (c) => {
  const body = await c.req.parseBody();
  const file = body['image'] ?? body['file'];
  if (!file || typeof file === 'string' || typeof (file as { arrayBuffer?: unknown }).arrayBuffer !== 'function') {
    return c.json({ error: 'image file required' }, 400);
  }
  const upload = file as { name?: string; type?: string; arrayBuffer: () => Promise<ArrayBuffer> };
  const buffer = Buffer.from(await upload.arrayBuffer());
  const roleRaw = typeof body['role'] === 'string' ? body['role'] : 'other';
  const requestPublicUse = body['requestPublicUse'] === 'true' || body['requestPublicUse'] === '1';

  try {
    const asset = await createCreatorAsset({
      buffer,
      originalFilename: upload.name ?? null,
      claimedMime: upload.type ?? null,
      role: isCreatorAssetRole(roleRaw) ? (roleRaw as CreatorAssetRole) : 'other',
      caption: typeof body['caption'] === 'string' ? body['caption'] : null,
      altText: typeof body['altText'] === 'string' ? body['altText'] : null,
      source: typeof body['source'] === 'string' ? body['source'] : 'creator_assets_ui',
      requestPublicUse,
    });
    return c.json({ ok: true, asset: serializeCreatorAsset(asset) }, 201);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'upload failed' }, 400);
  }
});

creatorAssetsRoute.post('/:id/request-public-use', async (c) => {
  try {
    const asset = await requestPublicUseApproval(c.req.param('id'));
    return c.json({ ok: true, asset: serializeCreatorAsset(asset) });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'failed' }, 400);
  }
});

creatorAssetsRoute.post('/:id/approve-public-use', async (c) => {
  try {
    const asset = await approvePublicUse(c.req.param('id'), 'kellie');
    return c.json({ ok: true, asset: serializeCreatorAsset(asset) });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'failed' }, 400);
  }
});

creatorAssetsRoute.post('/:id/reject-public-use', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    const asset = await rejectPublicUse(
      c.req.param('id'),
      typeof body?.reason === 'string' ? body.reason : null,
    );
    return c.json({ ok: true, asset: serializeCreatorAsset(asset) });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'failed' }, 400);
  }
});

creatorAssetsRoute.patch('/:id', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    if (typeof body?.role === 'string' && isCreatorAssetRole(body.role)) {
      const asset = await updateCreatorAssetRole(c.req.param('id'), body.role);
      return c.json({ ok: true, asset: serializeCreatorAsset(asset) });
    }
    return c.json({ error: 'nothing to update' }, 400);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'failed' }, 400);
  }
});

creatorAssetsRoute.post('/:id/assign', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const mediaKitId = typeof body?.mediaKitId === 'string' ? body.mediaKitId : null;
  if (!mediaKitId) return c.json({ error: 'mediaKitId required' }, 400);
  try {
    await assignAssetToMediaKit({
      mediaKitId,
      creatorAssetId: c.req.param('id'),
      placement: typeof body?.placement === 'string' ? body.placement : 'gallery',
      assignedBy: 'kellie',
    });
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'failed' }, 400);
  }
});

creatorAssetsRoute.post('/:id/assign-target', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const targetsRaw = Array.isArray(body?.targets)
    ? body.targets.filter((t: unknown): t is string => typeof t === 'string')
    : typeof body?.target === 'string'
      ? [body.target]
      : [];
  const targets = targetsRaw.filter((t: string) =>
    (KIT_ASSIGN_TARGETS as readonly string[]).includes(t),
  );
  if (targets.length === 0) {
    return c.json(
      { error: 'targets must include hotel, restaurant, destination, all, and/or unassigned' },
      400,
    );
  }
  try {
    const result = await assignAssetToKitTarget({
      creatorAssetId: c.req.param('id'),
      targets: targets as KitAssignTarget[],
      assignedBy: 'kellie',
    });
    const asset = await getCreatorAsset(c.req.param('id'));
    const failed = result.rebuilt.filter((r) => r.status === 'generation_failed');
    return c.json({
      ok: failed.length === 0,
      result: {
        ...result,
        assignmentPersisted: result.assignmentPersisted,
      },
      asset: asset
        ? {
            ...serializeCreatorAsset(asset),
            assignments: result.assignments,
            displayStatus: displayPublicUseStatus({
              publicUseState: asset.publicUseState,
              assignmentCount: result.assignments.length,
            }),
          }
        : null,
      error:
        failed.length > 0
          ? `Assignment saved but kit generation failed for: ${failed
              .map((f) => f.variant)
              .join(', ')}. Kits listed as failed need retry; assignment rows are already stored.`
          : undefined,
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'failed' }, 400);
  }
});

creatorAssetsRoute.post('/:id/unassign', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const mediaKitId = typeof body?.mediaKitId === 'string' ? body.mediaKitId : null;
  if (!mediaKitId) return c.json({ error: 'mediaKitId required' }, 400);
  try {
    await unassignAssetFromMediaKit({
      mediaKitId,
      creatorAssetId: c.req.param('id'),
    });
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'failed' }, 400);
  }
});

creatorAssetsRoute.post('/:id/archive', async (c) => {
  try {
    const asset = await archiveCreatorAsset(c.req.param('id'));
    return c.json({ ok: true, asset: serializeCreatorAsset(asset) });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'failed' }, 400);
  }
});
