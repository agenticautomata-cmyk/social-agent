import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '@social-agent/core';
import {
  buildGmailOAuthStart,
  disconnectGmail,
  getGmailConnectionStatus,
  handleGmailOAuthCallback,
} from '@social-agent/core/gmail-oauth';
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
  listOutreachAwaitingApproval,
  listFormOnlyOutreach,
  updateOutreachApprovalDraft,
  approveAndScheduleOutreach,
  markOutreachSentViaContactForm,
} from '@social-agent/core/sponsor-outreach';
import {
  draftSponsorOutreachFromOpportunity,
  regenerateOutreachApprovalDraft,
  runBensonOutreachDraftingBatch,
} from '@social-agent/core/sponsor-outreach/benson-drafting';
import {
  countUnreadByCategory,
  countUnreadInboundMessages,
  getGmailInboxSyncStatus,
  listUnifiedInboxMessages,
  markInboundMessageRead,
  reclassifyRecentInboundEmail,
  runGmailTelegramDigest,
  syncGmailOutreachReplies,
  promoteDigestToOpportunity,
  promoteDigestToFollowUp,
  dismissDigestMessage,
} from '@social-agent/core/gmail-inbox';
import type { InboxFilterCategory } from '@social-agent/core/gmail-inbox';

const DASHBOARD_BASE =
  process.env.DASHBOARD_PUBLIC_URL?.replace(/\/$/, '') ??
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
  'http://localhost:3000';

export const outreachRoute = new Hono();

outreachRoute.get('/send-config', async (c) => {
  const config = await getOutreachSendConfig();
  return c.json({
    ...config,
    demoMode: env.DEMO_MODE,
  });
});

outreachRoute.get('/gmail/status', async (c) => {
  const status = await getGmailConnectionStatus();
  return c.json({ ...status, demoMode: env.DEMO_MODE });
});

outreachRoute.get('/gmail/oauth/start', async (c) => {
  const result = await buildGmailOAuthStart();
  if (result.mode === 'error') {
    return c.json(result, 503);
  }
  if (c.req.query('format') === 'json') {
    return c.json({ authorizationUrl: result.authorizationUrl, state: result.state });
  }
  return c.redirect(result.authorizationUrl);
});

outreachRoute.get('/gmail/oauth/callback', async (c) => {
  const result = await handleGmailOAuthCallback({
    code: c.req.query('code'),
    state: c.req.query('state'),
    error: c.req.query('error'),
    error_description: c.req.query('error_description'),
  });

  const redirectBase = `${DASHBOARD_BASE}/email/settings`;
  if (!result.ok) {
    return c.redirect(`${redirectBase}?gmail=error&message=${encodeURIComponent(result.error)}`);
  }
  return c.redirect(`${redirectBase}?gmail=connected&email=${encodeURIComponent(result.email)}`);
});

outreachRoute.post('/gmail/disconnect', async (c) => {
  const result = await disconnectGmail();
  return c.json(result);
});

outreachRoute.get('/inbox', async (c) => {
  const categoryRaw = c.req.query('category');
  const category = (categoryRaw || undefined) as InboxFilterCategory | undefined;
  const [messages, unreadByCategory, sponsorUnread, syncStatus] = await Promise.all([
    listUnifiedInboxMessages({ limit: 100, category: category ?? null }),
    countUnreadByCategory(),
    countUnreadInboundMessages(),
    getGmailInboxSyncStatus(),
  ]);
  return c.json({
    messages,
    unreadCount: sponsorUnread,
    unreadByCategory,
    syncStatus,
    demoMode: env.DEMO_MODE,
  });
});

outreachRoute.post('/inbox/reclassify', async (c) => {
  const result = await reclassifyRecentInboundEmail();
  return c.json({ ok: true, ...result });
});

