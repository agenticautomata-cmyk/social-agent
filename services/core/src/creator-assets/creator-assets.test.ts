import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sniffImageMime } from './mime-sniff.js';
import { validateCreatorAssetBytes } from './storage.js';
import { canAppearOnPublicKit, needsPublicUseDecision } from './types.js';

describe('sniffImageMime', () => {
  it('detects JPEG magic bytes', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    assert.equal(sniffImageMime(buf), 'image/jpeg');
  });

  it('detects PNG magic bytes', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    assert.equal(sniffImageMime(buf), 'image/png');
  });

  it('rejects unknown bytes', () => {
    assert.equal(sniffImageMime(Buffer.from('not an image!!')), null);
  });
});

describe('validateCreatorAssetBytes', () => {
  it('rejects mime mismatch when claimed image type disagrees with sniff', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const result = validateCreatorAssetBytes(png, 'image/jpeg');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'mime_mismatch');
  });

  it('accepts matching sniff', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const result = validateCreatorAssetBytes(png, 'image/png');
    assert.equal(result.ok, true);
  });
});

describe('public-use gates', () => {
  it('never treats draft/pending as public-kit eligible', () => {
    assert.equal(canAppearOnPublicKit('draft'), false);
    assert.equal(canAppearOnPublicKit('pending_public_use'), false);
    assert.equal(canAppearOnPublicKit('approved_public_use'), true);
    assert.equal(needsPublicUseDecision('pending_public_use'), true);
  });
});

describe('display status labels', () => {
  it('maps pending / approved / assigned / rejected', async () => {
    const { displayPublicUseStatus } = await import('./assets.js');
    assert.equal(
      displayPublicUseStatus({ publicUseState: 'pending_public_use', assignmentCount: 0 }),
      'Private/pending',
    );
    assert.equal(
      displayPublicUseStatus({ publicUseState: 'approved_public_use', assignmentCount: 0 }),
      'Approved/unassigned',
    );
    assert.equal(
      displayPublicUseStatus({ publicUseState: 'approved_public_use', assignmentCount: 2 }),
      'Approved/assigned',
    );
    assert.equal(
      displayPublicUseStatus({ publicUseState: 'rejected_public_use', assignmentCount: 0 }),
      'Rejected/archived',
    );
  });
});

describe('placementForAssetRole', () => {
  it('maps roles without dropping other', async () => {
    const { placementForAssetRole } = await import('./assets.js');
    assert.equal(placementForAssetRole('headshot'), 'headshot');
    assert.equal(placementForAssetRole('hero'), 'hero');
    assert.equal(placementForAssetRole('proof_still'), 'proof');
    assert.equal(placementForAssetRole('lifestyle'), 'gallery');
    assert.equal(placementForAssetRole('other'), 'gallery');
  });
});

describe('approve vs assign separation', () => {
  it('documents that approvePublicUse does not create assignments', async () => {
    // Structural guard: approvePublicUse source must not call assign helpers.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(path.join(process.cwd(), 'src/creator-assets/assets.ts'), 'utf8');
    const approveFn = src.slice(
      src.indexOf('export async function approvePublicUse'),
      src.indexOf('export async function rejectPublicUse'),
    );
    assert.equal(approveFn.includes('assignAssetToMediaKit'), false);
    assert.equal(approveFn.includes('assignAssetToKitTarget'), false);
    assert.equal(approveFn.includes('mediaKitAssetAssignments'), false);
  });
});
