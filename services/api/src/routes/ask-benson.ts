import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  askBenson,
  getBensonConversation,
  getBensonConversationMessages,
  listBensonConversations,
  patchBensonConversation,
  isAskBensonImageUpload,
  materializeAskBensonImageField,
  recordChatFeedback,
  saveConciergePick,
} from '@social-agent/core/ask-benson';
import { ASK_BENSON_FRIENDLY_ERROR } from '@social-agent/core/ask-benson/serialize-context';
import { FEEDBACK_REASON_CODES } from '@social-agent/core/pre-alpha';
import { createCreatorAsset, isCreatorAssetRole, serializeCreatorAsset } from '@social-agent/core/creator-assets';
import {
  inferCreatorAssetRoleFromMessage,
  pendingCreatorAssetResponse,
  shouldTreatImageAsCreatorAsset,
} from '@social-agent/core/ask-benson';
import { transcribeAudioBlob } from '@social-agent/core/intake';
import { resolveOperatorCreatorId } from '@social-agent/core/tiktok-operator';

export const askBensonRoute = new Hono();

askBensonRoute.get('/conversations', async (c) => {
  try {
    const creatorId = await resolveOperatorCreatorId();
    const limit = Number(c.req.query('limit') ?? '30');
    const cursor = c.req.query('cursor');
    const result = await listBensonConversations({
      creatorId,
      limit: Number.isFinite(limit) ? limit : 30,
      cursor,
    });
    return c.json({ ok: true, conversations: result.items, items: result.items, nextCursor: result.nextCursor });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list conversations';
    return c.json({ ok: false, error: message }, 400);
  }
});

askBensonRoute.get('/conversations/:id', async (c) => {
  try {
    const creatorId = await resolveOperatorCreatorId();
    const conversation = await getBensonConversation(creatorId, c.req.param('id'));
    if (!conversation) return c.json({ ok: false, error: 'Conversation not found' }, 404);
    return c.json({ ok: true, conversation });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load conversation';
    return c.json({ ok: false, error: message }, 400);
  }
});

