import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '@social-agent/core';
import {
  blockSubscriptionSender,
  createDiscoverySubscription,
  dismissSubscriptionReview,
  getDiscoverySubscription,
  listDiscoverySubscriptions,
  markSubscriptionVerifiedManually,
  sanitizeUrlForDisplay,
} from '@social-agent/core/discovery-subscriptions';

export const discoverySubscriptionsRoute = new Hono();

discoverySubscriptionsRoute.get('/', async (c) => {
  const manualOnly = c.req.query('manual') === 'true';
  const subscriptions = await listDiscoverySubscriptions({ manualOnly });
  return c.json({ ok: true, demoMode: env.DEMO_MODE, count: subscriptions.length, subscriptions });
});

const CreateSchema = z.object({
  sourceName: z.string().min(1),
  signupDomain: z.string().nullable().optional(),
  signupUrl: z.string().url().nullable().optional(),
  emailAddress: z.string().email().optional(),
  expectedSenderDomain: z.string().nullable().optional(),
});

discoverySubscriptionsRoute.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid body', issues: parsed.error.issues }, 400);
  const row = await createDiscoverySubscription(parsed.data);
  return c.json({ ok: true, subscription: row });
});

discoverySubscriptionsRoute.get('/:id/open-confirmation', async (c) => {
  const row = await getDiscoverySubscription(c.req.param('id'));
  if (!row?.confirmationLink) return c.json({ error: 'no confirmation link' }, 404);
  return c.json({
    ok: true,
    url: row.confirmationLink,
    displayUrl: sanitizeUrlForDisplay(row.confirmationLink),
    warning: 'Open only if you trust this sender and destination domain.',
  });
});

discoverySubscriptionsRoute.post('/:id/mark-verified', async (c) => {
  try {
    const row = await markSubscriptionVerifiedManually(c.req.param('id'));
    return c.json({ ok: true, subscription: row });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

discoverySubscriptionsRoute.post('/:id/dismiss', async (c) => {
  try {
    const row = await dismissSubscriptionReview(c.req.param('id'));
    return c.json({ ok: true, subscription: row });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

discoverySubscriptionsRoute.post('/:id/block-sender', async (c) => {
  try {
    const row = await blockSubscriptionSender(c.req.param('id'));
    return c.json({ ok: true, subscription: row });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

discoverySubscriptionsRoute.get('/:id', async (c) => {
  const row = await getDiscoverySubscription(c.req.param('id'));
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json({
    ok: true,
    subscription: {
      ...row,
      confirmationLinkDisplay: row.confirmationLink
        ? sanitizeUrlForDisplay(row.confirmationLink)
        : null,
    },
  });
});
