# Ask Benson image-attachment submit failure — 2026-08-23

## Summary

Mobile Ask Benson accepted a JPEG chip, then failed on send with:

> Benson hit a technical problem and couldn’t answer that. Please try again.

The failure was **not** empty-text validation, missing FormData bytes, the Next proxy, or a model-payload type. It was an uncaught `ReferenceError: File is not defined` in API multipart parsing on **Node 18**.

## Exact reproduced failure

Local live API (`127.0.0.1:4000`, Node v18.19.1) and dashboard proxy (`127.0.0.1:3000`):

| Case | Result |
|---|---|
| A. JSON text-only `{"message":"ping..."}` | HTTP 200, normal answer |
| B. multipart image-only (`image=@36598.jpg`) | HTTP 500, friendly technical error |
| B2. same request through Next `/api/ask-benson` | HTTP 500, same body |
| C. multipart image + text | HTTP 500, same body |

API log (`/.logs/pre-alpha/api.log`), request `adda7870-3d0d-48df-ba2c-343c601901b1`:

```
[ask-benson] unhandled error {
  requestId: 'adda7870-3d0d-48df-ba2c-343c601901b1',
  error: 'File is not defined',
  stack: 'ReferenceError: File is not defined\n' +
    '    at parseAskBensonBody (.../services/api/src/routes/ask-benson.ts:122:40)'
}
```

Line 122 was:

```ts
const file = body.image instanceof File && body.image.size > 0 ? body.image : null;
```

On Node 18, `typeof File === 'undefined'`. Evaluating `instanceof File` throws **before** image bytes are read. The route catch-all maps that to `ASK_BENSON_FRIENDLY_ERROR` (HTTP 500).

Hono `parseBody()` itself succeeded (experimental `buffer.File` warning appeared). The throw was the `instanceof File` check, not missing bytes.

## Current contract (before → after)

### Frontend payload

Unchanged. Composer already allowed image-only send.

`dashboard/components/benson-chat-panel.tsx` builds `FormData`:

- `image`: browser `File` (JPEG/PNG/WebP/GIF)
- `message`: only if `text.trim()` is non-empty (omitted for image-only)
- `pageContext`, `conversationId`, `mediaKitId`, `draftAssetId`, `contentItemId` as optional strings

No filename-only metadata path. Bytes are the File object in multipart field `image`.

Submit is enabled when text is non-empty **or** a pending image/media exists (`canSendAskBensonComposer`).

### API request

- `POST /api/ask-benson`
- `Content-Type: multipart/form-data` when an image is attached
- JSON only for text/link turns (`message` required)

### Backend resolution

**Before:** `body.image instanceof File` on Node 18 → `ReferenceError` → 500.

**After:** duck-type the upload (`size` + `arrayBuffer()`). Never reference the `File` constructor.

`materializeAskBensonImageField` → `prepareAskBensonImage` reads bytes, validates JPEG/PNG (plus existing WebP/GIF), writes a `data:` URL:

```
{
  dataUrl: 'data:image/jpeg;base64,...',
  mimeType: 'image/jpeg',
  fileSize: number,
  originalFilename: string,
  contentHash: string
}
```

Empty `message` + valid image is accepted. The inspect instruction is **model-only**, not stored as the user utterance (`(image)` is the history marker).

Invalid/missing/unsupported attachments return **HTTP 400** with a safe message and a structured log (`stage`, `code`, filename, mime, size). No bytes, data URLs, or stack traces in the client body.

### Multimodal request

`buildAskBensonVisionUserContent` emits:

- text-only: a JSON string user payload
- with image: `[{ type: 'text', text }, { type: 'image_url', image_url: { url: dataUrl, detail: 'auto' } }]`

Image-only uses `ASK_BENSON_IMAGE_INSPECT_INSTRUCTION` as the model text, not as chat history.

Flyer listing short-circuit still runs when image-only extraction actually saved/extracted rows. Empty extraction (vehicle photo) falls through to the vision model instead of a listing-failure template.

### Prior URL turn

When the new turn has an image, inherited `contentItemId` from conversation is **not** applied. Explicit request `contentItemId` (page context) is still honored.

## Files changed

- `services/core/src/ask-benson/chat-images.ts` — duck-typed upload, materialize, vision builder, follow-up id, listing short-circuit helper
- `services/core/src/ask-benson/image-attachment.test.ts` — fixture JPEG/PNG resolution tests (does not mock materialize/prepare)
- `services/core/src/ask-benson/ask.ts` — inspect instruction vs history, skip inherited content item on image, attach image on model turn, listing short-circuit only when extraction hit
- `services/core/src/ask-benson/index.ts` — exports
- `services/api/src/routes/ask-benson.ts` — multipart parse without `instanceof File`
- `dashboard/components/benson-chat-panel.tsx` — `canSendAskBensonComposer`
- `dashboard/lib/ask-benson-types.ts` — composer can-send helper
- `dashboard/lib/ask-benson-types.test.ts` — composer cases
- `dashboard/package.json` — include the types test in `test`

Not touched: Discoveries, Calendar, partnership/sponsor identity, unrelated chat/history rendering.

## Tests

### Image-attachment suite (this fix)

`node --import tsx --test src/ask-benson/image-attachment.test.ts`

**11/11 pass**

1. text-only → no image part
2. JPEG-only → accepted, multimodal image_url present
3. PNG-only → accepted
4. image + text → both in model content
5. empty text + no attachment → rejected
6. prior URL inherited content item dropped on image-only
7. invalid/missing attachment → controlled failure, no throw
8. unsupported MIME → rejected
9. arrayBuffer failure → controlled `invalid`, no throw
10. listing short-circuit off for empty image-only extraction; on for flyer extraction; off when user also typed text
11. no global `File` required

### Dashboard composer

`node --import tsx --test lib/ask-benson-types.test.ts`

**7/7 pass** (6 existing provider-copy tests + can-send)

### Existing Ask Benson `src/ask-benson/*.test.ts`

**224 pass / 3 fail / 227 total**

The 3 failures are in `url-intake-qualification` (listing-host token cases). That file was not modified in this task. Treated as **pre-existing / out of scope**.

## Proof notes

- Image-only JPEG/PNG reach `prepareAskBensonImage` and the vision content builder with real fixture bytes (not a mocked resolver).
- Image + text both appear in the constructed user content.
- Text-only Ask Benson still worked on the live API before the fix (HTTP 200) and is unchanged in JSON parsing.
- Tests do not call `askBenson()` against live OpenAI/Postgres, so they do not create event/partnership/sponsor rows.
- Live image curl was only used **before** the fix to capture the 500; it was not repeated after the fix to avoid image-intake collection writes.

## Error handling

- Uncaught `File is not defined` is gone for the image field.
- Multipart parse errors → 400, log `stage: 'multipart_parse'`
- Image resolve errors → 400, log `stage: 'image_resolve'` with `code`, filename, mime, size
- Unexpected errors still return the friendly 500 string with `requestId` (no stack to the client)

## Out of scope (observed, not changed)

- `body.audio instanceof File` on `/transcribe` would have the same Node 18 bug. Not part of this image-submit fix.
- Image collection can still persist flyer listings when extraction returns rows (existing flyer path).
- Running API process must be restarted to pick up the route change.
