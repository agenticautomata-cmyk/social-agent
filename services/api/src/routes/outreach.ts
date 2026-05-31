import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '@social-agent/core';
import {
  listEmailTemplates,
  listOutreachEmails,
  getOutreachEmail,
  createOutreachDraft,
  renderOutreachFromTemplate,
  previewOutreachEmail,
  updateOutreachDraft,
  scheduleOutreachEmail,
  approveOutreachEmail,
  cancelOutreachEmail,
  simulateSendOutreachEmail,
  sendOutreachEmail,
  getOutreachSendConfig,
  enrichOutreachEmails,
} from '@social-agent/core/sponsor-outreach';

export const outreachRoute = new Hono();

outreachRoute.get('/send-config', (c) => {
  const config = getOutreachSendConfig();
  return c.json({
    ...config,
    demoMode: env.DEMO_MODE,
  });
});

outreachRoute.get('/templates', async (c) => {
  const templates = await listEmailTemplates(true);
  return c.json({ templates });
});

outreachRoute.post('/preview', async (c) => {
  const body = await c.req.json();
  const schema = z.object({
    sponsorContactId: z.string().uuid(),
    templateId: z.string().uuid(),
    mediaKitId: z.string().uuid().nullable().optional(),
    customSubject: z.string().optional(),
    customBody: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  try {
    const rendered = await renderOutreachFromTemplate(parsed.data);
    return c.json({ preview: rendered });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Preview failed';
    return c.json({ error: message }, 400);
  }
});

outreachRoute.get('/emails', async (c) => {
  const view = (c.req.query('view') ?? 'all') as 'queue' | 'scheduled' | 'history' | 'all';
  const emails = await listOutreachEmails(view);
  const enriched = await enrichOutreachEmails(emails);
  const sendConfig = getOutreachSendConfig();
  return c.json({
    emails: enriched,
    demoMode: env.DEMO_MODE,
    sendMode: sendConfig.mode,
    liveSendReady: sendConfig.liveReady,
  });
});

outreachRoute.get('/emails/:id', async (c) => {
  const email = await getOutreachEmail(c.req.param('id'));
  if (!email) return c.json({ error: 'not found' }, 404);
  const [enriched] = await enrichOutreachEmails([email]);
  return c.json({ email: enriched });
});

const DraftSchema = z.object({
  sponsorContactId: z.string().uuid(),
  mediaKitId: z.string().uuid().nullable().optional(),
  templateId: z.string().uuid().nullable().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
});

outreachRoute.post('/emails', async (c) => {
  const body = await c.req.json();
  const parsed = DraftSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  try {
    const email = await createOutreachDraft(parsed.data);
    return c.json({ email }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create draft';
    return c.json({ error: message }, 400);
  }
});

outreachRoute.put('/emails/:id', async (c) => {
  const body = await c.req.json();
  const schema = z.object({
    subject: z.string().optional(),
    body: z.string().optional(),
    mediaKitId: z.string().uuid().nullable().optional(),
    templateId: z.string().uuid().nullable().optional(),
    sponsorContactId: z.string().uuid().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  try {
    const email = await updateOutreachDraft(c.req.param('id'), parsed.data);
    return c.json({ email });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return c.json({ error: message }, 400);
  }
});

outreachRoute.post('/emails/:id/preview', async (c) => {
  try {
    const email = await previewOutreachEmail(c.req.param('id'));
    return c.json({ email, previewConfirmed: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Preview failed';
    return c.json({ error: message }, 400);
  }
});

outreachRoute.post('/emails/:id/schedule', async (c) => {
  const body = await c.req.json();
  const schema = z.object({ scheduledSendAt: z.string() });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  try {
    const email = await scheduleOutreachEmail(c.req.param('id'), parsed.data.scheduledSendAt);
    return c.json({ email });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Schedule failed';
    return c.json({ error: message }, 400);
  }
});

outreachRoute.post('/emails/:id/approve', async (c) => {
  try {
    const email = await approveOutreachEmail(c.req.param('id'));
    return c.json({ email });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Approve failed';
    return c.json({ error: message }, 400);
  }
});

outreachRoute.post('/emails/:id/cancel', async (c) => {
  try {
    const email = await cancelOutreachEmail(c.req.param('id'));
    return c.json({ email });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cancel failed';
    return c.json({ error: message }, 400);
  }
});

outreachRoute.post('/emails/:id/send', async (c) => {
  const config = getOutreachSendConfig();
  if (config.mode === 'live' && !config.liveReady) {
    return c.json(
      {
        error: 'live_send_not_configured',
        message: 'Live send is enabled but Resend is not fully configured',
        missing: config.missingForLive,
      },
      503,
    );
  }

  try {
    const result = await sendOutreachEmail(c.req.param('id'));
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    return c.json({ error: message }, 400);
  }
});

outreachRoute.post('/emails/:id/simulate-send', async (c) => {
  const config = getOutreachSendConfig();
  if (config.mode === 'live') {
    return c.json(
      {
        error: 'simulate_disabled',
        message: 'Live send is enabled — use POST /send instead of simulate-send',
      },
      403,
    );
  }

  try {
    const result = await simulateSendOutreachEmail(c.req.param('id'));
    return c.json({ ...result, mode: 'simulate' as const });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Simulate send failed';
    return c.json({ error: message }, 400);
  }
});