outreachRoute.post('/inbox/:id/read', async (c) => {
  const ok = await markInboundMessageRead(c.req.param('id'));
  if (!ok) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

outreachRoute.post('/inbox/sync', async (c) => {
  const result = await syncGmailOutreachReplies();
  return c.json(result);
});

outreachRoute.post('/inbox/digest', async (c) => {
  const result = await runGmailTelegramDigest();
  return c.json(result);
});

outreachRoute.post('/inbox/:gmailMessageId/promote-opportunity', async (c) => {
  const result = await promoteDigestToOpportunity(c.req.param('gmailMessageId'));
  if (!result.ok) return c.json(result, 400);
  return c.json(result);
});

outreachRoute.post('/inbox/:gmailMessageId/promote-follow-up', async (c) => {
  const result = await promoteDigestToFollowUp(c.req.param('gmailMessageId'));
  if (!result.ok) return c.json(result, 400);
  return c.json(result);
});

outreachRoute.post('/inbox/:gmailMessageId/dismiss', async (c) => {
  const result = await dismissDigestMessage(c.req.param('gmailMessageId'));
  return c.json(result);
});

outreachRoute.get('/approvals', async (c) => {
  const emails = await listOutreachAwaitingApproval();
  const enriched = await enrichOutreachEmails(emails);
  const sendConfig = await getOutreachSendConfig();
  return c.json({
    emails: enriched,
    demoMode: env.DEMO_MODE,
    sendMode: sendConfig.mode,
    liveSendReady: sendConfig.liveReady,
  });
});

outreachRoute.get('/form-packets', async (c) => {
  const emails = await listFormOnlyOutreach();
  const enriched = await enrichOutreachEmails(emails);
  return c.json({ emails: enriched });
});

outreachRoute.put('/approvals/:id', async (c) => {
  const body = await c.req.json();
  const parsed = z
    .object({
      subject: z.string().optional(),
      body: z.string().optional(),
      mediaKitId: z.string().uuid().nullable().optional(),
    })
    .safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  try {
    const email = await updateOutreachApprovalDraft(c.req.param('id'), parsed.data);
    return c.json({ email });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return c.json({ error: message }, 400);
  }
});

outreachRoute.post('/approvals/:id/approve', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = z.object({ scheduledSendAt: z.string().optional() }).safeParse(body);

  try {
    const email = await approveAndScheduleOutreach(
      c.req.param('id'),
      parsed.success ? parsed.data.scheduledSendAt : undefined,
    );
    return c.json({ email });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Approve failed';
    return c.json({ error: message }, 400);
  }
});

outreachRoute.post('/approvals/:id/reject', async (c) => {
  try {
    const email = await cancelOutreachEmail(c.req.param('id'));
    return c.json({ email });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reject failed';
    return c.json({ error: message }, 400);
  }
});

outreachRoute.post('/approvals/:id/regenerate', async (c) => {
  try {
    const email = await regenerateOutreachApprovalDraft(c.req.param('id'));
    const [enriched] = await enrichOutreachEmails([email]);
    return c.json({ email: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Regenerate failed';
    return c.json({ error: message }, 400);
  }
});

outreachRoute.post('/approvals/:id/mark-contact-form-sent', async (c) => {
  try {
    const result = await markOutreachSentViaContactForm(c.req.param('id'));
    const [enriched] = await enrichOutreachEmails([result.email]);
    return c.json({ email: enriched, attempt: result.attempt });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Mark contact-form sent failed';
    return c.json({ error: message }, 400);
  }
});

outreachRoute.post('/benson/draft', async (c) => {
  const body = await c.req.json();
  const parsed = z
    .object({
      contentItemId: z.string().uuid().optional(),
      contentItemIds: z.array(z.string().uuid()).optional(),
      limit: z.number().int().positive().optional(),
    })
    .safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  try {
    if (parsed.data.contentItemId) {
      const result = await draftSponsorOutreachFromOpportunity(parsed.data.contentItemId);
      return c.json(result);
    }
    const batch = await runBensonOutreachDraftingBatch({
      limit: parsed.data.limit,
      contentItemIds: parsed.data.contentItemIds,
    });
    return c.json(batch);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Draft failed';
    return c.json({ error: message }, 400);
  }
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
  const sendConfig = await getOutreachSendConfig();
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
  const config = await getOutreachSendConfig();
  if (config.mode === 'live' && !config.liveReady) {
    return c.json(
      {
        error: 'live_send_not_configured',
        message: 'Live send is enabled but email provider is not fully configured',
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
  const config = await getOutreachSendConfig();
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
