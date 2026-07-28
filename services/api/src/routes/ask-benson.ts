import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { askBenson, saveConciergePick, recordChatFeedback } from '@social-agent/core/ask-benson';
import { prepareAskBensonImage } from '@social-agent/core/ask-benson';
import { ASK_BENSON_FRIENDLY_ERROR } from '@social-agent/core/ask-benson/serialize-context';
import { FEEDBACK_REASON_CODES } from '@social-agent/core/pre-alpha';
import { transcribeAudioBlob } from '@social-agent/core/intake';

export const askBensonRoute = new Hono();

const DEFAULT_IMAGE_PROMPT =
  "What's in this image? Tell me what you see and how it fits my content or sponsor strategy.";

async function parseAskBensonBody(c: {
  req: {
    header: (name: string) => string | undefined;
    parseBody: () => Promise<Record<string, string | File>>;
    json: () => Promise<unknown>;
  };
}) {
  const contentType = c.req.header('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody();
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
    const file = body.image instanceof File && body.image.size > 0 ? body.image : null;

    let image;
    if (file) {
      try {
        image = await prepareAskBensonImage(file);
      } catch (err) {
        return {
          ok: false as const,
          status: 400 as const,
          error: err instanceof Error ? err.message : 'Invalid image',
        };
      }
    }

    if (!message && !image) {
      return { ok: false as const, status: 400 as const, error: 'message or image is required' };
    }

    return {
      ok: true as const,
      input: {
        message: message || DEFAULT_IMAGE_PROMPT,
        pageContext,
        conversationId,
        mediaKitId,
        draftAssetId,
        contentItemId,
        image: image ?? null,
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

    const result = await askBenson(parsed.input);

    if (!result.ok) {
      const status = result.error?.includes('OPENAI_API_KEY') ? 503 : 400;
      return c.json(result, status);
    }

    return c.json(result);
  } catch (err) {
    const requestId = randomUUID();
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[ask-benson] unhandled error', {
      requestId,
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
