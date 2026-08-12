import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '@social-agent/core';
import {
  buildGoogleCalendarOAuthStart,
  disconnectGoogleCalendar,
  ensureDedicatedBensonCalendar,
  exportCalendarItemToGoogle,
  fetchGoogleBusyBlocks,
  getGoogleCalendarConnectionStatus,
  handleGoogleCalendarOAuthCallback,
  removeFromGoogleCalendar,
  retryGoogleCalendarProvisioning,
  syncBensonCalendarToGoogle,
  updateGoogleCalendarEvent,
  detectConflicts,
} from '@social-agent/core/google-calendar-oauth';
import {
  CALENDAR_ITEM_TYPES,
  CALENDAR_PLANNING_STATUSES,
  CREATOR_ACTIONS,
  canExportToGoogle,
  computeWeekendThingsToDo,
  confirmCalendarItem,
  createCalendarItem,
  deleteCalendarItem,
  getCalendarItem,
  listCalendarItems,
  markCalendarItemMissed,
  setWeekendListMembership,
  updateCalendarItem,
  type CalendarItemType,
  type CalendarPlanningStatus,
} from '@social-agent/core/creator-calendar';

const DASHBOARD_BASE =
  process.env.DASHBOARD_PUBLIC_URL?.replace(/\/$/, '') ??
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
  'http://localhost:3000';

export const calendarRoute = new Hono();

calendarRoute.get('/status', async (c) => {
  const google = await getGoogleCalendarConnectionStatus();
  return c.json({ ok: true, google, demoMode: env.DEMO_MODE });
});

/** Curated Things To Do This Weekend in KC — durable inventory + planner Weekend board. */
calendarRoute.get('/weekend-things-to-do', async (c) => {
  const result = await computeWeekendThingsToDo();
  return c.json({ ok: true, demoMode: env.DEMO_MODE, ...result });
});

calendarRoute.post('/weekend-things-to-do/:contentItemId', async (c) => {
  const contentItemId = c.req.param('contentItemId');
  const body = z.object({ selected: z.boolean() }).parse(await c.req.json());
  const result = await setWeekendListMembership(contentItemId, body.selected);
  return c.json({ ok: true, ...result });
});

calendarRoute.get('/items', async (c) => {
  const from = c.req.query('from') ?? undefined;
  const to = c.req.query('to') ?? undefined;
  const itemTypes = c.req.query('itemTypes')?.split(',').filter(Boolean) as CalendarItemType[] | undefined;
  const planningStatuses = c.req
    .query('planningStatuses')
    ?.split(',')
    .filter(Boolean) as CalendarPlanningStatus[] | undefined;
  const googleSynced = c.req.query('googleSynced') === 'true';
  const bensonOnly = c.req.query('bensonOnly') === 'true';
  const includeCompleted = c.req.query('includeCompleted') === 'true';
  const includeExpired = c.req.query('includeExpired') === 'true';
  const includeDismissed = c.req.query('includeDismissed') === 'true';
  const includeCancelled = c.req.query('includeCancelled') === 'true';
  const sourceRecordType = c.req.query('sourceRecordType') ?? undefined;
  const sourceRecordId = c.req.query('sourceRecordId') ?? undefined;

  const items = await listCalendarItems({
    from,
    to,
    itemTypes,
    planningStatuses,
    googleSynced,
    bensonOnly,
    includeCompleted,
    includeExpired,
    includeDismissed,
    includeCancelled,
    sourceRecordType,
    sourceRecordId,
  });
  return c.json({ ok: true, items });
});

calendarRoute.get('/items/:id', async (c) => {
  const item = await getCalendarItem(c.req.param('id'));
  if (!item) return c.json({ ok: false, error: 'Not found' }, 404);
  return c.json({ ok: true, item });
});

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  itemType: z.enum(CALENDAR_ITEM_TYPES as unknown as [string, ...string[]]),
  sourceRecordType: z.string().optional().nullable(),
  sourceRecordId: z.string().uuid().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  internalDetailUrl: z.string().optional().nullable(),
  startAt: z.string(),
  endAt: z.string().optional().nullable(),
  allDay: z.boolean().optional(),
  timezone: z.string().optional(),
  location: z.string().optional().nullable(),
  planningStatus: z.enum(CALENDAR_PLANNING_STATUSES as unknown as [string, ...string[]]).optional(),
  creatorAction: z.enum(CREATOR_ACTIONS as unknown as [string, ...string[]]).optional(),
  notes: z.string().optional().nullable(),
  contentFormat: z.string().optional().nullable(),
  travelMinutes: z.number().int().optional().nullable(),
  reminderSettings: z.record(z.unknown()).optional(),
});

