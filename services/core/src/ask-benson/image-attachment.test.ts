import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ASK_BENSON_IMAGE_INSPECT_INSTRUCTION,
  buildAskBensonVisionUserContent,
  isAskBensonImageUpload,
  materializeAskBensonImageField,
  prepareAskBensonImage,
  resolveAskBensonFollowUpContentItemId,
  shouldUseImageListingShortCircuit,
} from './chat-images.js';

const JPEG_1X1 = Buffer.from('ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f00bf8001ffd9', 'hex');
const PNG_1X1 = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');

function uploadFrom(buffer: Buffer, name: string, type: string) {
  return {
    name,
    type,
    size: buffer.length,
    arrayBuffer: async () =>
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
}

describe('Ask Benson image attachment resolution', () => {
  it('does not depend on a global File constructor', () => {
    const FileBackup = globalThis.File;
    // @ts-expect-error Node 18 has no File; tests must survive that.
    delete (globalThis as { File?: unknown }).File;
    try {
      assert.equal(typeof File, 'undefined');
      const value = uploadFrom(JPEG_1X1, '36598.jpg', 'image/jpeg');
      assert.equal(isAskBensonImageUpload(value), true);
    } finally {
      if (FileBackup) globalThis.File = FileBackup;
    }
  });

  it('1. text-only request has no image part', () => {
    const content = buildAskBensonVisionUserContent({
      text: JSON.stringify({ question: 'what should I post next?' }),
    });
    assert.equal(typeof content, 'string');
    assert.match(String(content), /what should I post next/);
  });

  it('2. JPEG-only is accepted and reaches the multimodal builder', async () => {
    const resolved = await materializeAskBensonImageField(
      uploadFrom(JPEG_1X1, '36598.jpg', 'image/jpeg'),
    );
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.equal(resolved.image.mimeType, 'image/jpeg');
    assert.match(resolved.image.dataUrl, /^data:image\/jpeg;base64,/);
    const content = buildAskBensonVisionUserContent({
      text: ASK_BENSON_IMAGE_INSPECT_INSTRUCTION,
      imageDataUrl: resolved.image.dataUrl,
    });
    assert.equal(Array.isArray(content), true);
    if (!Array.isArray(content)) return;
    assert.equal(content[0]?.type, 'text');
    assert.equal(content[1]?.type, 'image_url');
    assert.equal(
      content[1] && 'image_url' in content[1] && content[1].image_url.url,
      resolved.image.dataUrl,
    );
  });

  it('3. PNG-only is accepted', async () => {
    const resolved = await materializeAskBensonImageField(
      uploadFrom(PNG_1X1, 'shot.png', 'image/png'),
    );
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.equal(resolved.image.mimeType, 'image/png');
    const content = buildAskBensonVisionUserContent({
      text: ASK_BENSON_IMAGE_INSPECT_INSTRUCTION,
      imageDataUrl: resolved.image.dataUrl,
    });
    assert.equal(Array.isArray(content), true);
  });

  it('4. image + text both reach the model request', async () => {
    const image = await prepareAskBensonImage(uploadFrom(JPEG_1X1, 'car.jpg', 'image/jpeg'));
    const content = buildAskBensonVisionUserContent({
      text: JSON.stringify({ question: 'what vehicle is this?' }),
      imageDataUrl: image.dataUrl,
    });
    assert.equal(Array.isArray(content), true);
    if (!Array.isArray(content)) return;
    assert.match(content[0] && 'text' in content[0] ? content[0].text : '', /what vehicle is this/);
    assert.equal(content[1]?.type, 'image_url');
  });

  it('5. empty text + no attachment is rejected', async () => {
    const missing = await materializeAskBensonImageField(undefined);
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.equal(missing.code, 'missing');
  });

  it('6. prior URL turn does not replace a new image-only turn', () => {
    const inherited = 'content-item-from-scheels-url';
    const resolved = resolveAskBensonFollowUpContentItemId({
      hasImage: true,
      requestContentItemId: undefined,
      inheritedContentItemId: inherited,
    });
    assert.equal(resolved, undefined);
    const textFollowUp = resolveAskBensonFollowUpContentItemId({
      hasImage: false,
      inheritedContentItemId: inherited,
    });
    assert.equal(textFollowUp, inherited);
  });

  it('7. invalid/missing attachment is a controlled failure', async () => {
    const missing = await materializeAskBensonImageField(null);
    const invalid = await materializeAskBensonImageField('36598.jpg');
    const empty = await materializeAskBensonImageField({
      name: 'empty.jpg',
      type: 'image/jpeg',
      size: 0,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    assert.equal(missing.ok, false);
    assert.equal(invalid.ok, false);
    assert.equal(empty.ok, false);
    if (!missing.ok) assert.equal(missing.code, 'missing');
    if (!invalid.ok) assert.equal(invalid.code, 'invalid');
    if (!empty.ok) assert.equal(empty.code, 'empty');
  });

  it('8. unsupported MIME is rejected', async () => {
    const resolved = await materializeAskBensonImageField({
      name: 'notes.pdf',
      type: 'application/pdf',
      size: 12,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
    });
    assert.equal(resolved.ok, false);
    if (!resolved.ok) assert.equal(resolved.code, 'unsupported_mime');
  });

  it('9. upload/resolve failure does not throw', async () => {
    await assert.doesNotReject(async () => {
      await materializeAskBensonImageField({
        name: 'broken.jpg',
        type: 'image/jpeg',
        size: 4,
        arrayBuffer: async () => {
          throw new Error('disk read failed');
        },
      });
    });
    const resolved = await materializeAskBensonImageField({
      name: 'broken.jpg',
      type: 'image/jpeg',
      size: 4,
      arrayBuffer: async () => {
        throw new Error('disk read failed');
      },
    });
    assert.equal(resolved.ok, false);
    if (!resolved.ok) assert.equal(resolved.code, 'invalid');
  });

  it('listing short-circuit stays off for inspect-style image-only turns', () => {
    assert.equal(
      shouldUseImageListingShortCircuit({
        hasImage: true,
        userMessage: '',
        collection: { items: [], created: 0, updated: 0, extractedCount: 0 },
      }),
      false,
    );
    assert.equal(
      shouldUseImageListingShortCircuit({
        hasImage: true,
        userMessage: '',
        collection: { items: [{ title: 'Flyer event' }], created: 1, updated: 0, extractedCount: 1 },
      }),
      true,
    );
    assert.equal(
      shouldUseImageListingShortCircuit({
        hasImage: true,
        userMessage: 'what vehicle is this?',
        collection: { items: [{ title: 'Flyer event' }], created: 1, updated: 0, extractedCount: 1 },
      }),
      false,
    );
  });
});