askBensonRoute.get('/conversations/:id/messages', async (c) => {
  try {
    const creatorId = await resolveOperatorCreatorId();
    const limit = Number(c.req.query('limit') ?? '100');
    const cursor = c.req.query('cursor');
    const result = await getBensonConversationMessages({
      creatorId,
      conversationId: c.req.param('id'),
      limit: Number.isFinite(limit) ? limit : 100,
      cursor,
    });
    if (!result.conversation) return c.json({ ok: false, error: 'Conversation not found' }, 404);
    return c.json({
      ok: true,
      conversation: result.conversation,
      messages: result.items,
      items: result.items,
      nextCursor: result.nextCursor,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load messages';
    return c.json({ ok: false, error: message }, 400);
  }
});

askBensonRoute.patch('/conversations/:id', async (c) => {
  try {
    const creatorId = await resolveOperatorCreatorId();
    const body = z
      .object({
        title: z.string().min(1).max(200).optional(),
        lastOpened: z.boolean().optional(),
      })
      .parse(await c.req.json());
    const conversation = await patchBensonConversation({
      creatorId,
      conversationId: c.req.param('id'),
      title: body.title,
      lastOpenedAt: body.lastOpened ? new Date() : undefined,
    });
    if (!conversation) return c.json({ ok: false, error: 'Conversation not found' }, 404);
    return c.json({ ok: true, conversation });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update conversation';
    return c.json({ ok: false, error: message }, 400);
  }
});

async function parseAskBensonBody(c: {
  req: {
    header: (name: string) => string | undefined;
    parseBody: () => Promise<Record<string, string | unknown>>;
    json: () => Promise<unknown>;
  };
}) {
  const contentType = c.req.header('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    let body: Record<string, string | unknown>;
    try {
      body = await c.req.parseBody();
    } catch (err) {
      console.error('[ask-benson] multipart parse failed', {
        stage: 'multipart_parse',
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        ok: false as const,
        status: 400 as const,
        error: 'Could not read that image. Try JPG or PNG.',
      };
    }
    const message =
      typeof body.message === 'string' && body.message.trim()
        ? body.message.trim()
        : '';
    const pageContext = typeof body.pageContext === 'string' ? body.pageContext : undefined;
    const conversationId =
      typeof body.conversationId === 'string' ? body.conversationId : undefined;
    const mediaKitId = typeof body.mediaKitId === 'string' ? body.mediaKitId : undefined;
    const draftAssetId = typeof body.draftAssetId === 'string' ? body.draftAssetId : undefined;
    const contentItemId = typeof body.contentItemId === 'string' ? body.contentItemId : undefined;
    const creatorAssetRole =
      typeof body.creatorAssetRole === 'string' ? body.creatorAssetRole : undefined;
    // Default true for image uploads: durable draft storage, never public until Kellie approves.
    const saveAsCreatorAsset =
      body.saveAsCreatorAsset === 'false' || body.saveAsCreatorAsset === '0'
        ? false
        : true;

    let image = null;
    if (body.image != null && body.image !== '') {
      const resolved = await materializeAskBensonImageField(body.image);
      if (!resolved.ok) {
        console.error('[ask-benson] image resolve failed', {
          stage: 'image_resolve',
          code: resolved.code,
          filename: isAskBensonImageUpload(body.image) ? body.image.name : undefined,
          mime: isAskBensonImageUpload(body.image) ? body.image.type : typeof body.image,
          size: isAskBensonImageUpload(body.image) ? body.image.size : undefined,
        });
        return { ok: false as const, status: 400 as const, error: resolved.error };
      }
      image = resolved.image;
    }

    if (!message && !image) {
      return { ok: false as const, status: 400 as const, error: 'message or image is required' };
    }

    return {
      ok: true as const,
      input: {
        message,
        pageContext,
        conversationId,
        mediaKitId,
        draftAssetId,
        contentItemId,
        image: image ?? null,
        saveAsCreatorAsset,
        creatorAssetRole,
      },
    };
  }

  const body = (await c.req.json()) as {
    message?: string;
    pageContext?: string;
    conversationId?: string;
    mediaKitId?: string;
    draftAssetId?: string;
    contentItemId?: string;
  };

  const message = body.message?.trim() ?? '';
  if (!message) {
    return { ok: false as const, status: 400 as const, error: 'message is required' };
  }

  return {
    ok: true as const,
    input: {
      message,
      pageContext: body.pageContext,
      conversationId: body.conversationId,
      mediaKitId: body.mediaKitId,
      draftAssetId: body.draftAssetId,
      contentItemId: body.contentItemId,
      image: null,
    },
  };
}

askBensonRoute.post('/', async (c) => {
  try {
    const parsed = await parseAskBensonBody(c);
    if (!parsed.ok) {
      return c.json({ ok: false, error: parsed.error }, parsed.status);
    }

    const message =
      'message' in parsed.input && typeof parsed.input.message === 'string'
        ? parsed.input.message
        : '';
    const image = parsed.input.image;
    const saveFlag =
      'saveAsCreatorAsset' in parsed.input ? parsed.input.saveAsCreatorAsset !== false : false;
    const treatAsCreatorAsset =
      Boolean(image) && saveFlag && shouldTreatImageAsCreatorAsset(message);

    // Creator-asset photo path: persist first, answer from that state, never claim a kit update,
    // and do not run OCR / URL intake / LLM on the same turn.
    if (treatAsCreatorAsset && image) {
      const conversationId =
        typeof parsed.input.conversationId === 'string' && parsed.input.conversationId
          ? parsed.input.conversationId
          : randomUUID();
      try {
        const dataUrl = image.dataUrl;
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl;
        const buffer = Buffer.from(base64, 'base64');
        const roleRaw =
          'creatorAssetRole' in parsed.input && typeof parsed.input.creatorAssetRole === 'string'
            ? parsed.input.creatorAssetRole
            : inferCreatorAssetRoleFromMessage(message, image.originalFilename);
        const asset = await createCreatorAsset({
          buffer,
          originalFilename: image.originalFilename,
          claimedMime: image.mimeType,
          role: isCreatorAssetRole(roleRaw) ? roleRaw : 'other',
          source: 'ask_benson',
          requestPublicUse: true,
        });
        const creatorAsset = serializeCreatorAsset(asset);
        const result = pendingCreatorAssetResponse({
          conversationId,
          messageId: null,
          publicUseState: asset.publicUseState,
          role: asset.role,
          originalFilename: asset.originalFilename,
        });
        return c.json({
          ...result,
          creatorAsset,
          creatorAssetNote: result.answer,
        });
      } catch (assetErr) {
        const detail = assetErr instanceof Error ? assetErr.message : String(assetErr);
        console.error('[ask-benson] creator-asset save failed', assetErr);
        return c.json(
          {
            ok: false,
            answer: '',
            evidence: [],
            suggestedActions: [],
            usedData: [],
            confidence: 0,
            conversationId,
            messageId: null,
            cached: false,
            tokenUsage: null,
            estimatedCost: null,
            error: `Could not save that photo privately: ${detail}. Nothing was added to a media kit.`,
          },
          400,
        );
      }
    }

    const result = await askBenson(parsed.input);

    if (!result.ok) {
      const status = result.error?.includes('OPENAI_API_KEY') ? 503 : 400;
      return c.json(result, status);
    }

    return c.json({
      ...result,
      creatorAsset: null,
      creatorAssetNote: undefined,
    });
  } catch (err) {
    const requestId = randomUUID();
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[ask-benson] unhandled error', {
      requestId,
      stage: 'unhandled',
      error: errMsg,
      stack: err instanceof Error ? err.stack : undefined,
    });
    const status = err instanceof Error && err.message.includes('OPENAI_API_KEY') ? 503 : 500;
    return c.json(
      {
        ok: false,
        error: ASK_BENSON_FRIENDLY_ERROR,
        requestId,
      },
      status,
    );
  }
});

const ConciergePickSchema = z.object({
  pickId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  eventDate: z.string().nullable().optional(),
  eventDateLabel: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  origin: z.enum(['inventory', 'web']),
  contentItemId: z.string().nullable().optional(),
  reviewUrl: z.string().nullable().optional(),
  plannerState: z.enum(['none', 'saved', 'planned_today']).optional(),
});

askBensonRoute.post('/save-pick', async (c) => {
  try {
    const body = z
      .object({
        pick: ConciergePickSchema,
        action: z.enum(['save', 'plan_today']),
      })
      .parse(await c.req.json());

    const result = await saveConciergePick({
      pick: {
        pickId: body.pick.pickId,
        title: body.pick.title,
        summary: body.pick.summary ?? null,
        location: body.pick.location ?? null,
        eventDate: body.pick.eventDate ?? null,
        eventDateLabel: body.pick.eventDateLabel ?? null,
        sourceUrl: body.pick.sourceUrl ?? null,
        origin: body.pick.origin,
        contentItemId: body.pick.contentItemId ?? null,
        reviewUrl: body.pick.reviewUrl ?? null,
        plannerState:
          body.action === 'plan_today'
            ? 'planned_today'
            : body.action === 'save'
              ? 'saved'
              : 'none',
      },
      action: body.action,
    });

    return c.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save pick failed';
    return c.json({ ok: false, error: message }, 400);
  }
});

askBensonRoute.post('/feedback', async (c) => {
  try {
    const body = z
      .object({
        messageId: z.string().uuid(),
        sentiment: z.enum(['up', 'down']),
        reasonCode: z.enum(FEEDBACK_REASON_CODES).optional(),
        comment: z.string().max(500).optional(),
      })
      .parse(await c.req.json());

    const result = await recordChatFeedback({
      messageId: body.messageId,
      sentiment: body.sentiment,
      reasonCode: body.reasonCode,
      comment: body.comment,
    });

    return c.json({ ok: true, feedback: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Feedback failed';
    return c.json({ ok: false, error: message }, 400);
  }
});

const VOICE_TRANSCRIBE_MAX_BYTES = 12 * 1024 * 1024;

askBensonRoute.post('/transcribe', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.audio instanceof File ? body.audio : null;
    if (!file || file.size === 0) {
      return c.json({ ok: false, error: 'audio is required' }, 400);
    }
    if (file.size > VOICE_TRANSCRIBE_MAX_BYTES) {
      return c.json({ ok: false, error: 'audio_too_large' }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await transcribeAudioBlob(buffer, {
      filename: file.name || 'voice-note.webm',
      mimeType: file.type || 'audio/webm',
    });

    if (!result.text.trim()) {
      return c.json({ ok: false, error: 'empty_transcript' }, 400);
    }

    return c.json({ ok: true, text: result.text.trim(), language: result.language });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed';
    const status = message.includes('OPENAI_API_KEY') ? 503 : 500;
    return c.json({ ok: false, error: message }, status);
  }
});