calendarRoute.post('/items', async (c) => {
  const body = createSchema.parse(await c.req.json());
  const item = await createCalendarItem({
    ...body,
    itemType: body.itemType as CalendarItemType,
    planningStatus: body.planningStatus as CalendarPlanningStatus | undefined,
  });
  return c.json({ ok: true, item }, 201);
});

calendarRoute.patch('/items/:id', async (c) => {
  const body = createSchema.partial().parse(await c.req.json());
  const item = await updateCalendarItem(c.req.param('id'), {
    ...body,
    itemType: body.itemType as CalendarItemType | undefined,
    planningStatus: body.planningStatus as CalendarPlanningStatus | undefined,
  });
  if (!item) return c.json({ ok: false, error: 'Not found' }, 404);
  return c.json({ ok: true, item });
});

calendarRoute.post('/items/:id/confirm', async (c) => {
  const item = await confirmCalendarItem(c.req.param('id'));
  if (!item) return c.json({ ok: false, error: 'Not found' }, 404);
  return c.json({ ok: true, item });
});

calendarRoute.post('/items/:id/missed', async (c) => {
  const item = await markCalendarItemMissed(c.req.param('id'));
  if (!item) return c.json({ ok: false, error: 'Not found' }, 404);
  return c.json({ ok: true, item });
});

calendarRoute.delete('/items/:id', async (c) => {
  const mode = c.req.query('mode') === 'benson_and_google' ? 'benson_and_google' : 'benson_only';
  const id = c.req.param('id');
  if (mode === 'benson_and_google') {
    await removeFromGoogleCalendar(id);
  }
  const ok = await deleteCalendarItem(id, mode);
  if (!ok) return c.json({ ok: false, error: 'Not found' }, 404);
  return c.json({ ok: true });
});

calendarRoute.get('/items/:id/export-check', async (c) => {
  const item = await getCalendarItem(c.req.param('id'));
  if (!item) return c.json({ ok: false, error: 'Not found' }, 404);
  const check = canExportToGoogle(item);
  const google = await getGoogleCalendarConnectionStatus();
  return c.json({ ok: true, item, export: check, google });
});

const exportSchema = z.object({
  autoUpdateEnabled: z.boolean().optional(),
  googleReminderMinutes: z.number().int().optional(),
  destinationCalendarId: z.string().optional(),
});

