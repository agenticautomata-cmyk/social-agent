import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FORBIDDEN_PENDING_KIT_CLAIMS,
  inferCreatorAssetRoleFromMessage,
  isExplicitImageReadRequest,
  pendingCreatorAssetAnswer,
  shouldTreatImageAsCreatorAsset,
} from './creator-asset-intake.js';

describe('creator-asset Ask Benson intake', () => {
  it('treats a bare photo upload as a creator asset, not OCR', () => {
    assert.equal(shouldTreatImageAsCreatorAsset(''), true);
    assert.equal(shouldTreatImageAsCreatorAsset('here is my headshot'), true);
    assert.equal(isExplicitImageReadRequest('please OCR this flyer'), true);
    assert.equal(shouldTreatImageAsCreatorAsset('please OCR this flyer'), false);
  });

  it('infers headshot role from the message', () => {
    assert.equal(inferCreatorAssetRoleFromMessage('my new headshot'), 'headshot');
    assert.equal(inferCreatorAssetRoleFromMessage('logo for brand'), 'hero');
  });

  it('answers from pending persisted state and never claims a kit update', () => {
    const built = pendingCreatorAssetAnswer({
      publicUseState: 'pending_public_use',
      role: 'headshot',
      originalFilename: 'kellie-headshot.jpg',
    });
    assert.match(built.answer, /waiting for approval/i);
    assert.match(built.answer, /not on any media kit/i);
    assert.ok(built.suggestedActions.some((a) => a.includes('/creator-assets')));
    for (const claim of FORBIDDEN_PENDING_KIT_CLAIMS) {
      assert.doesNotMatch(built.answer, new RegExp(claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    }
  });

  it('does not inherit stale Scheels/URL OCR language into the pending reply', () => {
    const built = pendingCreatorAssetAnswer({
      publicUseState: 'pending_public_use',
      role: 'other',
      originalFilename: 'photo.jpg',
    });
    assert.doesNotMatch(built.answer, /scheels/i);
    assert.doesNotMatch(built.answer, /ocr/i);
    assert.doesNotMatch(built.answer, /extracted/i);
  });
});