calendarRoute.post('/items/:id/export-google', async (c) => {
  const body = exportSchema.parse(await c.req.json().catch(() => ({})));
  const item = await getCalendarItem(c.req.param('id'));
  if (!item) return c.json({ ok: false, error: 'Not found' }, 404);
  const check = canExportToGoogle(item);
  if (!check.ok) return c.json({ ok: false, error: check.reason }, 400);
  const google = await getGoogleCalendarConnectionStatus();
  if (!google.calendarAuthorized) {
    return c.json({ ok: false, error: 'Google Calendar authorization required' }, 403);
  }
  try {
    const result = await exportCalendarItemToGoogle(c.req.param('id'), body);
    const updated = await getCalendarItem(c.req.param('id'));
    return c.json({ ok: true, ...result, item: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Export failed';
    return c.json({ ok: false, error: msg }, 502);
  }
});

calendarRoute.post('/items/:id/update-google', async (c) => {
  try {
    await updateGoogleCalendarEvent(c.req.param('id'));
    const item = await getCalendarItem(c.req.param('id'));
    return c.json({ ok: true, item });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Update failed';
    return c.json({ ok: false, error: msg }, 502);
  }
});

calendarRoute.post('/items/:id/remove-google', async (c) => {
  try {
    await removeFromGoogleCalendar(c.req.param('id'));
    const item = await getCalendarItem(c.req.param('id'));
    return c.json({ ok: true, item });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Remove failed';
    return c.json({ ok: false, error: msg }, 502);
  }
});

calendarRoute.get('/google/status', async (c) => {
  const status = await getGoogleCalendarConnectionStatus();
  return c.json({ ...status, demoMode: env.DEMO_MODE });
});

calendarRoute.get('/google/oauth/start', async (c) => {
  const result = await buildGoogleCalendarOAuthStart();
  if (result.mode === 'error') return c.json(result, 503);
  if (c.req.query('format') === 'json') {
    return c.json({ authorizationUrl: result.authorizationUrl, state: result.state });
  }
  return c.redirect(result.authorizationUrl);
});

calendarRoute.get('/oauth/callback', async (c) => {
  const result = await handleGoogleCalendarOAuthCallback({
    code: c.req.query('code'),
    state: c.req.query('state'),
    error: c.req.query('error'),
    error_description: c.req.query('error_description'),
  });
  const redirect = new URL('/calendar/settings', DASHBOARD_BASE);
  redirect.searchParams.set(result.ok ? 'googleConnected' : 'googleError', '1');
  if (!result.ok) redirect.searchParams.set('message', result.error);
  return c.redirect(redirect.toString());
});

calendarRoute.post('/google/disconnect', async (c) => {
  await disconnectGoogleCalendar();
  return c.json({ ok: true });
});

calendarRoute.get('/google/calendars', async (c) => {
  const status = await getGoogleCalendarConnectionStatus();
  if (!status.calendarAuthorized) {
    return c.json({ ok: false, error: 'Google Calendar not connected' }, 403);
  }
  const dedicated = status.connection?.dedicatedCalendarId
    ? [{ id: status.connection.dedicatedCalendarId, name: status.connection.dedicatedCalendarName ?? 'KC Kellie — Benson', primary: false }]
    : [];
  return c.json({ ok: true, calendars: dedicated });
});

calendarRoute.post('/google/retry-provisioning', async (c) => {
  const result = await retryGoogleCalendarProvisioning();
  const status = await getGoogleCalendarConnectionStatus();
  if (!result.ok) {
    return c.json({ ok: false, error: result.error, status }, result.error.includes('not authorized') ? 403 : 502);
  }
  return c.json({ ok: true, status });
});

calendarRoute.post('/google/sync', async (c) => {
  const status = await getGoogleCalendarConnectionStatus();
  if (!status.calendarAuthorized && !status.hasValidTokens) {
    return c.json({ ok: false, error: 'Google Calendar not connected' }, 403);
  }
  try {
    const result = await syncBensonCalendarToGoogle();
    const nextStatus = await getGoogleCalendarConnectionStatus();
    return c.json({ ...result, status: nextStatus });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Calendar sync failed';
    return c.json({ ok: false, error: msg }, 502);
  }
});

calendarRoute.post('/google/dedicated-calendar', async (c) => {
  const status = await getGoogleCalendarConnectionStatus();
  if (!status.hasValidTokens) {
    return c.json({ ok: false, error: 'Google Calendar not connected' }, 403);
  }
  try {
    const result = await ensureDedicatedBensonCalendar();
    return c.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Dedicated calendar setup failed';
    return c.json({ ok: false, error: msg }, 502);
  }
});

calendarRoute.post('/conflicts', async (c) => {
  const body = z
    .object({
      startAt: z.string(),
      endAt: z.string(),
    })
    .parse(await c.req.json());
  const start = new Date(body.startAt);
  const end = new Date(body.endAt);
  const busy = await fetchGoogleBusyBlocks({ from: start, to: end });
  const conflicts = detectConflicts(start, end, busy);
  return c.json({
    ok: true,
    conflicts,
    message:
      conflicts.length > 0
        ? `This plan conflicts with an existing busy block from ${new Date(conflicts[0]!.start).toLocaleTimeString()}–${new Date(conflicts[0]!.end).toLocaleTimeString()}.`
        : null,
  });
});
